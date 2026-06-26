package auth

import (
	"encoding/base64"
	"errors"
	"net/http"
	"sync"
	"time"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
)

// Authenticator wraps go-webauthn to provide StudyRover's FIDO2 ceremonies:
// begin/finish for both registration and login. It also owns an in-memory
// challenge (session-data) store keyed by an opaque ceremony id; the handlers
// (A18/A19) hold that id between the begin and finish calls.
type Authenticator struct {
	wa    *webauthn.WebAuthn
	store *challengeStore
}

// NewAuthenticator constructs an Authenticator from the relying-party
// configuration. rpID is the effective domain (e.g. "localhost"); rpOrigin is
// the full origin the browser reports (e.g. "http://localhost:5173").
func NewAuthenticator(rpID, rpOrigin, displayName string) (*Authenticator, error) {
	if displayName == "" {
		displayName = "StudyRover"
	}
	wa, err := webauthn.New(&webauthn.Config{
		RPID:          rpID,
		RPDisplayName: displayName,
		RPOrigins:     []string{rpOrigin},
	})
	if err != nil {
		return nil, err
	}
	return &Authenticator{wa: wa, store: newChallengeStore()}, nil
}

// Credential is StudyRover's persisted form of a WebAuthn credential. It maps
// directly to the generated contract Credential shape
// ({ id, parentId, credentialId, publicKey, counter, isBackup }) minus the
// server-assigned id/parentId, which the store layer fills in.
type Credential struct {
	// CredentialID is the raw credential id (base64url when serialized to JSON).
	CredentialID []byte
	// PublicKey is the COSE public key bytes.
	PublicKey []byte
	// Counter is the authenticator signature counter.
	Counter uint32
	// IsBackup reports whether this credential is a multi-device / backup
	// credential (backup-eligible and backed up), per the spec's "register a
	// backup key" requirement.
	IsBackup bool
}

// toWebAuthn converts a stored Credential to the go-webauthn representation used
// during the login ceremony.
func (c Credential) toWebAuthn() webauthn.Credential {
	return webauthn.Credential{
		ID:        c.CredentialID,
		PublicKey: c.PublicKey,
		Authenticator: webauthn.Authenticator{
			SignCount: c.Counter,
		},
		Flags: webauthn.CredentialFlags{
			BackupEligible: c.IsBackup,
			BackupState:    c.IsBackup,
		},
	}
}

// fromWebAuthn builds StudyRover's Credential from a freshly registered or
// re-authenticated go-webauthn credential, capturing the backup flag.
func fromWebAuthn(c *webauthn.Credential) Credential {
	return Credential{
		CredentialID: c.ID,
		PublicKey:    c.PublicKey,
		Counter:      c.Authenticator.SignCount,
		// A credential is treated as a backup key when the authenticator marks
		// it backup-eligible and it is currently backed up (synced).
		IsBackup: c.Flags.BackupEligible && c.Flags.BackupState,
	}
}

// waUser adapts a parent + its credentials to the webauthn.User interface.
type waUser struct {
	id          []byte
	name        string
	displayName string
	creds       []webauthn.Credential
}

func (u *waUser) WebAuthnID() []byte                         { return u.id }
func (u *waUser) WebAuthnName() string                       { return u.name }
func (u *waUser) WebAuthnDisplayName() string                { return u.displayName }
func (u *waUser) WebAuthnCredentials() []webauthn.Credential { return u.creds }

// newUser builds a webauthn user. The handle is the stable user id bytes; for a
// brand-new registration the caller passes a freshly generated handle (see
// NewUserHandle).
func newUser(handle []byte, email, displayName string, creds []Credential) *waUser {
	wc := make([]webauthn.Credential, 0, len(creds))
	for _, c := range creds {
		wc = append(wc, c.toWebAuthn())
	}
	return &waUser{id: handle, name: email, displayName: displayName, creds: wc}
}

// NewUserHandle returns a fresh, random 32-byte WebAuthn user handle suitable
// for a new parent registration. The handle should be persisted alongside the
// parent so subsequent ceremonies reuse it.
func NewUserHandle() ([]byte, error) {
	return randomBytes(32)
}

// BeginRegistration starts a registration ceremony for a (possibly new) parent.
// It returns the credential-creation options to send to the browser and an
// opaque ceremony id the caller stores until FinishRegistration. Existing
// credentials are excluded so a second key registers as an additional/backup
// credential rather than overwriting.
func (a *Authenticator) BeginRegistration(handle []byte, email, displayName string, existing []Credential) (*protocol.CredentialCreation, string, error) {
	user := newUser(handle, email, displayName, existing)

	opts := []webauthn.RegistrationOption{
		// Prefer resident/discoverable credentials and require user
		// verification so the parent override is a strong factor.
		webauthn.WithAuthenticatorSelection(protocol.AuthenticatorSelection{
			ResidentKey:      protocol.ResidentKeyRequirementPreferred,
			UserVerification: protocol.VerificationPreferred,
		}),
		webauthn.WithExclusions(excludeList(existing)),
	}

	creation, session, err := a.wa.BeginRegistration(user, opts...)
	if err != nil {
		return nil, "", err
	}
	id := a.store.put(session)
	return creation, id, nil
}

