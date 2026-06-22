package http

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// AuthLogin handles POST /auth/login, the parent WebAuthn (FIDO2) login ceremony
// (CONTRACTS.md §C08, AuthResult). The endpoint is public (the W02 middleware
// exempts /auth/login) and serves both ceremony steps over the single opaque
// WebAuthnCeremony body:
//
//   - Begin: the body carries only the parent's { "email" }. The handler looks
//     up the parent and its credentials, starts the assertion ceremony, and
//     returns AuthResult{Options} — the browser's PublicKeyCredentialRequest
//     options plus a server-issued "ceremonyId" the client echoes back.
//   - Finish: the body carries { "email", "ceremonyId", "assertion" } where
//     assertion is the authenticator's response. The handler verifies it, bumps
//     the stored signature counter, issues the parent session cookie, and returns
//     AuthResult{Session}. A backup credential verifies the same way as the
//     primary key.
//
// A failed assertion (or an unknown/expired ceremony) is a 401.
func (h *Handlers) AuthLogin(w http.ResponseWriter, r *http.Request) {
	var body contracts.WebAuthnCeremony
	if !decodeJSON(w, r, &body) {
		return
	}

	email := strings.TrimSpace(ceremonyString(body, "email"))
	if email == "" {
		badRequest(w, "email is required")
		return
	}
	email = strings.ToLower(email)

	// Presence of the authenticator "assertion" object selects the finish step;
	// otherwise this is the begin step.
	if _, finishing := body["assertion"]; finishing {
		h.authLoginFinish(w, r, email, body)
		return
	}
	h.authLoginBegin(w, r, email)
}

// authLoginBegin starts the assertion ceremony for the parent identified by
// email and returns the request options (plus a ceremonyId) to the browser.
func (h *Handlers) authLoginBegin(w http.ResponseWriter, r *http.Request, email string) {
	parent, creds, ok := h.lookupParentCredentials(w, r, email)
	if !ok {
		return
	}

	assertion, ceremonyID, err := h.Auth.BeginLogin(
		registerParentHandle(parent.ID), parent.Email, parent.DisplayName, creds,
	)
	if err != nil {
		// No credentials (or a malformed begin) is treated as an auth failure so
		// the endpoint never reveals which step failed.
		if errors.Is(err, auth.ErrNoCredentials) {
			unauthorized(w)
			return
		}
		internalError(w, err.Error())
		return
	}

	// Serialize the go-webauthn options into the opaque ceremony map and attach
	// the server-issued ceremony id the client must echo on finish.
	options, err := registerToCeremony(assertion)
	if err != nil {
		internalError(w, err.Error())
		return
	}
	options["ceremonyId"] = ceremonyID

	writeJSON(w, http.StatusOK, contracts.AuthResult{Options: &options})
}

// authLoginFinish verifies the authenticator assertion, persists the updated
// signature counter, issues the parent session, and returns the Session.
func (h *Handlers) authLoginFinish(w http.ResponseWriter, r *http.Request, email string, body contracts.WebAuthnCeremony) {
	ceremonyID := strings.TrimSpace(ceremonyString(body, "ceremonyId"))
	if ceremonyID == "" {
		badRequest(w, "ceremonyId is required")
		return
	}

	assertion, ok := body["assertion"]
	if !ok {
		badRequest(w, "assertion is required")
		return
	}

	parent, creds, ok := h.lookupParentCredentials(w, r, email)
	if !ok {
		return
	}

	// go-webauthn parses the authenticator response from a request body, so wrap
	// the assertion sub-object in a fresh request carrying just that JSON.
	assertionReq, err := assertionRequest(r, assertion)
	if err != nil {
		internalError(w, err.Error())
		return
	}

	used, err := h.Auth.FinishLogin(
		ceremonyID, registerParentHandle(parent.ID), parent.Email, parent.DisplayName, creds, assertionReq,
	)
	if err != nil {
		// A bad assertion, an unknown/expired ceremony, or a counter/clone check
		// failure all collapse to 401 (acceptance: bad assertion -> 401).
		unauthorized(w)
		return
	}

	// Persist the bumped signature counter so future logins detect clones.
	if _, err := h.Store.UpdateCredentialCounter(r.Context(), store.UpdateCredentialCounterParams{
		CredentialID: used.CredentialID,
		Counter:      int64(used.Counter),
	}); err != nil {
		internalError(w, err.Error())
		return
	}

	if err := h.Sessions.Issue(w, auth.Identity{Role: auth.RoleParent, ID: parent.ID}); err != nil {
		internalError(w, err.Error())
		return
	}

	session := contracts.Session{Id: parent.ID, Role: contracts.SessionRoleParent}
	writeJSON(w, http.StatusOK, contracts.AuthResult{Session: &session})
}

// lookupParentCredentials resolves the parent by email and loads its stored
// credentials, mapping them into the auth package's Credential form. A missing
// parent or any unexpected store error is reported to the client and the second
// return reports whether the caller may proceed. An unknown email is a 401 so
// the endpoint does not disclose which accounts exist.
func (h *Handlers) lookupParentCredentials(w http.ResponseWriter, r *http.Request, email string) (store.Parent, []auth.Credential, bool) {
	parent, err := h.Store.GetParentByEmail(r.Context(), email)
	if err != nil {
		unauthorized(w)
		return store.Parent{}, nil, false
	}

	rows, err := h.Store.ListCredentialsByParent(r.Context(), parent.ID)
	if err != nil {
		internalError(w, err.Error())
		return store.Parent{}, nil, false
	}
	if len(rows) == 0 {
		unauthorized(w)
		return store.Parent{}, nil, false
	}

	creds := make([]auth.Credential, 0, len(rows))
	for i := range rows {
		creds = append(creds, auth.Credential{
			CredentialID: rows[i].CredentialID,
			PublicKey:    rows[i].PublicKey,
			Counter:      uint32(rows[i].Counter),
			IsBackup:     rows[i].IsBackup,
		})
	}
	return parent, creds, true
}

// ceremonyString reads a string value from the opaque ceremony map, tolerating a
// missing or non-string entry by returning "".
func ceremonyString(c contracts.WebAuthnCeremony, key string) string {
	if v, ok := c[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

// assertionRequest builds a request whose body is the JSON of the authenticator
// assertion, suitable for go-webauthn's FinishLogin parser. Method/URL/header are
// copied from the original request so the parser sees a well-formed POST.
func assertionRequest(orig *http.Request, assertion any) (*http.Request, error) {
	raw, err := json.Marshal(assertion)
	if err != nil {
		return nil, err
	}
	req := orig.Clone(orig.Context())
	req.Body = io.NopCloser(bytes.NewReader(raw))
	req.ContentLength = int64(len(raw))
	req.Header.Set("Content-Type", "application/json")
	return req, nil
}
