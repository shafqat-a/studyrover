package http

import (
	"errors"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/contracts"
)

// AuthStudent handles POST /auth/student: signs a student in for an exam session
// (CONTRACTS.md §C20). The body carries the studentId and an optional pin. When
// the student profile has a pin_hash set, the supplied pin must match it
// (bcrypt) or the request is rejected with 401 — wrong/missing pin → Unauthorized.
// When no pin_hash is set the sign-in is "pick-and-go": any matching studentId
// signs straight in. On success a distinct student session cookie is issued and
// the Session ({role: "student", id}) is returned.
//
// This route is public (no prior session); the router mounts it in the
// unauthenticated set, so there is no parent/student context check here.
func (h *Handlers) AuthStudent(w http.ResponseWriter, r *http.Request) {
	var body contracts.StudentSignIn
	if !decodeJSON(w, r, &body) {
		return
	}

	body.StudentId = strings.TrimSpace(body.StudentId)
	if body.StudentId == "" {
		badRequest(w, "studentId is required")
		return
	}

	student, err := h.Store.GetStudentByID(r.Context(), body.StudentId)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Do not distinguish unknown student from wrong pin to a caller: both
			// are sign-in failures.
			unauthorized(w)
			return
		}
		internalError(w, err.Error())
		return
	}

	// When a pin is configured it must be supplied and match; otherwise the
	// student picks-and-goes without a pin.
	if student.PinHash != nil && *student.PinHash != "" {
		if body.Pin == nil || *body.Pin == "" {
			unauthorized(w)
			return
		}
		if err := bcrypt.CompareHashAndPassword([]byte(*student.PinHash), []byte(*body.Pin)); err != nil {
			unauthorized(w)
			return
		}
	}

	// Issue a distinct student session (separate role from the parent session).
	if h.Sessions != nil {
		if err := h.Sessions.Issue(w, auth.Identity{Role: auth.RoleStudent, ID: student.ID}); err != nil {
			internalError(w, err.Error())
			return
		}
	}

	writeJSON(w, http.StatusOK, contracts.Session{
		Id:   student.ID,
		Role: contracts.SessionRole(auth.RoleStudent),
	})
}