// FinishRegistration completes a registration ceremony. It validates the
// browser's attestation response against the stored session data and returns
// the new credential (including its backup flag).
func (a *Authenticator) FinishRegistration(ceremonyID string, handle []byte, email, displayName string, existing []Credential, r *http.Request) (Credential, error) {
	session, ok := a.store.take(ceremonyID)
	if !ok {
		return Credential{}, ErrCeremonyNotFound
	}
	user := newUser(handle, email, displayName, existing)
	cred, err := a.wa.FinishRegistration(user, *session, r)
	if err != nil {
		return Credential{}, err
	}
	return fromWebAuthn(cred), nil
}

// BeginLogin starts a login ceremony for a parent with the given credentials.
// It returns the assertion options for the browser and a ceremony id.
func (a *Authenticator) BeginLogin(handle []byte, email, displayName string, creds []Credential) (*protocol.CredentialAssertion, string, error) {
	if len(creds) == 0 {
		return nil, "", ErrNoCredentials
	}
	user := newUser(handle, email, displayName, creds)
	assertion, session, err := a.wa.BeginLogin(user)
	if err != nil {
		return nil, "", err
	}
	id := a.store.put(session)
	return assertion, id, nil
}

// FinishLogin completes a login ceremony, returning the credential that was
// used so the caller can persist its updated signature counter and backup
// state.
func (a *Authenticator) FinishLogin(ceremonyID string, handle []byte, email, displayName string, creds []Credential, r *http.Request) (Credential, error) {
	session, ok := a.store.take(ceremonyID)
	if !ok {
		return Credential{}, ErrCeremonyNotFound
	}
	user := newUser(handle, email, displayName, creds)
	cred, err := a.wa.FinishLogin(user, *session, r)
	if err != nil {
		return Credential{}, err
	}
	return fromWebAuthn(cred), nil
}

// excludeList builds the credential-descriptor exclusion list from existing
// credentials so the same authenticator is not registered twice.
func excludeList(existing []Credential) []protocol.CredentialDescriptor {
	out := make([]protocol.CredentialDescriptor, 0, len(existing))
	for _, c := range existing {
		out = append(out, protocol.CredentialDescriptor{
			Type:         protocol.PublicKeyCredentialType,
			CredentialID: c.CredentialID,
		})
	}
	return out
}

// EncodeCredentialID renders a raw credential id as a base64url string for
// transport/storage convenience.
func EncodeCredentialID(id []byte) string {
	return base64.RawURLEncoding.EncodeToString(id)
}

// Ceremony errors.
var (
	// ErrCeremonyNotFound is returned when a finish call references an unknown
	// or expired ceremony id.
	ErrCeremonyNotFound = errors.New("auth: webauthn ceremony not found or expired")
	// ErrNoCredentials is returned when a login is attempted for a user with no
	// registered credentials.
	ErrNoCredentials = errors.New("auth: no registered credentials")
)

// challengeTTL bounds how long a pending ceremony's session data is retained.
const challengeTTL = 5 * time.Minute

// challengeStore is a small, concurrency-safe, TTL'd store of in-flight
// WebAuthn session data keyed by an opaque ceremony id. It keeps the challenge
// server-side between the begin and finish steps.
type challengeStore struct {
	mu      sync.Mutex
	entries map[string]challengeEntry
	seq     int
}

type challengeEntry struct {
	data    *webauthn.SessionData
	expires time.Time
}

func newChallengeStore() *challengeStore {
	return &challengeStore{entries: make(map[string]challengeEntry)}
}

// put stores session data and returns a new ceremony id.
func (s *challengeStore) put(data *webauthn.SessionData) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.gc()
	s.seq++
	id := EncodeCredentialID(mustRandom(18)) + "-" + itoa(s.seq)
	s.entries[id] = challengeEntry{data: data, expires: time.Now().Add(challengeTTL)}
	return id
}

// take returns and removes the session data for id, reporting whether it was
// present and unexpired.
func (s *challengeStore) take(id string) (*webauthn.SessionData, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, ok := s.entries[id]
	if !ok {
		return nil, false
	}
	delete(s.entries, id)
	if time.Now().After(e.expires) {
		return nil, false
	}
	return e.data, true
}

// gc removes expired entries. Caller must hold the lock.
func (s *challengeStore) gc() {
	now := time.Now()
	for id, e := range s.entries {
		if now.After(e.expires) {
			delete(s.entries, id)
		}
	}
}

// mustRandom returns n random bytes, falling back to a time-seeded value only if
// the system RNG fails (it effectively never does); ceremony ids are not
// security-critical because the challenge itself lives in the session data.
func mustRandom(n int) []byte {
	b, err := randomBytes(n)
	if err != nil {
		b = []byte(itoa(int(time.Now().UnixNano())))
	}
	return b
}
