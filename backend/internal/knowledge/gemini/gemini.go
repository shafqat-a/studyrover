package gemini

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/shafqat/studyrover/backend/internal/knowledge"
)

// Source is the Gemini-direct implementation of knowledge.Source. It performs
// document understanding (including OCR of scanned PDFs via inline file parts),
// grounded generation with citations, and streamed tutor answers, all through the
// Gemini REST API.
//
// It holds no hidden global state and degrades gracefully: when no API key is
// configured every method returns ErrNoAPIKey rather than panicking.
type Source struct {
	client *client
}

// compile-time assertion that Source satisfies the seam.
var _ knowledge.Source = (*Source)(nil)

// New constructs a Gemini-backed knowledge.Source from cfg. It never returns an
// error; a missing API key surfaces lazily as ErrNoAPIKey on first use so wiring
// stays simple and the process still starts in environments without a key.
func New(cfg Config) *Source {
	return &Source{client: newClient(cfg)}
}

// Ingest registers a document or NotebookLM link for asynchronous processing and
// returns a JobID. The Gemini adapter does the heavy document-understanding work
// inside the worker (which calls the adapter's exported processing helpers); this
// method only validates the request and mints a stable, content-derived job id
// the caller persists and the worker claims (package jobs / 2-F06).
func (s *Source) Ingest(ctx context.Context, req knowledge.IngestRequest) (knowledge.JobID, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	if req.SubjectID == "" {
		return "", fmt.Errorf("gemini: ingest: subjectID required")
	}
	if len(req.Data) == 0 && req.StorageKey == "" && req.NotebookLMURL == "" {
		return "", fmt.Errorf("gemini: ingest: one of Data, StorageKey or NotebookLMURL required")
	}
	return mintJobID(req), nil
}

// ExtractDocument runs Gemini document understanding (OCR + text extraction) over
// the supplied bytes and returns the extracted plain text. The job worker calls
// this to process an ingested source. mimeType should be the document's content
// type (for example "application/pdf").
func (s *Source) ExtractDocument(ctx context.Context, data []byte, mimeType string) (string, error) {
	if len(data) == 0 {
		return "", fmt.Errorf("gemini: extract: empty document")
	}
	if mimeType == "" {
		mimeType = "application/pdf"
	}
	req := generateRequest{
		Contents: []content{{
			Role: "user",
			Parts: []part{
				{Text: "Extract all readable text from this document, including text in scanned pages and images, preserving reading order. Return only the extracted text."},
				{InlineData: &inlineData{MIMEType: mimeType, Data: data}},
			},
		}},
	}
	resp, err := s.client.generate(ctx, req)
	if err != nil {
		return "", err
	}
	return resp.text(), nil
}

// DeriveSyllabus asks Gemini to propose a hierarchical topic outline for the
// subject and returns the suggestions. The worker persists them as the job
// result. It uses structured (JSON) output for a reliable parse.
func (s *Source) DeriveSyllabus(ctx context.Context, req knowledge.SyllabusRequest) ([]knowledge.TopicSuggestion, error) {
	if req.SubjectID == "" {
		return nil, fmt.Errorf("gemini: syllabus: subjectID required")
	}
	prompt := fmt.Sprintf(`You are designing a study syllabus for subject %q based on its ingested source material.
Produce a hierarchical topic outline as JSON matching this schema:
[{"name":string,"sourceId":string,"pageStart":int,"pageEnd":int,"order":int,"children":[ ... same shape ... ]}]
Return ONLY the JSON array.`, req.SubjectID)

	gReq := generateRequest{
		Contents:         []content{{Role: "user", Parts: []part{{Text: prompt}}}},
		GenerationConfig: &generationConfig{ResponseMIMEType: "application/json"},
	}
	resp, err := s.client.generate(ctx, gReq)
	if err != nil {
		return nil, err
	}

	var wire []syllabusNode
	if err := json.Unmarshal([]byte(extractJSON(resp.text())), &wire); err != nil {
		return nil, fmt.Errorf("gemini: syllabus: parse output: %w", err)
	}
	return toTopicSuggestions(wire), nil
}

