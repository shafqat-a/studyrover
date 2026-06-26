// Package auth provides StudyRover's authentication primitives: signed,
// secure cookie sessions, FIDO2 (WebAuthn) registration/login helpers, and chi
// middleware that gates routes by role. It is consumed by the parent auth
// handlers (A18/A19) and the student sign-in handler (A20).
package auth

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Role identifies the kind of principal carried by a session. It mirrors the
// generated contract enum (Session.role: parent | student).
type Role string

const (
	// RoleParent is the guardian/parent principal (FIDO2-authenticated).
	RoleParent Role = "parent"
	// RoleStudent is the student principal (sign-in via A20).
	RoleStudent Role = "student"
)

// Identity is the principal stored in a session and injected into the request
// context by the middleware. It matches the generated Session shape
// ({ role, id }).
type Identity struct {
	Role Role   `json:"role"`
	ID   string `json:"id"`
}

// sessionCookieName is the name of the signed session cookie.
const sessionCookieName = "sr_session"

// defaultSessionTTL is how long an issued session remains valid.
const defaultSessionTTL = 7 * 24 * time.Hour

// contextKey is an unexported type for context keys defined in this package to
// avoid collisions with keys defined elsewhere.
type contextKey int

const (
	parentKey contextKey = iota
	studentKey
)

// SessionManager issues and verifies signed, secure cookie sessions. The cookie
// payload is an HMAC-signed, base64url-encoded JSON envelope; it carries no
// server-side state, so it is self-contained and tamper-evident.
type SessionManager struct {
	secret []byte
	// secure controls the Secure cookie attribute. It is derived from the RP
	// origin scheme (https => true) so local http development still works.
	secure bool
	ttl    time.Duration
}

// NewSessionManager builds a SessionManager from the session secret and the RP
// origin. The Secure cookie attribute is enabled when the origin uses https.
func NewSessionManager(secret, rpOrigin string) *SessionManager {
	return &SessionManager{
		secret: []byte(secret),
		secure: strings.HasPrefix(strings.ToLower(rpOrigin), "https://"),
		ttl:    defaultSessionTTL,
	}
}

// envelope is the signed payload stored in the cookie value.
type envelope struct {
	Identity
	// Exp is the unix expiry timestamp (seconds).
	Exp int64 `json:"exp"`
}

// Issue writes a signed session cookie for the given identity to w.
func (m *SessionManager) Issue(w http.ResponseWriter, id Identity) error {
	env := envelope{Identity: id, Exp: time.Now().Add(m.ttl).Unix()}
	payload, err := json.Marshal(env)
	if err != nil {
		return err
	}
	body := base64.RawURLEncoding.EncodeToString(payload)
	value := body + "." + m.sign(body)

	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    value,
		Path:     "/",
		HttpOnly: true,
		Secure:   m.secure,
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Unix(env.Exp, 0),
		MaxAge:   int(m.ttl / time.Second),
	})
	return nil
}

// Clear removes the session cookie (logout).
func (m *SessionManager) Clear(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   m.secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
}

// ErrNoSession is returned when no valid session cookie is present.
var ErrNoSession = errors.New("auth: no valid session")

// Read parses and verifies the session cookie on r, returning the identity.
func (m *SessionManager) Read(r *http.Request) (Identity, error) {
	c, err := r.Cookie(sessionCookieName)
	if err != nil {
		return Identity{}, ErrNoSession
	}
	return m.decode(c.Value)
}

// decode verifies the signature and expiry of a cookie value.
func (m *SessionManager) decode(value string) (Identity, error) {
	body, sig, ok := strings.Cut(value, ".")
	if !ok {
		return Identity{}, ErrNoSession
	}
	expected := m.sign(body)
	if subtle.ConstantTimeCompare([]byte(sig), []byte(expected)) != 1 {
		return Identity{}, ErrNoSession
	}
	payload, err := base64.RawURLEncoding.DecodeString(body)
	if err != nil {
		return Identity{}, ErrNoSession
	}
	var env envelope
	if err := json.Unmarshal(payload, &env); err != nil {
		return Identity{}, ErrNoSession
	}
	if time.Now().Unix() > env.Exp {
		return Identity{}, ErrNoSession
	}
	if env.Role != RoleParent && env.Role != RoleStudent {
		return Identity{}, ErrNoSession
	}
	return env.Identity, nil
}

// sign returns the base64url-encoded HMAC-SHA256 of body using the secret.
func (m *SessionManager) sign(body string) string {
	mac := hmac.New(sha256.New, m.secret)
	mac.Write([]byte(body))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

// withParent / withStudent stash the identity in the request context. They are
// used by the middleware after a successful check.
func withParent(ctx context.Context, id Identity) context.Context {
	return context.WithValue(ctx, parentKey, id)
}

func withStudent(ctx context.Context, id Identity) context.Context {
	return context.WithValue(ctx, studentKey, id)
}

// ParentFromCtx returns the authenticated parent identity from the context,
// reporting whether a parent session is present.
func ParentFromCtx(ctx context.Context) (Identity, bool) {
	id, ok := ctx.Value(parentKey).(Identity)
	return id, ok
}

// StudentFromCtx returns the authenticated student identity from the context,
// reporting whether a student session is present.
func StudentFromCtx(ctx context.Context) (Identity, bool) {
	id, ok := ctx.Value(studentKey).(Identity)
	return id, ok
}

// randomBytes returns n cryptographically-random bytes. It is used for
// generating WebAuthn user handles.
func randomBytes(n int) ([]byte, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return nil, err
	}
	return b, nil
}

// itoa is a small helper kept here so callers in this package avoid importing
// strconv directly for trivial conversions.
func itoa(i int) string { return strconv.Itoa(i) }
