package http

import (
	"net/http"
	"strings"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// ListQuestions handles GET /questions?subjectId=...&topicId=...: a parent-guarded,
// paginated list of authoring questions, each carrying its full set of options and
// the answer key (PageOfQuestion, CONTRACTS.md §C05/§C11). The subjectId query
// parameter is required; when topicId is also supplied the list is narrowed to that
// topic. Without subjectId the request is rejected with a 400 Problem{VALIDATION}.
func (h *Handlers) ListQuestions(w http.ResponseWriter, r *http.Request, params contracts.ListQuestionsParams) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	if params.SubjectId == nil || strings.TrimSpace(*params.SubjectId) == "" {
		badRequest(w, "subjectId is required")
		return
	}
	subjectID := strings.TrimSpace(*params.SubjectId)

	var topicID *string
	if params.TopicId != nil {
		if t := strings.TrimSpace(*params.TopicId); t != "" {
			topicID = &t
		}
	}

	page, pageSize, limit, offset := pagination(r)

	var (
		rows  []store.Question
		total int64
		err   error
	)
	if topicID != nil {
		rows, err = h.Store.ListQuestionsByTopic(r.Context(), store.ListQuestionsByTopicParams{
			TopicID: topicID,
			Limit:   int32(limit),
			Offset:  int32(offset),
		})
		if err != nil {
			internalError(w, err.Error())
			return
		}
		total, err = h.Store.CountQuestionsByTopic(r.Context(), topicID)
	} else {
		rows, err = h.Store.ListQuestionsBySubject(r.Context(), store.ListQuestionsBySubjectParams{
			SubjectID: subjectID,
			Limit:     int32(limit),
			Offset:    int32(offset),
		})
		if err != nil {
			internalError(w, err.Error())
			return
		}
		total, err = h.Store.CountQuestionsBySubject(r.Context(), subjectID)
	}
	if err != nil {
		internalError(w, err.Error())
		return
	}

	items := make([]contracts.Question, 0, len(rows))
	for i := range rows {
		opts, err := h.Store.ListOptionsByQuestion(r.Context(), rows[i].ID)
		if err != nil {
			internalError(w, err.Error())
			return
		}
		items = append(items, toContractQuestion(rows[i], opts))
	}

	writeJSON(w, http.StatusOK, contracts.PageOfQuestion{
		Items:    items,
		Total:    int(total),
		Page:     page,
		PageSize: pageSize,
	})
}

// CreateQuestion handles POST /questions: validates the CreateQuestion body
// (CONTRACTS.md §C05) — at least four options and a correctOptionIndex within range
// — then inserts the question and its options atomically. Because the answer key is
// stored as the chosen option's server-assigned id, the question is first written
// with a placeholder, the options are created (yielding their ids), and the question
// is updated to point correctOptionId at the option at correctOptionIndex. The whole
// sequence runs in a single transaction so a partially authored question is never
// persisted. Parent-guarded.
func (h *Handlers) CreateQuestion(w http.ResponseWriter, r *http.Request) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	var body contracts.CreateQuestion
	if !decodeJSON(w, r, &body) {
		return
	}

	body.SubjectId = strings.TrimSpace(body.SubjectId)
	if body.SubjectId == "" {
		badRequest(w, "subjectId is required")
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
	if body.CorrectOptionIndex < 0 || body.CorrectOptionIndex >= len(body.Options) {
		badRequest(w, "correctOptionIndex is out of range")
		return
	}

	optionTexts := make([]string, len(body.Options))
	for i := range body.Options {
		t := strings.TrimSpace(body.Options[i].Text)
		if t == "" {
			badRequest(w, "option text is required")
			return
		}
		optionTexts[i] = t
	}

	var topicID *string
	if body.TopicId != nil {
		if t := strings.TrimSpace(*body.TopicId); t != "" {
			topicID = &t
		}
	}

	difficulty := string(contracts.DifficultyMedium)
	if body.Difficulty != nil {
		difficulty = string(*body.Difficulty)
	}

	var (
		question store.Question
		options  []store.Option
	)
	err := h.Store.Tx(r.Context(), func(q *store.Queries) error {
		// correct_option_id is NOT NULL, but the option ids are not known until the
		// options are created (which in turn need the question id). Write the
		// question with a placeholder key first, then resolve it once the options
		// exist.
		created, err := q.CreateQuestion(r.Context(), store.CreateQuestionParams{
			SubjectID:       body.SubjectId,
			TopicID:         topicID,
			Text:            body.Text,
			CorrectOptionID: "pending",
			Difficulty:      difficulty,
			Enabled:         nil, // COALESCE($6, true): default enabled = true
		})
		if err != nil {
			return err
		}

		options = make([]store.Option, 0, len(optionTexts))
		for i, text := range optionTexts {
			opt, err := q.CreateOption(r.Context(), store.CreateOptionParams{
				QuestionID: created.ID,
				Text:       text,
				Order:      int32(i),
			})
			if err != nil {
				return err
			}
			options = append(options, opt)
		}

		correctID := options[body.CorrectOptionIndex].ID
		updated, err := q.UpdateQuestion(r.Context(), store.UpdateQuestionParams{
			ID:              created.ID,
			CorrectOptionID: &correctID,
		})
		if err != nil {
			return err
		}
		question = updated
		return nil
	})
	if err != nil {
		internalError(w, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, toContractQuestion(question, options))
}

// toContractQuestion maps a sqlc store.Question plus its options to the generated
// contract type. Both sides use string ids; the optional topicId is *string and the
// difficulty/enabled fields carry the stored values directly. This is the
// parent-facing (authoring) shape and includes the answer key (correctOptionId).
func toContractQuestion(q store.Question, opts []store.Option) contracts.Question {
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
