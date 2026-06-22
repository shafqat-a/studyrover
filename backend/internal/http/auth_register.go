package http

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// AuthRegister handles POST /auth/register: the parent FIDO2 (WebAuthn)
// registration ceremony (CONTRACTS.md §C08, task A18).
//
// The endpoint serves both ceremony steps over a single route, distinguished by
// the body shape (WebAuthnCeremony is an opaque map):
//
//   - begin: { "email": "...", "displayName": "..." } — the parent is created
//     (or looked up) and credential-creation options are returned, along with an
//     opaque "ceremonyId" the caller echoes back on finish. The server-side
//     challenge is stored behind that id.
//   - finish: { "email": "...", "ceremonyId": "...", <attestation response> } —
//     the attestation is verified, the new Credential is persisted (isBackup=true
//     for a backup/multi-device key, avoiding parent lockout), and a parent
//     session is started.
//
// Two credentials can be registered for the same parent (primary + backup): the
// second begin excludes the first credential, so the new key registers as an
// additional credential rather than overwriting. An invalid attestation yields a
// 400 Problem{VALIDATION}.
func (h *Handlers) AuthRegister(w http.ResponseWriter, r *http.Request) {
	var body contracts.WebAuthnCeremony
	if !decodeJSON(w, r, &body) {
		return
	}

	// finish step is identified by the presence of a ceremonyId echoed back from
	// the begin response; otherwise we treat the request as a begin.
	if ceremonyID := registerCeremonyString(body, "ceremonyId"); ceremonyID != "" {
		h.authRegisterFinish(w, r, body, ceremonyID)
		return
	}
	h.authRegisterBegin(w, r, body)
}

// authRegisterBegin creates/looks up the parent and returns registration
// options, storing the ceremony challenge server-side.
func (h *Handlers) authRegisterBegin(w http.ResponseWriter, r *http.Request, body contracts.WebAuthnCeremony) {
	email := strings.TrimSpace(strings.ToLower(registerCeremonyString(body, "email")))
	if email == "" {
		badRequest(w, "email is required")
		return
	}
	displayName := strings.TrimSpace(registerCeremonyString(body, "displayName"))
	if displayName == "" {
		displayName = email
	}

	parent, existing, err := h.lookupOrCreateParent(r, email, displayName)
	if err != nil {
		internalError(w, err.Error())
		return
	}

	creation, ceremonyID, err := h.Auth.BeginRegistration(registerParentHandle(parent.ID), parent.Email, parent.DisplayName, existing)
	if err != nil {
		badRequest(w, err.Error())
		return
	}

	options, err := registerToCeremony(creation)
	if err != nil {
		internalError(w, err.Error())
		return
	}
	// Carry the opaque ceremony id alongside the options so the client returns it
	// on finish; the challenge itself stays server-side.
	options["ceremonyId"] = ceremonyID

	writeJSON(w, http.StatusOK, contracts.AuthResult{Options: &options})
}

