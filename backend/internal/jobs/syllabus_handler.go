package jobs

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/knowledge"
)

// SyllabusPayload is the queued request for a "syllabus" job (2-A07). It carries
// the subject whose ingested sources are analysed; the HTTP handler encodes it as
// the job payload and the worker decodes it here.
type SyllabusPayload struct {
	SubjectID string `json:"subjectId"`
}

// SyllabusHandler processes "syllabus" jobs (2-A07): it derives a suggested topic
// tree from a subject's ingested sources via the knowledge.Source seam and stores
// the result on the job as a TopicSuggestion[] (contract 2-C04 / 2-C03 Job.result).
//
// It implements the jobs.Handler interface and is registered under TypeSyllabus
// at wiring time (2-W04).
type SyllabusHandler struct {
	Knowledge knowledge.Source
}

// NewSyllabusHandler builds a SyllabusHandler over the given knowledge source.
func NewSyllabusHandler(src knowledge.Source) *SyllabusHandler {
	return &SyllabusHandler{Knowledge: src}
}

// Handle derives the syllabus for the job's subject and returns the suggestions
// as the JSON result payload. A missing knowledge source or an empty subject is a
// wiring/validation bug surfaced as a (non-retryable in practice) error.
func (h *SyllabusHandler) Handle(ctx context.Context, job Job, prog ProgressFunc) ([]byte, error) {
	if h.Knowledge == nil {
		return nil, fmt.Errorf("syllabus: knowledge source not configured")
	}

	var payload SyllabusPayload
	if len(job.Payload) > 0 {
		if err := json.Unmarshal(job.Payload, &payload); err != nil {
			return nil, fmt.Errorf("syllabus: decode payload: %w", err)
		}
	}

	subjectID := payload.SubjectID
	if subjectID == "" && job.SubjectID != nil {
		subjectID = *job.SubjectID
	}
	if subjectID == "" {
		return nil, fmt.Errorf("syllabus: missing subject id")
	}

	// Best-effort progress: signal that derivation has started.
	_ = prog(ctx, 10)

	suggestions, err := h.Knowledge.DeriveSyllabus(ctx, knowledge.SyllabusRequest{SubjectID: subjectID})
	if err != nil {
		return nil, fmt.Errorf("syllabus: derive: %w", err)
	}

	_ = prog(ctx, 90)

	// Marshal as the contract shape (TopicSuggestion[]) so Job.result is wire
	// consistent with what the apply endpoint (2-A08) consumes.
	result, err := json.Marshal(map[string]any{"topics": toContractTopicSuggestions(suggestions)})
	if err != nil {
		return nil, fmt.Errorf("syllabus: marshal result: %w", err)
	}
	return result, nil
}

// toContractTopicSuggestions maps the knowledge package's TopicSuggestion tree to
// the generated contract type, recursing into children. Optional provenance
// fields (sourceId, pageStart, pageEnd) become nil when unset.
func toContractTopicSuggestions(in []knowledge.TopicSuggestion) []contracts.TopicSuggestion {
	out := make([]contracts.TopicSuggestion, 0, len(in))
	for i := range in {
		out = append(out, toContractTopicSuggestion(in[i]))
	}
	return out
}

func toContractTopicSuggestion(t knowledge.TopicSuggestion) contracts.TopicSuggestion {
	c := contracts.TopicSuggestion{
		Name:  t.Name,
		Order: t.Order,
	}
	if t.SourceID != "" {
		sid := t.SourceID
		c.SourceId = &sid
	}
	if t.PageStart != 0 {
		ps := t.PageStart
		c.PageStart = &ps
	}
	if t.PageEnd != 0 {
		pe := t.PageEnd
		c.PageEnd = &pe
	}
	if len(t.Children) > 0 {
		children := toContractTopicSuggestions(t.Children)
		c.Children = &children
	}
	return c
}