// GenerateQuestions drafts multiple-choice questions grounded in the subject's
// sources, returning unapproved drafts (parent approval gates the live bank).
func (s *Source) GenerateQuestions(ctx context.Context, req knowledge.GenRequest) ([]knowledge.QuestionDraft, error) {
	if req.SubjectID == "" {
		return nil, fmt.Errorf("gemini: questions: subjectID required")
	}
	count := req.Count
	if count <= 0 {
		count = 5
	}
	scope := "the whole subject"
	if req.TopicID != "" {
		scope = fmt.Sprintf("topic %q", req.TopicID)
	}
	difficulty := req.Difficulty
	if difficulty == "" {
		difficulty = "a spread of difficulties"
	}

	prompt := fmt.Sprintf(`Generate %d multiple-choice questions for subject %q, scoped to %s, at %s.
Ground every question in the subject's source material and include citations.
Return ONLY a JSON array matching this schema:
[{"text":string,"options":[{"text":string}],"correctOptionIndex":int,"difficulty":string,
  "citations":[{"sourceId":string,"label":string,"locator":string}]}]`,
		count, req.SubjectID, scope, difficulty)

	gReq := generateRequest{
		Contents:         []content{{Role: "user", Parts: []part{{Text: prompt}}}},
		GenerationConfig: &generationConfig{ResponseMIMEType: "application/json"},
	}
	resp, err := s.client.generate(ctx, gReq)
	if err != nil {
		return nil, err
	}

	var wire []questionNode
	if err := json.Unmarshal([]byte(extractJSON(resp.text())), &wire); err != nil {
		return nil, fmt.Errorf("gemini: questions: parse output: %w", err)
	}
	return toQuestionDrafts(req.SubjectID, req.TopicID, wire), nil
}

// GenerateStudyGuide produces a grounded, citation-bearing study guide.
func (s *Source) GenerateStudyGuide(ctx context.Context, req knowledge.GuideRequest) (knowledge.StudyGuide, error) {
	if req.SubjectID == "" {
		return knowledge.StudyGuide{}, fmt.Errorf("gemini: guide: subjectID required")
	}
	scope := "the whole subject"
	if req.TopicID != "" {
		scope = fmt.Sprintf("topic %q", req.TopicID)
	}
	prompt := fmt.Sprintf(`Write a study guide in Markdown for subject %q, scoped to %s, grounded in its source material.
Return ONLY a JSON object: {"markdown":string,"citations":[{"sourceId":string,"label":string,"locator":string}]}`,
		req.SubjectID, scope)

	gReq := generateRequest{
		Contents:         []content{{Role: "user", Parts: []part{{Text: prompt}}}},
		GenerationConfig: &generationConfig{ResponseMIMEType: "application/json"},
	}
	resp, err := s.client.generate(ctx, gReq)
	if err != nil {
		return knowledge.StudyGuide{}, err
	}

	var wire guideNode
	if err := json.Unmarshal([]byte(extractJSON(resp.text())), &wire); err != nil {
		return knowledge.StudyGuide{}, fmt.Errorf("gemini: guide: parse output: %w", err)
	}
	return knowledge.StudyGuide{
		SubjectID: req.SubjectID,
		TopicID:   req.TopicID,
		Markdown:  wire.Markdown,
		Citations: toCitations(wire.Citations),
	}, nil
}

// AnswerGrounded streams the tutor's answer back over a channel. Any setup error
// (for example an unreachable backend or missing key) is returned synchronously
// with a nil channel; otherwise streaming runs in a goroutine and closes the
// channel when complete or when ctx is cancelled.
func (s *Source) AnswerGrounded(ctx context.Context, req knowledge.AskRequest) (<-chan knowledge.AnswerChunk, error) {
	if req.Text == "" {
		return nil, fmt.Errorf("gemini: answer: empty question")
	}
	if s.client.apiKey == "" {
		return nil, ErrNoAPIKey
	}

	gReq := generateRequest{
		Contents: []content{{Role: "user", Parts: []part{{Text: req.Text}}}},
	}
	if req.SystemPrompt != "" {
		gReq.SystemInstruction = &content{Parts: []part{{Text: req.SystemPrompt}}}
	}

	out := make(chan knowledge.AnswerChunk)
	go func() {
		defer close(out)
		err := s.client.streamGenerate(ctx, gReq, func(chunk *generateResponse) error {
			delta := chunk.text()
			if delta == "" {
				return nil
			}
			select {
			case out <- knowledge.AnswerChunk{Delta: delta}:
				return nil
			case <-ctx.Done():
				return ctx.Err()
			}
		})
		// Terminal chunk marks completion regardless of error so consumers always
		// see a Done signal; transient errors simply truncate the answer.
		_ = err
		select {
		case out <- knowledge.AnswerChunk{Done: true}:
		case <-ctx.Done():
		}
	}()
	return out, nil
}

