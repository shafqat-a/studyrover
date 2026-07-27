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

// GenerateQuestions drafts multiple-choice questions for the subject, returning
// unapproved drafts (parent approval gates the live bank).
//
// It authors questions from the model's own knowledge of the named curriculum —
// no ingested source material or question bank is required — which is what makes
// DeepSeek on Ollama Cloud usable for subjects that only have a syllabus. When a
// subject does have sources the prompt still lets the model use them, but they
// are not mandatory and citations are optional.
func (s *Source) GenerateQuestions(ctx context.Context, req knowledge.GenRequest) ([]knowledge.QuestionDraft, error) {
	if req.SubjectID == "" {
		return nil, fmt.Errorf("ollama: questions: subjectID required")
	}
	count := req.Count
	if count <= 0 {
		count = 5
	}

	// Prefer the human-readable subject name; the raw UUID is meaningless to a
	// model authoring from curriculum knowledge.
	subject := req.SubjectName
	if subject == "" {
		subject = req.SubjectID
	}

	// Scope: a single named topic, an explicit list of syllabus topics, or the
	// whole subject.
	var scope string
	switch {
	case req.TopicName != "":
		scope = fmt.Sprintf("the topic %q", req.TopicName)
	case len(req.TopicNames) > 0:
		topics := req.TopicNames
		if len(topics) > 60 {
			topics = topics[:60]
		}
		scope = "these syllabus topics (spread the questions across them): " + strings.Join(topics, "; ")
	default:
		scope = "the whole subject syllabus"
	}

	difficulty := req.Difficulty
	if difficulty == "" {
		difficulty = "a spread of easy, medium and hard"
	}

	system := "You are an expert Cambridge assessment author. You write accurate, exam-style multiple-choice questions from your own knowledge of the curriculum. Respond with ONLY valid JSON, no markdown, no code fences, no prose."
	user := fmt.Sprintf(`Write %d multiple-choice questions for the subject %q, covering %s, at %s difficulty.
Author the questions from your own knowledge of this curriculum — do NOT require or refer to any source document, and do NOT ask about missing material.
Rules:
- Each question has exactly 4 distinct options and exactly one correct answer.
- "correctOptionIndex" is the 0-based index of the correct option.
- Keep questions factually accurate and at the level of the named subject.
- Do not number the questions or repeat them.
- Format the "text" and each option using HTML so formulas and figures render clearly:
  * Write mathematics as LaTeX — inline as \( ... \) and display as \[ ... \]. Use \lt \gt \le \ge instead of a raw < or > sign.
  * For geometry or any question that needs a figure, embed a self-contained inline <svg> with a viewBox and clearly labelled points, sides and angles, so the diagram is visible. Use SINGLE quotes for every SVG/HTML attribute. No <script>, no <foreignObject>, no external references or images.
  * Use <sub>, <sup> and <table> where they aid clarity. Plain text is fine when no formula or figure is needed.
- The response MUST be valid JSON: escape backslashes as \\ and double quotes as \". Using single-quoted SVG/HTML attributes avoids most escaping.
Respond with ONLY a valid JSON array matching this shape, no markdown, no prose:
[{"text":string,"options":[{"text":string},{"text":string},{"text":string},{"text":string}],"correctOptionIndex":int,"difficulty":string}]`,
		count, subject, scope, difficulty)

	raw, err := s.client.chat(ctx, []chatMessage{
		{Role: "system", Content: system},
		{Role: "user", Content: user},
	})
	if err != nil {
		return nil, err
	}

	var wire []questionNode
	js := extractJSON(raw)
	if err := json.Unmarshal([]byte(js), &wire); err != nil {
		// LaTeX/HTML content is backslash-heavy and models often under-escape it
		// (e.g. \frac or \( instead of \\frac / \\(). Repair lone backslashes and
		// retry once; well-escaped output already parsed on the first attempt.
		if err2 := json.Unmarshal([]byte(repairJSONEscapes(js)), &wire); err2 != nil {
			return nil, fmt.Errorf("ollama: questions: parse output: %w", err)
		}
	}
	return toQuestionDrafts(req.SubjectID, req.TopicID, wire), nil
}

// repairJSONEscapes doubles lone backslashes inside JSON string literals so that
// under-escaped LaTeX/HTML from a model (\frac, \(, \times) parses. Backslashes
// that already form a valid JSON escape (\\ \" \/ \uXXXX) are left untouched, so
// correctly-escaped input is unchanged. Runs only after a first parse fails.
func repairJSONEscapes(s string) string {
	var b strings.Builder
	b.Grow(len(s) + 16)
	inStr := false
	for i := 0; i < len(s); i++ {
		c := s[i]
		if !inStr {
			b.WriteByte(c)
			if c == '"' {
				inStr = true
			}
			continue
		}
		if c == '"' {
			b.WriteByte(c)
			inStr = false
			continue
		}
		if c != '\\' {
			b.WriteByte(c)
			continue
		}
		if i+1 >= len(s) {
			b.WriteString(`\\`)
			continue
		}
		switch s[i+1] {
		case '\\', '"', '/', 'u':
			// Already a valid JSON escape — keep both bytes verbatim.
			b.WriteByte(c)
			b.WriteByte(s[i+1])
			i++
		default:
			// Lone backslash the model meant literally (a LaTeX macro) — double it.
			b.WriteString(`\\`)
		}
	}
	return b.String()
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
