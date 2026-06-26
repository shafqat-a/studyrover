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

// ListQuestionDrafts handles GET /questions/drafts: a parent-guarded, paginated
// list of AI-generated question drafts awaiting review (PageOfQuestionDraft,
// CONTRACTS-P2 §2-C05). The optional ?subjectId and ?topicId narrow the result to
// a single subject/topic, and ?status (pending|approved|rejected) filters by
// review state. The underlying store query filters by status server-side; the
// subject/topic narrowing and pagination are applied here over the (newest-first)
// result set.
func (h *Handlers) ListQuestionDrafts(w http.ResponseWriter, r *http.Request, params contracts.ListQuestionDraftsParams) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	// Optional status filter. Reject any value outside the contract enum so the
	// caller gets a clear 400 rather than a silently empty page.
	var status *string
	if raw := strings.TrimSpace(r.URL.Query().Get("status")); raw != "" {
		if !contracts.QuestionDraftStatus(raw).Valid() {
			badRequest(w, "status must be one of pending, approved, rejected")
			return
		}
		s := raw
		status = &s
	}

	var subjectID string
	if params.SubjectId != nil {
		subjectID = strings.TrimSpace(*params.SubjectId)
	}
	var topicID string
	if params.TopicId != nil {
		topicID = strings.TrimSpace(*params.TopicId)
	}

	rows, err := h.Store.ListQuestionDrafts(r.Context(), status)
	if err != nil {
		internalError(w, err.Error())
		return
	}

	// Apply the subject/topic filters that the store query does not cover.
	filtered := rows[:0]
	for i := range rows {
		if subjectID != "" && rows[i].SubjectID != subjectID {
			continue
		}
		if topicID != "" {
			if rows[i].TopicID == nil || *rows[i].TopicID != topicID {
				continue
			}
		}
		filtered = append(filtered, rows[i])
	}

	total := len(filtered)

	page, pageSize, limit, offset := pagination(r)
	if offset > total {
		offset = total
	}
	end := offset + limit
	if end > total {
		end = total
	}
	pageRows := filtered[offset:end]

	items := make([]contracts.QuestionDraft, 0, len(pageRows))
	for i := range pageRows {
		draft, err := toContractQuestionDraft(pageRows[i])
		if err != nil {
			internalError(w, err.Error())
			return
		}
		items = append(items, draft)
	}

	writeJSON(w, http.StatusOK, contracts.PageOfQuestionDraft{
		Items:    items,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
	})
}

