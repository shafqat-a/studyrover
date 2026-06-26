package http

import (
	"net/http"

	"github.com/shafqat/studyrover/backend/internal/contracts"
)

// GetAuthSession handles GET /auth/session: it reads the sr_session cookie
// directly (the route is public, so the auth middleware does not inject an
// identity) and returns the active Session, or 401 when there is none. The SPA
// uses this to gate routes and redirect logged-out users to sign-in.
func (h *Handlers) GetAuthSession(w http.ResponseWriter, r *http.Request) {
	id, err := h.Sessions.Read(r)
	if err != nil {
		unauthorized(w)
		return
	}
	writeJSON(w, http.StatusOK, contracts.Session{
		Role: contracts.SessionRole(id.Role),
		Id:   id.ID,
	})
}
