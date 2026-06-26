package http

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// GetConversation handles GET /tutor/conversations/{id}: it returns a tutor
// conversation together with its full message history in chronological order
// (ConversationWithMessages, CONTRACTS-P2 §2-C01 / task 2-A03). The route is
// student-guarded; the conversation is access-scoped to the authenticated
// student, so a conversation owned by another student is reported as 404 (Not
// found) rather than 403 to avoid leaking its existence. A missing conversation
// is likewise a 404 Problem.
func (h *Handlers) GetConversation(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	student, ok := auth.StudentFromCtx(r.Context())
	if !ok {
		unauthorized(w)
		return
	}

	id = strings.TrimSpace(id)
	if id == "" {
		badRequest(w, "id is required")
		return
	}

	conv, err := h.Store.GetConversation(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "conversation not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	// Access scoping: a student may only read their own conversations. Treat a
	// foreign conversation as not found so it cannot be enumerated.
	if conv.StudentID != student.ID {
		notFound(w, "conversation not found")
		return
	}

	msgs, err := h.Store.ListMessages(r.Context(), id)
	if err != nil {
		internalError(w, err.Error())
		return
	}

	items := make([]contracts.Message, 0, len(msgs))
	for i := range msgs {
		items = append(items, toContractMessage(msgs[i]))
	}

	writeJSON(w, http.StatusOK, contracts.ConversationWithMessages{
		Conversation: toContractConversation(conv),
		Messages:     items,
	})
}

// toContractMessage maps a sqlc store.Message to the generated contract type.
// Citations are persisted as a JSON array of Citation objects; an empty or
// invalid blob yields no citations (nil) rather than an error, keeping the read
// path resilient.
func toContractMessage(m store.Message) contracts.Message {
	msg := contracts.Message{
		Id:             m.ID,
		ConversationId: m.ConversationID,
		Role:           contracts.MessageRole(m.Role),
		Text:           m.Text,
		CreatedAt:      m.CreatedAt,
	}

	if len(m.Citations) > 0 {
		var cites []contracts.Citation
		if err := json.Unmarshal(m.Citations, &cites); err == nil && len(cites) > 0 {
			msg.Citations = &cites
		}
	}

	return msg
}
