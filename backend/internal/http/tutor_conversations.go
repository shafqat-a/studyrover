package http

import (
	"errors"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// CreateConversation handles POST /tutor/conversations: it starts a new tutor
// chat session scoped to a subject and student (CONTRACTS-P2 §2-C01 / 2-A01).
//
// The route lives under /tutor, which the W02 auth middleware guards with a
// student session. The task ("Student or parent guarded") allows either
// identity, so the handler accepts a parent session too — useful when a parent
// drives the tutor on the student's behalf. The in-handler check keeps the
// method safe in isolation and satisfies the "unauthed → 401" acceptance.
func (h *Handlers) CreateConversation(w http.ResponseWriter, r *http.Request) {
	if !studentOrParent(r) {
		unauthorized(w)
		return
	}

	var body contracts.CreateConversation
	if !decodeJSON(w, r, &body) {
		return
	}

	body.SubjectId = strings.TrimSpace(body.SubjectId)
	body.StudentId = strings.TrimSpace(body.StudentId)
	if body.SubjectId == "" {
		badRequest(w, "subjectId is required")
		return
	}
	if body.StudentId == "" {
		badRequest(w, "studentId is required")
		return
	}

	// Validate the subject exists so a conversation can never be grounded in a
	// missing subject (the tutor system prompt is assembled from its syllabus).
	if _, err := h.Store.GetSubject(r.Context(), body.SubjectId); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "subject not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	// Validate the student exists for the same reason (progress grounding).
	if _, err := h.Store.GetStudentByID(r.Context(), body.StudentId); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "student not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	created, err := h.Store.CreateConversation(r.Context(), store.CreateConversationParams{
		SubjectID: body.SubjectId,
		StudentID: body.StudentId,
	})
	if err != nil {
		internalError(w, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, toContractConversation(created))
}

// toContractConversation maps a sqlc store.Conversation to the generated
// contract type (both use string ids). Shared by the tutor handlers (2-A01/03).
func toContractConversation(c store.Conversation) contracts.Conversation {
	return contracts.Conversation{
		Id:        c.ID,
		SubjectId: c.SubjectID,
		StudentId: c.StudentID,
		CreatedAt: c.CreatedAt,
	}
}

// studentOrParent reports whether the request carries either a student or a
// parent session.
func studentOrParent(r *http.Request) bool {
	if _, ok := auth.StudentFromCtx(r.Context()); ok {
		return true
	}
	_, ok := auth.ParentFromCtx(r.Context())
	return ok
}
