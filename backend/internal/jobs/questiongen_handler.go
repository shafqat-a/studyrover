package jobs

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/core"
	"github.com/shafqat/studyrover/backend/internal/knowledge"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// QuestionGenPayload is the queued request for a "questions" job (2-A09). The HTTP
// handler encodes it as the job payload and the worker decodes it here. It mirrors
// knowledge.GenRequest: the subject to draw from, an optional topic scope, the
// desired draft count, and an optional difficulty hint.
type QuestionGenPayload struct {
	SubjectID  string `json:"subjectId"`
	TopicID    string `json:"topicId,omitempty"`
	Count      int    `json:"count"`
	Difficulty string `json:"difficulty,omitempty"`
}

// QuestionGenResult is the JSON result stored on a completed "questions" job
// (contract 2-C03 Job.result). It summarises the generation outcome so a poller
// can show how many drafts were produced, persisted, and rejected by validation
// without having to fetch the draft list separately.
type QuestionGenResult struct {
	// Generated is the number of drafts the knowledge backend returned.
	Generated int `json:"generated"`
	// Persisted is the number of valid drafts written to the review queue.
	Persisted int `json:"persisted"`
	// Rejected is the number of drafts dropped because they failed validation.
	Rejected int `json:"rejected"`
	// DraftIDs are the ids of the persisted (pending) drafts.
	DraftIDs []string `json:"draftIds"`
}

// QuestionGenHandler processes "questions" jobs (2-A09): it asks the
// knowledge.Source seam to draft multiple-choice questions grounded in a
// subject's ingested sources, validates each draft (2-L03) and persists the
// well-formed ones as question_draft rows in the pending review state (§6
// anti-gaming: generated questions require parent approval before entering the
// live bank).
//
// It implements the jobs.Handler interface and is registered under TypeQuestions
// at wiring time (2-W04).
type QuestionGenHandler struct {
	Knowledge knowledge.Source
	Store     store.Store
}

// NewQuestionGenHandler builds a QuestionGenHandler over the given knowledge
// source and store.
func NewQuestionGenHandler(src knowledge.Source, st store.Store) *QuestionGenHandler {
	return &QuestionGenHandler{Knowledge: src, Store: st}
}

// Handle generates question drafts for the job's subject, validates each, and
// inserts the valid ones as pending drafts. It returns a QuestionGenResult
// summary as the JSON job result. Invalid drafts are dropped (not persisted) so
// the review queue stays trustworthy; a generation or persistence failure returns
// an error so the worker can retry.
func (h *QuestionGenHandler) Handle(ctx context.Context, job Job, prog ProgressFunc) ([]byte, error) {
	if h.Knowledge == nil {
		return nil, fmt.Errorf("questiongen: knowledge source not configured")
	}
	if h.Store == nil {
		return nil, fmt.Errorf("questiongen: store not configured")
	}

	var payload QuestionGenPayload
	if len(job.Payload) > 0 {
		if err := json.Unmarshal(job.Payload, &payload); err != nil {
			return nil, fmt.Errorf("questiongen: decode payload: %w", err)
		}
	}

	subjectID := payload.SubjectID
	if subjectID == "" && job.SubjectID != nil {
		subjectID = *job.SubjectID
	}
	if subjectID == "" {
		return nil, fmt.Errorf("questiongen: missing subject id")
	}

	count := payload.Count
	if count <= 0 {
		count = 10
	}

	_ = prog(ctx, 10)

	drafts, err := h.Knowledge.GenerateQuestions(ctx, knowledge.GenRequest{
		SubjectID:  subjectID,
		TopicID:    payload.TopicID,
		Count:      count,
		Difficulty: payload.Difficulty,
	})
	if err != nil {
		return nil, fmt.Errorf("questiongen: generate: %w", err)
	}

	_ = prog(ctx, 60)

	result := QuestionGenResult{
		Generated: len(drafts),
		DraftIDs:  []string{},
	}

	for i := range drafts {
		d := drafts[i]

		// Validate against the shared draft rules (2-L03) before persisting so a
		// malformed generation never reaches the parent review queue.
		if err := core.ValidateDraft(toContractDraft(subjectID, d)); err != nil {
			result.Rejected++
			continue
		}

		options := make([]contracts.QuestionDraftOption, 0, len(d.Options))
		for _, opt := range d.Options {
			options = append(options, contracts.QuestionDraftOption{Text: opt.Text})
		}
		optionsJSON, err := json.Marshal(options)
		if err != nil {
			return nil, fmt.Errorf("questiongen: marshal options: %w", err)
		}

		params := store.InsertQuestionDraftParams{
			SubjectID:          subjectID,
			Text:               d.Text,
			Options:            optionsJSON,
			CorrectOptionIndex: int32(d.CorrectOptionIndex),
		}
		if d.TopicID != "" {
			tid := d.TopicID
			params.TopicID = &tid
		} else if payload.TopicID != "" {
			tid := payload.TopicID
			params.TopicID = &tid
		}
		if d.Difficulty != "" {
			diff := d.Difficulty
			params.Difficulty = &diff
		}

		row, err := h.Store.InsertQuestionDraft(ctx, params)
		if err != nil {
			return nil, fmt.Errorf("questiongen: persist draft: %w", err)
		}
		result.Persisted++
		result.DraftIDs = append(result.DraftIDs, row.ID)
	}

	_ = prog(ctx, 95)

	out, err := json.Marshal(result)
	if err != nil {
		return nil, fmt.Errorf("questiongen: marshal result: %w", err)
	}
	return out, nil
}

// toContractDraft adapts a knowledge.QuestionDraft to the contracts.QuestionDraft
// shape that core.ValidateDraft (2-L03) expects. Only the fields the validator
// reads (text, options, correctOptionIndex) need to be faithful; the subject id
// is filled from the job scope for completeness.
func toContractDraft(subjectID string, d knowledge.QuestionDraft) contracts.QuestionDraft {
	options := make([]contracts.QuestionDraftOption, 0, len(d.Options))
	for _, opt := range d.Options {
		options = append(options, contracts.QuestionDraftOption{Text: opt.Text})
	}
	out := contracts.QuestionDraft{
		SubjectId:          subjectID,
		Text:               d.Text,
		Options:            options,
		CorrectOptionIndex: d.CorrectOptionIndex,
	}
	if d.SubjectID != "" {
		out.SubjectId = d.SubjectID
	}
	if d.TopicID != "" {
		tid := d.TopicID
		out.TopicId = &tid
	}
	return out
}