// ApproveQuestionDraft handles POST /questions/drafts/{id}/approve: promotes a
// pending draft into a live, valid Question (CONTRACTS.md §C05) and marks the
// draft approved, returning 201 with the created Question. The draft's options
// and answer key are materialised into a real Question + Options exactly as the
// authoring CreateQuestion flow does (correct_option_id resolved from the stored
// correctOptionIndex), so the produced question is immediately eligible for the
// exam bank. Creating the question and flipping the draft status run in a single
// transaction so a partially promoted draft is never persisted. Already-decided
// drafts (approved/rejected) are rejected with 409. Parent-guarded.
func (h *Handlers) ApproveQuestionDraft(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	draft, err := h.Store.GetQuestionDraft(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "question draft not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	if draft.Status != string(contracts.Pending) {
		conflict(w, "draft has already been "+draft.Status)
		return
	}

	options, err := decodeDraftOptions(draft.Options)
	if err != nil {
		internalError(w, err.Error())
		return
	}

	// Defensive revalidation: a draft must satisfy the same authoring invariants
	// as a hand-written question before it can enter the live bank.
	if len(options) < 4 {
		badRequest(w, "draft must have at least four options")
		return
	}
	idx := int(draft.CorrectOptionIndex)
	if idx < 0 || idx >= len(options) {
		badRequest(w, "draft correctOptionIndex is out of range")
		return
	}

	difficulty := string(contracts.DifficultyMedium)
	if draft.Difficulty != nil && strings.TrimSpace(*draft.Difficulty) != "" {
		difficulty = *draft.Difficulty
	}

	var (
		question store.Question
		created  []store.Option
	)
	err = h.Store.Tx(r.Context(), func(q *store.Queries) error {
		// correct_option_id is NOT NULL but option ids are unknown until the
		// options (which need the question id) exist; write a placeholder key
		// first, create the options, then point the key at the chosen option.
		newQ, err := q.CreateQuestion(r.Context(), store.CreateQuestionParams{
			SubjectID:       draft.SubjectID,
			TopicID:         draft.TopicID,
			Text:            draft.Text,
			CorrectOptionID: "pending",
			Difficulty:      difficulty,
			Enabled:         nil, // COALESCE($6, true): default enabled = true
		})
		if err != nil {
			return err
		}

		created = make([]store.Option, 0, len(options))
		for i := range options {
			opt, err := q.CreateOption(r.Context(), store.CreateOptionParams{
				QuestionID: newQ.ID,
				Text:       options[i].Text,
				Order:      int32(i),
			})
			if err != nil {
				return err
			}
			created = append(created, opt)
		}

		correctID := created[idx].ID
		updated, err := q.UpdateQuestion(r.Context(), store.UpdateQuestionParams{
			ID:              newQ.ID,
			CorrectOptionID: &correctID,
		})
		if err != nil {
			return err
		}
		question = updated

		_, err = q.SetQuestionDraftStatus(r.Context(), store.SetQuestionDraftStatusParams{
			ID:     draft.ID,
			Status: string(contracts.Approved),
		})
		return err
	})
	if err != nil {
		internalError(w, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, toContractQuestion(question, created))
}

// RejectQuestionDraft handles POST /questions/drafts/{id}/reject: marks a pending
// draft rejected so it is excluded from the live bank, returning 200 with the
// updated QuestionDraft (CONTRACTS-P2 §2-C05). Already-decided drafts are rejected
// with 409. Parent-guarded.
func (h *Handlers) RejectQuestionDraft(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	draft, err := h.Store.GetQuestionDraft(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "question draft not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	if draft.Status != string(contracts.Pending) {
		conflict(w, "draft has already been "+draft.Status)
		return
	}

	updated, err := h.Store.SetQuestionDraftStatus(r.Context(), store.SetQuestionDraftStatusParams{
		ID:     draft.ID,
		Status: string(contracts.Rejected),
	})
	if err != nil {
		internalError(w, err.Error())
		return
	}

	out, err := toContractQuestionDraft(updated)
	if err != nil {
		internalError(w, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, out)
}

// decodeDraftOptions unmarshals the JSON-encoded option list stored on a draft
// (a `[{ "text": ... }]` array) into the contract option shape.
func decodeDraftOptions(raw []byte) ([]contracts.QuestionDraftOption, error) {
	options := []contracts.QuestionDraftOption{}
	if len(raw) == 0 {
		return options, nil
	}
	if err := json.Unmarshal(raw, &options); err != nil {
		return nil, err
	}
	return options, nil
}

// toContractQuestionDraft maps a sqlc store.QuestionDraft to the generated
// contract type. The options column is stored as JSON and decoded here; ids are
// strings and the optional topicId/difficulty are nullable on the store side.
func toContractQuestionDraft(d store.QuestionDraft) (contracts.QuestionDraft, error) {
	options, err := decodeDraftOptions(d.Options)
	if err != nil {
		return contracts.QuestionDraft{}, err
	}

	difficulty := contracts.DifficultyMedium
	if d.Difficulty != nil && strings.TrimSpace(*d.Difficulty) != "" {
		difficulty = contracts.Difficulty(*d.Difficulty)
	}

	return contracts.QuestionDraft{
		Id:                 d.ID,
		SubjectId:          d.SubjectID,
		TopicId:            d.TopicID,
		Text:               d.Text,
		Options:            options,
		CorrectOptionIndex: int(d.CorrectOptionIndex),
		Difficulty:         difficulty,
		Status:             contracts.QuestionDraftStatus(d.Status),
	}, nil
}
