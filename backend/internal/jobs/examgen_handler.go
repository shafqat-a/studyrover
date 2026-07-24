package jobs

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/shafqat/studyrover/backend/internal/core"
	"github.com/shafqat/studyrover/backend/internal/knowledge"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// ExamGenTopic is one topic in an exam-generation request and how many questions
// to author from it.
type ExamGenTopic struct {
	TopicID string `json:"topicId"`
	Count   int    `json:"count"`
}

// ExamGenPayload is the queued request for an "exam" job: generate the requested
// questions per topic and assemble them into a ready-to-take, pinned exam.
type ExamGenPayload struct {
	SubjectID  string         `json:"subjectId"`
	Name       string         `json:"name"`
	PassBar    *int           `json:"passBar,omitempty"`
	Difficulty string         `json:"difficulty,omitempty"`
	Topics     []ExamGenTopic `json:"topics"`
}

// ExamGenResult is the JSON result stored on a completed "exam" job.
type ExamGenResult struct {
	ExamDefinitionID string `json:"examDefinitionId"`
	Generated        int    `json:"generated"`
	Rejected         int    `json:"rejected"`
}

// ExamGenHandler processes "exam" jobs: it asks the knowledge backend to author
// N questions per topic from its curriculum knowledge (no ingested sources / no
// question bank), persists each valid one as a disabled+generated question (so
// it never appears in the bank or the sampled pool), and creates an exam
// definition pinned to exactly those questions.
type ExamGenHandler struct {
	Knowledge knowledge.Source
	Store     store.Store
}

// NewExamGenHandler builds an ExamGenHandler over the given knowledge source and
// store.
func NewExamGenHandler(src knowledge.Source, st store.Store) *ExamGenHandler {
	return &ExamGenHandler{Knowledge: src, Store: st}
}

// Handle generates the per-topic questions, persists them, and creates the pinned
// exam. It returns an ExamGenResult (with the created exam id) as the job result.
func (h *ExamGenHandler) Handle(ctx context.Context, job Job, prog ProgressFunc) ([]byte, error) {
	if h.Knowledge == nil {
		return nil, fmt.Errorf("examgen: knowledge source not configured")
	}
	if h.Store == nil {
		return nil, fmt.Errorf("examgen: store not configured")
	}

	var p ExamGenPayload
	if len(job.Payload) > 0 {
		if err := json.Unmarshal(job.Payload, &p); err != nil {
			return nil, fmt.Errorf("examgen: decode payload: %w", err)
		}
	}
	if p.SubjectID == "" && job.SubjectID != nil {
		p.SubjectID = *job.SubjectID
	}
	if p.SubjectID == "" {
		return nil, fmt.Errorf("examgen: missing subject id")
	}
	if strings.TrimSpace(p.Name) == "" {
		return nil, fmt.Errorf("examgen: exam name required")
	}
	if len(p.Topics) == 0 {
		return nil, fmt.Errorf("examgen: at least one topic required")
	}

	subjectName := ""
	if s, err := h.Store.GetSubject(ctx, p.SubjectID); err == nil {
		subjectName = s.Name
	}

	_ = prog(ctx, 5)

	var (
		result      ExamGenResult
		questionIDs []string
		scopeSeen   = map[string]bool{}
		scopeTopics []string
		total, done int
	)
	for _, t := range p.Topics {
		if t.Count > 0 {
			total += t.Count
		}
	}

	for _, t := range p.Topics {
		if t.Count <= 0 || strings.TrimSpace(t.TopicID) == "" {
			continue
		}
		topicName := ""
		if tp, err := h.Store.GetTopic(ctx, t.TopicID); err == nil {
			topicName = tp.Name
		}

		drafts, err := h.Knowledge.GenerateQuestions(ctx, knowledge.GenRequest{
			SubjectID:   p.SubjectID,
			SubjectName: subjectName,
			TopicID:     t.TopicID,
			TopicName:   topicName,
			Count:       t.Count,
			Difficulty:  p.Difficulty,
		})
		if err != nil {
			return nil, fmt.Errorf("examgen: generate for topic %q: %w", topicName, err)
		}

		for i := range drafts {
			d := drafts[i]
			if err := core.ValidateDraft(toContractDraft(p.SubjectID, d)); err != nil {
				result.Rejected++
				continue
			}
			qid, err := h.persistQuestion(ctx, p.SubjectID, t.TopicID, d)
			if err != nil {
				return nil, fmt.Errorf("examgen: persist question: %w", err)
			}
			questionIDs = append(questionIDs, qid)
			result.Generated++
		}

		if !scopeSeen[t.TopicID] {
			scopeSeen[t.TopicID] = true
			scopeTopics = append(scopeTopics, t.TopicID)
		}
		done += t.Count
		if total > 0 {
			_ = prog(ctx, int32(5+done*85/total))
		}
	}

	if len(questionIDs) == 0 {
		return nil, fmt.Errorf("examgen: no valid questions were generated")
	}

	passBar := int32(70)
	if p.PassBar != nil {
		passBar = int32(*p.PassBar)
	}

	exam, err := h.Store.CreateExamDefinition(ctx, store.CreateExamDefinitionParams{
		SubjectID:     p.SubjectID,
		Name:          strings.TrimSpace(p.Name),
		Type:          "gate",
		ScopeTopicIds: scopeTopics,
		Size:          int32(len(questionIDs)),
		PassBar:       passBar,
		CooldownMin:   10,
		RewardStyle:   "flat",
		QuestionIds:   questionIDs,
	})
	if err != nil {
		return nil, fmt.Errorf("examgen: create exam: %w", err)
	}
	result.ExamDefinitionID = exam.ID

	_ = prog(ctx, 100)
	return json.Marshal(result)
}

// persistQuestion writes a single generated question (disabled + generated) with
// its options in a transaction and returns the new question id.
func (h *ExamGenHandler) persistQuestion(ctx context.Context, subjectID, topicID string, d knowledge.QuestionDraft) (string, error) {
	difficulty := strings.TrimSpace(d.Difficulty)
	if difficulty == "" {
		difficulty = "medium"
	}
	tid := topicID
	var qid string
	err := h.Store.Tx(ctx, func(q *store.Queries) error {
		// correct_option_id is NOT NULL but option ids are unknown until the
		// options exist; write a placeholder, create the options, then point it at
		// the correct one.
		newQ, err := q.CreateQuestion(ctx, store.CreateQuestionParams{
			SubjectID:       subjectID,
			TopicID:         &tid,
			Text:            d.Text,
			CorrectOptionID: "pending",
			Difficulty:      difficulty,
			Enabled:         false, // never enters the sampled bank
			Generated:       true,  // hidden from the manual bank view
		})
		if err != nil {
			return err
		}
		created := make([]store.Option, 0, len(d.Options))
		for oi := range d.Options {
			opt, err := q.CreateOption(ctx, store.CreateOptionParams{
				QuestionID: newQ.ID,
				Text:       d.Options[oi].Text,
				Order:      int32(oi),
			})
			if err != nil {
				return err
			}
			created = append(created, opt)
		}
		if d.CorrectOptionIndex < 0 || d.CorrectOptionIndex >= len(created) {
			return fmt.Errorf("correctOptionIndex %d out of range", d.CorrectOptionIndex)
		}
		correctID := created[d.CorrectOptionIndex].ID
		if _, err := q.UpdateQuestion(ctx, store.UpdateQuestionParams{
			ID:              newQ.ID,
			CorrectOptionID: &correctID,
		}); err != nil {
			return err
		}
		qid = newQ.ID
		return nil
	})
	return qid, err
}
