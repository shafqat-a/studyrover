package http

import (
	"context"

	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/core"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// assembleExamQuestions builds the ordered question set for an exam, WITH the
// answer key. Pinned/generated exams deliver exactly their question_ids
// (regardless of enabled state); bank exams sample the eligible pool by
// scope/size. Options are shuffled. Callers serving a student MUST strip the key
// via core.StripKey; the parent preview keeps it.
func (h *Handlers) assembleExamQuestions(ctx context.Context, def contracts.ExamDefinition) ([]contracts.Question, error) {
	var pinned []string
	if def.QuestionIds != nil {
		pinned = *def.QuestionIds
	}
	rng := core.NewRNG()

	if len(pinned) > 0 {
		rows, err := h.Store.GetQuestionsByIDs(ctx, pinned)
		if err != nil {
			return nil, err
		}
		byID := make(map[string]store.Question, len(rows))
		for i := range rows {
			byID[rows[i].ID] = rows[i]
		}
		out := make([]contracts.Question, 0, len(pinned))
		for _, qid := range pinned {
			row, ok := byID[qid]
			if !ok {
				continue // question deleted since generation; skip
			}
			opts, err := h.Store.ListOptionsByQuestion(ctx, row.ID)
			if err != nil {
				return nil, err
			}
			out = append(out, core.ShuffleOptions(toContractQuestion(row, opts), rng))
		}
		return out, nil
	}

	// Bank-sampled exam: load the eligible bank (enabled questions) and let
	// core apply the def's topic scope, selection (size) and option shuffling.
	rows, err := h.Store.ListEligibleForExam(ctx, store.ListEligibleForExamParams{
		SubjectID:     def.SubjectId,
		ScopeTopicIds: nil,
	})
	if err != nil {
		return nil, err
	}
	bank := make([]contracts.Question, 0, len(rows))
	for i := range rows {
		opts, err := h.Store.ListOptionsByQuestion(ctx, rows[i].ID)
		if err != nil {
			return nil, err
		}
		bank = append(bank, toContractQuestion(rows[i], opts))
	}
	return core.AssembleExamKeyed(def, bank, rng), nil
}