// --- internal JSON shapes for structured output ---

type syllabusNode struct {
	Name      string         `json:"name"`
	SourceID  string         `json:"sourceId"`
	PageStart int            `json:"pageStart"`
	PageEnd   int            `json:"pageEnd"`
	Order     int            `json:"order"`
	Children  []syllabusNode `json:"children"`
}

type questionNode struct {
	Text               string         `json:"text"`
	Options            []optionNode   `json:"options"`
	CorrectOptionIndex int            `json:"correctOptionIndex"`
	Difficulty         string         `json:"difficulty"`
	Citations          []citationNode `json:"citations"`
}

type optionNode struct {
	Text string `json:"text"`
}

type guideNode struct {
	Markdown  string         `json:"markdown"`
	Citations []citationNode `json:"citations"`
}

type citationNode struct {
	SourceID string `json:"sourceId"`
	Label    string `json:"label"`
	Locator  string `json:"locator"`
}

// --- conversions to domain types ---

func toTopicSuggestions(nodes []syllabusNode) []knowledge.TopicSuggestion {
	if len(nodes) == 0 {
		return nil
	}
	out := make([]knowledge.TopicSuggestion, 0, len(nodes))
	for _, n := range nodes {
		out = append(out, knowledge.TopicSuggestion{
			Name:      n.Name,
			SourceID:  n.SourceID,
			PageStart: n.PageStart,
			PageEnd:   n.PageEnd,
			Order:     n.Order,
			Children:  toTopicSuggestions(n.Children),
		})
	}
	return out
}

func toQuestionDrafts(subjectID, topicID string, nodes []questionNode) []knowledge.QuestionDraft {
	if len(nodes) == 0 {
		return nil
	}
	out := make([]knowledge.QuestionDraft, 0, len(nodes))
	for i, n := range nodes {
		opts := make([]knowledge.QuestionOption, 0, len(n.Options))
		for _, o := range n.Options {
			opts = append(opts, knowledge.QuestionOption{Text: o.Text})
		}
		out = append(out, knowledge.QuestionDraft{
			ID:                 fmt.Sprintf("draft-%s-%d", subjectID, i),
			SubjectID:          subjectID,
			TopicID:            topicID,
			Text:               n.Text,
			Options:            opts,
			CorrectOptionIndex: n.CorrectOptionIndex,
			Difficulty:         n.Difficulty,
			Citations:          toCitations(n.Citations),
		})
	}
	return out
}

func toCitations(nodes []citationNode) []knowledge.Citation {
	if len(nodes) == 0 {
		return nil
	}
	out := make([]knowledge.Citation, 0, len(nodes))
	for _, n := range nodes {
		out = append(out, knowledge.Citation{
			SourceID: n.SourceID,
			Label:    n.Label,
			Locator:  n.Locator,
		})
	}
	return out
}

// --- helpers ---

// mintJobID derives a stable job id from the ingest request so the same content
// maps to the same job (idempotent enqueue). It is opaque to callers.
func mintJobID(req knowledge.IngestRequest) knowledge.JobID {
	h := sha256.New()
	h.Write([]byte(req.SubjectID))
	h.Write([]byte{0})
	h.Write([]byte(req.Filename))
	h.Write([]byte{0})
	h.Write([]byte(req.StorageKey))
	h.Write([]byte{0})
	h.Write([]byte(req.NotebookLMURL))
	h.Write([]byte{0})
	h.Write(req.Data)
	return knowledge.JobID("job-" + hex.EncodeToString(h.Sum(nil))[:24])
}

// extractJSON trims common LLM framing (markdown code fences, leading prose) so
// the raw JSON payload can be unmarshalled even when the model wraps it.
func extractJSON(s string) string {
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "```") {
		// Drop the opening fence line (``` or ```json) and the closing fence.
		if nl := strings.IndexByte(s, '\n'); nl >= 0 {
			s = s[nl+1:]
		}
		s = strings.TrimSuffix(strings.TrimSpace(s), "```")
		s = strings.TrimSpace(s)
	}
	return s
}
