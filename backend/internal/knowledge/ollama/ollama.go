package ollama

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/shafqat/studyrover/backend/internal/knowledge"
)

// Source is the Ollama-Cloud implementation of knowledge.Source. It performs
// grounded generation with citations and streamed tutor answers through the
// Ollama Cloud native API (POST {base}/api/chat).
//
// Unlike the Gemini adapter it does not do document understanding/OCR: Ollama
// Cloud has no such surface, so Ingest returns an error directing callers to the
// Gemini/NotebookLM adapter for ingestion. It holds no hidden global state and
// degrades gracefully: when no API key is configured every generating method
// returns ErrNoAPIKey rather than panicking.
type Source struct {
	client *client
}

// compile-time assertion that Source satisfies the seam.
var _ knowledge.Source = (*Source)(nil)

// New constructs an Ollama-backed knowledge.Source from cfg. It never returns an
// error; a missing API key surfaces lazily as ErrNoAPIKey on first use so wiring
// stays simple and the process still starts in environments without a key.
func New(cfg Config) *Source {
	return &Source{client: newClient(cfg)}
}

// Ingest is not supported by the Ollama Cloud adapter: Ollama Cloud has no
// document-understanding/OCR surface. Callers should route document ingestion
// through the Gemini (or NotebookLM) adapter instead. It returns an error rather
// than panicking, matching the Source contract's graceful-degradation rule.
func (s *Source) Ingest(ctx context.Context, req knowledge.IngestRequest) (knowledge.JobID, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	return "", fmt.Errorf("ollama: ingest not supported; use gemini/notebooklm for document ingestion")
}

// DeriveSyllabus asks the model to propose a hierarchical topic outline for the
// subject and returns the suggestions. The worker persists them as the job
// result. gpt-oss does not reliably enforce the structured-output `format`
// param, so a strict JSON-only prompt plus extractJSON is used instead.
func (s *Source) DeriveSyllabus(ctx context.Context, req knowledge.SyllabusRequest) ([]knowledge.TopicSuggestion, error) {
	if req.SubjectID == "" {
		return nil, fmt.Errorf("ollama: syllabus: subjectID required")
	}
	system := "You are an expert curriculum designer. Respond with ONLY valid JSON, no markdown, no code fences, no prose."
	user := fmt.Sprintf(`You are designing a study syllabus for subject %q based on its ingested source material.
Produce a hierarchical topic outline.
Respond with ONLY valid JSON matching this shape, no markdown, no prose:
[{"name":string,"sourceId":string,"pageStart":int,"pageEnd":int,"order":int,"children":[ ... same shape ... ]}]`, req.SubjectID)

	raw, err := s.client.chat(ctx, []chatMessage{
		{Role: "system", Content: system},
		{Role: "user", Content: user},
	})
	if err != nil {
		return nil, err
	}

	var wire []syllabusNode
	if err := json.Unmarshal([]byte(extractJSON(raw)), &wire); err != nil {
		return nil, fmt.Errorf("ollama: syllabus: parse output: %w", err)
	}
	return toTopicSuggestions(wire), nil
}

