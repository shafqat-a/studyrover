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

// GetQuestion handles GET /questions/{id}: returns the single question with its
// answer options or a 404 Problem{NOT_FOUND} envelope when it does not exist
// (CONTRACTS.md §C05/§C11). Parent-guarded.
func (h *Handlers) GetQuestion(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	q, err := h.Store.GetQuestion(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "question not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	opts, err := h.Store.ListOptionsByQuestion(r.Context(), id)
	if err != nil {
		internalError(w, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, questionToContract(q, opts))
}

// UpdateQuestion handles PUT /questions/{id}: a full replacement of the
// question's mutable fields, including its answer options. The body's options
// replace the existing option set, so the correctness invariant is re-checked
// against the supplied options: correctOptionId must identify exactly one option
// and at least four options must be present (CONTRACTS.md §C05). The whole update
// — option replacement plus the question row — runs in a single transaction so a
// failed invariant or write leaves the original question untouched. Returns 404
// when the question is missing and 400 when the body violates the invariant.
// Parent-guarded.
func (h *Handlers) UpdateQuestion(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	var body contracts.UpdateQuestionJSONRequestBody
	if !decodeJSON(w, r, &body) {
		return
	}

	body.Text = strings.TrimSpace(body.Text)
	if body.Text == "" {
		badRequest(w, "text is required")
		return
	}

	if len(body.Options) < 4 {
		badRequest(w, "at least four options are required")
		return
	}

	// Re-validate the correctness invariant: the correct option id must match
	// exactly one of the options supplied in the body, and option text must be
	// non-blank.
	correctSeen := false
	correctID := strings.TrimSpace(body.CorrectOptionId)
	if correctID == "" {
		badRequest(w, "correctOptionId is required")
		return
	}
	for i := range body.Options {
		if strings.TrimSpace(body.Options[i].Text) == "" {
			badRequest(w, "option text must not be blank")
			return
		}
		if body.Options[i].Id == correctID {
			correctSeen = true
		}
	}
	if !correctSeen {
		badRequest(w, "correctOptionId must reference one of the options")
		return
	}

	difficulty := string(body.Difficulty)

	var updated store.Question
	var newOptions []store.Option

	err := h.Store.Tx(r.Context(), func(q *store.Queries) error {
		// Guard existence inside the transaction so a missing question aborts
		// before any writes occur.
		if _, gerr := q.GetQuestion(r.Context(), id); gerr != nil {
			return gerr
		}

		// Replace the option set: drop the old rows and re-insert from the body
		// in declared order. The freshly created options carry server-assigned
		// ids, so the correct option is re-anchored by its position in the body.
		if derr := q.DeleteOptionsByQuestion(r.Context(), id); derr != nil {
			return derr
		}

		var correctOptionID string
		newOptions = make([]store.Option, 0, len(body.Options))
		for i := range body.Options {
			created, cerr := q.CreateOption(r.Context(), store.CreateOptionParams{
				QuestionID: id,
				Text:       strings.TrimSpace(body.Options[i].Text),
				Order:      int32(i),
			})
			if cerr != nil {
				return cerr
			}
			if body.Options[i].Id == correctID {
				correctOptionID = created.ID
			}
			newOptions = append(newOptions, created)
		}

		uq, uerr := q.UpdateQuestion(r.Context(), store.UpdateQuestionParams{
			ID:              id,
			TopicID:         body.TopicId,
			Text:            &body.Text,
			CorrectOptionID: &correctOptionID,
			Difficulty:      &difficulty,
			Enabled:         &body.Enabled,
		})
		if uerr != nil {
			return uerr
		}
		updated = uq
		return nil
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "question not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, questionToContract(updated, newOptions))
}

// DeleteQuestion handles DELETE /questions/{id}: removes the question and its
// options atomically, returning 204 on success and a 404 Problem{NOT_FOUND}
// envelope when the question does not exist. Options are cascaded explicitly
// inside the transaction so the question and its dependents disappear together
// (CONTRACTS.md §C05). Parent-guarded.
func (h *Handlers) DeleteQuestion(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	err := h.Store.Tx(r.Context(), func(q *store.Queries) error {
		// Confirm existence first so a missing question yields a 404 envelope
		// rather than a silent 204.
		if _, gerr := q.GetQuestion(r.Context(), id); gerr != nil {
			return gerr
		}
		if derr := q.DeleteOptionsByQuestion(r.Context(), id); derr != nil {
			return derr
		}
		return q.DeleteQuestion(r.Context(), id)
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "question not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// questionToContract maps a sqlc store.Question plus its options to the generated
// contract type. Both sides use string ids; the topicId column is nullable (*T).
func questionToContract(q store.Question, opts []store.Option) contracts.Question {
	options := make([]contracts.Option, 0, len(opts))
	for i := range opts {
		options = append(options, contracts.Option{
			Id:   opts[i].ID,
			Text: opts[i].Text,
		})
	}
	return contracts.Question{
		Id:              q.ID,
		SubjectId:       q.SubjectID,
		TopicId:         q.TopicID,
		Text:            q.Text,
		CorrectOptionId: q.CorrectOptionID,
		Difficulty:      contracts.Difficulty(q.Difficulty),
		Enabled:         q.Enabled,
		Options:         options,
	}
}