// authRegisterFinish verifies the attestation, persists the credential, and
// starts a parent session.
func (h *Handlers) authRegisterFinish(w http.ResponseWriter, r *http.Request, body contracts.WebAuthnCeremony, ceremonyID string) {
	email := strings.TrimSpace(strings.ToLower(registerCeremonyString(body, "email")))
	if email == "" {
		badRequest(w, "email is required")
		return
	}

	parent, err := h.Store.GetParentByEmail(r.Context(), email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			badRequest(w, "unknown parent for finish step")
			return
		}
		internalError(w, err.Error())
		return
	}

	existing, err := h.Store.ListCredentialsByParent(r.Context(), parent.ID)
	if err != nil {
		internalError(w, err.Error())
		return
	}

	// go-webauthn's FinishRegistration parses the attestation from the request
	// body. The outer ceremony fields (ceremonyId/email) are not part of the
	// authenticator response, so rebuild a request whose body is just the
	// attestation JSON.
	attestation := make(map[string]interface{}, len(body))
	for k, v := range body {
		if k == "ceremonyId" || k == "email" || k == "displayName" {
			continue
		}
		attestation[k] = v
	}
	raw, err := json.Marshal(attestation)
	if err != nil {
		internalError(w, err.Error())
		return
	}
	r.Body = io.NopCloser(bytes.NewReader(raw))
	r.ContentLength = int64(len(raw))

	cred, err := h.Auth.FinishRegistration(
		ceremonyID,
		registerParentHandle(parent.ID),
		parent.Email,
		parent.DisplayName,
		toAuthCredentials(existing),
		r,
	)
	if err != nil {
		if errors.Is(err, auth.ErrCeremonyNotFound) {
			badRequest(w, "registration ceremony not found or expired")
			return
		}
		// An invalid attestation (bad signature / origin / challenge) is a client
		// error per the acceptance criteria.
		badRequest(w, err.Error())
		return
	}

	if _, err := h.Store.AddCredential(r.Context(), store.AddCredentialParams{
		ParentID:     parent.ID,
		CredentialID: cred.CredentialID,
		PublicKey:    cred.PublicKey,
		Counter:      int64(cred.Counter),
		IsBackup:     cred.IsBackup,
	}); err != nil {
		internalError(w, err.Error())
		return
	}

	if err := h.Sessions.Issue(w, auth.Identity{Role: auth.RoleParent, ID: parent.ID}); err != nil {
		internalError(w, err.Error())
		return
	}

	session := contracts.Session{Id: parent.ID, Role: contracts.SessionRole(auth.RoleParent)}
	writeJSON(w, http.StatusOK, contracts.AuthResult{Session: &session})
}

// lookupOrCreateParent returns the parent for email (creating it on first
// registration) along with its existing credentials. The create+lookup runs in a
// transaction so a concurrent first registration cannot double-insert.
func (h *Handlers) lookupOrCreateParent(r *http.Request, email, displayName string) (store.Parent, []auth.Credential, error) {
	var (
		parent   store.Parent
		existing []store.Credential
	)
	err := h.Store.Tx(r.Context(), func(q *store.Queries) error {
		p, err := q.GetParentByEmail(r.Context(), email)
		switch {
		case err == nil:
			parent = p
		case errors.Is(err, pgx.ErrNoRows):
			created, cerr := q.CreateParent(r.Context(), store.CreateParentParams{
				DisplayName: displayName,
				Email:       email,
			})
			if cerr != nil {
				return cerr
			}
			parent = created
		default:
			return err
		}

		creds, err := q.ListCredentialsByParent(r.Context(), parent.ID)
		if err != nil {
			return err
		}
		existing = creds
		return nil
	})
	if err != nil {
		return store.Parent{}, nil, err
	}
	return parent, toAuthCredentials(existing), nil
}

// toAuthCredentials maps persisted store.Credential rows to the auth package's
// Credential form used by the WebAuthn ceremonies.
func toAuthCredentials(rows []store.Credential) []auth.Credential {
	out := make([]auth.Credential, 0, len(rows))
	for _, c := range rows {
		out = append(out, auth.Credential{
			CredentialID: c.CredentialID,
			PublicKey:    c.PublicKey,
			Counter:      uint32(c.Counter),
			IsBackup:     c.IsBackup,
		})
	}
	return out
}

// registerParentHandle derives a stable WebAuthn user handle from the parent id.
// The schema stores no separate handle, so the id bytes serve as a deterministic
// handle that is consistent across the begin and finish steps of a ceremony.
func registerParentHandle(parentID string) []byte {
	return []byte(parentID)
}

// registerToCeremony marshals a typed WebAuthn options value into the opaque
// WebAuthnCeremony map carried by the contract.
func registerToCeremony(v any) (contracts.WebAuthnCeremony, error) {
	raw, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	out := contracts.WebAuthnCeremony{}
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// registerCeremonyString reads a string value from the opaque ceremony map,
// returning "" when the key is absent or not a string.
func registerCeremonyString(c contracts.WebAuthnCeremony, key string) string {
	if v, ok := c[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}