// GenerateQuestions drafts multiple-choice questions grounded in the subject's
// sources, returning unapproved drafts (parent approval gates the live bank).
func (s *Source) GenerateQuestions(ctx context.Context, req knowledge.GenRequest) ([]knowledge.QuestionDraft, error) {
	if req.SubjectID == "" {
		return nil, fmt.Errorf("ollama: questions: subjectID required")
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

	system := "You are an expert assessment author. Respond with ONLY valid JSON, no markdown, no code fences, no prose."
	user := fmt.Sprintf(`Generate %d multiple-choice questions for subject %q, scoped to %s, at %s.
Ground every question in the subject's source material and include citations.
Respond with ONLY a valid JSON array matching this shape, no markdown, no prose:
[{"text":string,"options":[{"text":string}],"correctOptionIndex":int,"difficulty":string,
  "citations":[{"sourceId":string,"label":string,"locator":string}]}]`,
		count, req.SubjectID, scope, difficulty)

	raw, err := s.client.chat(ctx, []chatMessage{
		{Role: "system", Content: system},
		{Role: "user", Content: user},
	})
	if err != nil {
		return nil, err
	}

	var wire []questionNode
	if err := json.Unmarshal([]byte(extractJSON(raw)), &wire); err != nil {
		return nil, fmt.Errorf("ollama: questions: parse output: %w", err)
	}
	return toQuestionDrafts(req.SubjectID, req.TopicID, wire), nil
}

// GenerateStudyGuide produces a grounded, citation-bearing study guide.
func (s *Source) GenerateStudyGuide(ctx context.Context, req knowledge.GuideRequest) (knowledge.StudyGuide, error) {
	if req.SubjectID == "" {
		return knowledge.StudyGuide{}, fmt.Errorf("ollama: guide: subjectID required")
	}
	scope := "the whole subject"
	if req.TopicID != "" {
		scope = fmt.Sprintf("topic %q", req.TopicID)
	}
	system := "You are an expert tutor. Respond with ONLY valid JSON, no markdown wrapping, no code fences, no prose outside the JSON."
	user := fmt.Sprintf(`Write a study guide in Markdown for subject %q, scoped to %s, grounded in its source material.
Respond with ONLY a valid JSON object matching this shape, no code fences, no prose:
{"markdown":string,"citations":[{"sourceId":string,"label":string,"locator":string}]}`,
		req.SubjectID, scope)

	raw, err := s.client.chat(ctx, []chatMessage{
		{Role: "system", Content: system},
		{Role: "user", Content: user},
	})
	if err != nil {
		return knowledge.StudyGuide{}, err
	}

	var wire guideNode
	if err := json.Unmarshal([]byte(extractJSON(raw)), &wire); err != nil {
		return knowledge.StudyGuide{}, fmt.Errorf("ollama: guide: parse output: %w", err)
	}
	return knowledge.StudyGuide{
		SubjectID: req.SubjectID,
		TopicID:   req.TopicID,
		Markdown:  wire.Markdown,
		Citations: toCitations(wire.Citations),
	}, nil
}

// AnswerGrounded streams the tutor's answer back over a channel. Any setup error
// (for example a missing key) is returned synchronously with a nil channel;
// otherwise streaming runs in a goroutine and closes the channel when complete
// or when ctx is cancelled. The model emits empty content deltas during its
// thinking phase, which the client filters out, so only real answer text flows.
func (s *Source) AnswerGrounded(ctx context.Context, req knowledge.AskRequest) (<-chan knowledge.AnswerChunk, error) {
	if req.Text == "" {
		return nil, fmt.Errorf("ollama: answer: empty question")
	}
	if s.client.apiKey == "" {
		return nil, ErrNoAPIKey
	}

	msgs := make([]chatMessage, 0, 2)
	if req.SystemPrompt != "" {
		msgs = append(msgs, chatMessage{Role: "system", Content: req.SystemPrompt})
	}
	msgs = append(msgs, chatMessage{Role: "user", Content: req.Text})

	out := make(chan knowledge.AnswerChunk)
	go func() {
		defer close(out)
		err := s.client.streamChat(ctx, msgs, func(delta string) error {
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

// extractJSON trims common LLM framing (markdown code fences, leading prose) so
// the raw JSON payload can be unmarshalled even when the model wraps it. It
// strips a leading ```json/``` fence and then narrows to the first balanced JSON
// value (object or array) found in the remaining text.
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
	if v := firstBalancedJSON(s); v != "" {
		return v
	}
	return s
}

// firstBalancedJSON returns the first balanced JSON object or array value in s,
// honouring string literals and escapes so braces/brackets inside strings do not
// throw off the depth count. It returns "" when no balanced value is found.
func firstBalancedJSON(s string) string {
	start := -1
	var open, close byte
	for i := 0; i < len(s); i++ {
		if s[i] == '{' {
			start, open, close = i, '{', '}'
			break
		}
		if s[i] == '[' {
			start, open, close = i, '[', ']'
			break
		}
	}
	if start < 0 {
		return ""
	}
	depth := 0
	inStr := false
	escaped := false
	for i := start; i < len(s); i++ {
		ch := s[i]
		if inStr {
			if escaped {
				escaped = false
			} else if ch == '\\' {
				escaped = true
			} else if ch == '"' {
				inStr = false
			}
			continue
		}
		switch ch {
		case '"':
			inStr = true
		case open:
			depth++
		case close:
			depth--
			if depth == 0 {
				return s[start : i+1]
			}
		}
	}
	return ""
}
