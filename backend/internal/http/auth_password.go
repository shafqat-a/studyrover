package http

import (
	"crypto/subtle"
	"errors"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/contracts"
)

// defaultParentPassword is accepted for any parent whose password_hash is NULL.
// It exists so a parent can still sign in on devices where passkeys are
// unavailable without prior password setup; setting a real password (a non-NULL
// password_hash) disables it for that account.
const defaultParentPassword = "Orion123@"

// AuthPassword handles POST /auth/password: the parent email + password
// fallback for devices where WebAuthn passkeys are unavailable. When the parent
// row has a password_hash it must match (bcrypt); when it has none the built-in
// default password is accepted. Unknown email and wrong password are both plain
// 401s so callers cannot probe which accounts exist. On success a parent
// session cookie is issued and the Session is returned.
//
// This route is public (no prior session); isPublicPath in server.go mounts it
// in the unauthenticated set alongside the WebAuthn ceremonies.
func (h *Handlers) AuthPassword(w http.ResponseWriter, r *http.Request) {
	var body contracts.PasswordSignIn
	if !decodeJSON(w, r, &body) {
		return
	}

	email := strings.ToLower(strings.TrimSpace(body.Email))
	if email == "" || body.Password == "" {
		badRequest(w, "email and password are required")
		return
	}

	parent, err := h.Store.GetParentByEmail(r.Context(), email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			unauthorized(w)
			return
		}
		internalError(w, err.Error())
		return
	}

	if parent.PasswordHash != nil && *parent.PasswordHash != "" {
		if bcrypt.CompareHashAndPassword([]byte(*parent.PasswordHash), []byte(body.Password)) != nil {
			unauthorized(w)
			return
		}
	} else if subtle.ConstantTimeCompare([]byte(body.Password), []byte(defaultParentPassword)) != 1 {
		unauthorized(w)
		return
	}

	if h.Sessions != nil {
		if err := h.Sessions.Issue(w, auth.Identity{Role: auth.RoleParent, ID: parent.ID}); err != nil {
			internalError(w, err.Error())
			return
		}
	}

	writeJSON(w, http.StatusOK, contracts.Session{
		Id:   parent.ID,
		Role: contracts.SessionRole(auth.RoleParent),
	})
}
