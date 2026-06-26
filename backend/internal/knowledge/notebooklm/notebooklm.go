package notebooklm

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/shafqat/studyrover/backend/internal/knowledge"
)

// encodeBase64 returns the standard base64 encoding of b, used to carry inline
// document bytes through the JSON-RPC arguments to the bridge.
func encodeBase64(b []byte) string { return base64.StdEncoding.EncodeToString(b) }

// Tool names this adapter expects the NotebookLM MCP bridge to expose. They are
// centralised so the (likely) churn in the undocumented bridge is a one-line
// edit. If the server renames or drops one, the corresponding call fails with
// ErrToolMissing rather than a silent wrong result.
const (
	toolAddSource      = "add_source"       // ingest a document / NotebookLM link
	toolDeriveSyllabus = "generate_outline" // derive a topic outline
	toolGenerateQuiz   = "generate_quiz"    // draft multiple-choice questions
	toolGenerateGuide  = "generate_guide"   // produce a study guide
	toolAnswerQuestion = "ask"              // grounded Q&A for the tutor
)

// Config configures the NotebookLM-MCP adapter.
type Config struct {
	// Endpoint is the base URL of the unofficial NotebookLM MCP server (JSON-RPC
	// over HTTP). When empty the adapter is unconfigured and every call returns
	// ErrUnconfigured; this lets wiring construct it unconditionally and let the
	// selector (knowledge.New) fall back to another Source.
	Endpoint string
	// HTTPClient is the HTTP client used for MCP round trips. When nil a default
	// client with a generous timeout is used. Tests inject a client whose
	// Transport is a stub http.RoundTripper so no network is touched.
	HTTPClient *http.Client
}

// Adapter implements knowledge.Source by mapping each Source method onto a tool
// call against an unofficial NotebookLM MCP server.
//
// Adapter is EXPERIMENTAL (see the package doc): it targets an undocumented,
// ToS-gray bridge. It is built to be swapped out — every method degrades to a
// clear, wrapped error when the bridge is missing or misbehaves, and the type
// holds no global state, so it is safe for concurrent use across job workers.
type Adapter struct {
	client *mcpClient
}

// New constructs a NotebookLM-MCP Adapter from cfg. It never returns an error:
// an empty endpoint yields a usable Adapter whose calls report ErrUnconfigured,
// keeping wiring (knowledge.New) simple. The returned *Adapter satisfies
// knowledge.Source.
func New(cfg Config) *Adapter {
	return &Adapter{client: newMCPClient(cfg.Endpoint, cfg.HTTPClient)}
}

// Compile-time assertion that Adapter satisfies the knowledge seam.
var _ knowledge.Source = (*Adapter)(nil)

// Ingest maps a document/link onto the NotebookLM "add_source" tool. NotebookLM
// performs its own extraction/OCR/embedding, so the adapter only hands off the
// source and returns the job id the bridge reports. The result is asynchronous
// by the Source contract; the bridge's own id is threaded back as the JobID.
func (a *Adapter) Ingest(ctx context.Context, req knowledge.IngestRequest) (knowledge.JobID, error) {
	if req.SubjectID == "" {
		return "", errors.New("notebooklm: Ingest requires a SubjectID")
	}
	args := map[string]any{"subjectId": req.SubjectID}
	switch {
	case req.NotebookLMURL != "":
		args["url"] = req.NotebookLMURL
	case len(req.Data) > 0:
		// NotebookLM tools accept inline content as base64 alongside a filename
		// and MIME type so the bridge can decode and route it.
		args["filename"] = req.Filename
		args["mimeType"] = req.MIMEType
		args["contentBase64"] = encodeBase64(req.Data)
	case req.StorageKey != "":
		args["storageKey"] = req.StorageKey
	default:
		return "", errors.New("notebooklm: Ingest requires Data, StorageKey, or NotebookLMURL")
	}

	out, err := a.client.callTool(ctx, toolAddSource, args)
	if err != nil {
		return "", fmt.Errorf("notebooklm: Ingest: %w", err)
	}

	var resp struct {
		JobID string `json:"jobId"`
	}
	if err := json.Unmarshal([]byte(out), &resp); err != nil {
		return "", fmt.Errorf("notebooklm: Ingest: parsing %q response: %w", toolAddSource, err)
	}
	if resp.JobID == "" {
		return "", fmt.Errorf("notebooklm: Ingest: %q returned no job id", toolAddSource)
	}
	return knowledge.JobID(resp.JobID), nil
}

// DeriveSyllabus maps onto the outline tool and decodes the returned topic tree.
func (a *Adapter) DeriveSyllabus(ctx context.Context, req knowledge.SyllabusRequest) ([]knowledge.TopicSuggestion, error) {
	if req.SubjectID == "" {
		return nil, errors.New("notebooklm: DeriveSyllabus requires a SubjectID")
	}
	out, err := a.client.callTool(ctx, toolDeriveSyllabus, map[string]any{"subjectId": req.SubjectID})
	if err != nil {
		return nil, fmt.Errorf("notebooklm: DeriveSyllabus: %w", err)
	}

	var resp struct {
		Topics []wireTopic `json:"topics"`
	}
	if err := json.Unmarshal([]byte(out), &resp); err != nil {
		return nil, fmt.Errorf("notebooklm: DeriveSyllabus: parsing %q response: %w", toolDeriveSyllabus, err)
	}
	return toTopicSuggestions(resp.Topics), nil
}

// GenerateQuestions maps onto the quiz tool and decodes the draft questions.
func (a *Adapter) GenerateQuestions(ctx context.Context, req knowledge.GenRequest) ([]knowledge.QuestionDraft, error) {
	if req.SubjectID == "" {
		return nil, errors.New("notebooklm: GenerateQuestions requires a SubjectID")
	}
	args := map[string]any{"subjectId": req.SubjectID}
	if req.TopicID != "" {
		args["topicId"] = req.TopicID
	}
	if req.Count > 0 {
		args["count"] = req.Count
	}
	if req.Difficulty != "" {
		args["difficulty"] = req.Difficulty
	}

	out, err := a.client.callTool(ctx, toolGenerateQuiz, args)
	if err != nil {
		return nil, fmt.Errorf("notebooklm: GenerateQuestions: %w", err)
	}

	var resp struct {
		Questions []wireQuestion `json:"questions"`
	}
	if err := json.Unmarshal([]byte(out), &resp); err != nil {
		return nil, fmt.Errorf("notebooklm: GenerateQuestions: parsing %q response: %w", toolGenerateQuiz, err)
	}

	drafts := make([]knowledge.QuestionDraft, 0, len(resp.Questions))
	for _, q := range resp.Questions {
		drafts = append(drafts, q.toDraft(req.SubjectID, req.TopicID))
	}
	return drafts, nil
}

// GenerateStudyGuide maps onto the guide tool and decodes the markdown guide.
func (a *Adapter) GenerateStudyGuide(ctx context.Context, req knowledge.GuideRequest) (knowledge.StudyGuide, error) {
	if req.SubjectID == "" {
		return knowledge.StudyGuide{}, errors.New("notebooklm: GenerateStudyGuide requires a SubjectID")
	}
	args := map[string]any{"subjectId": req.SubjectID}
	if req.TopicID != "" {
		args["topicId"] = req.TopicID
	}

	out, err := a.client.callTool(ctx, toolGenerateGuide, args)
	if err != nil {
		return knowledge.StudyGuide{}, fmt.Errorf("notebooklm: GenerateStudyGuide: %w", err)
	}

	var resp struct {
		Markdown  string         `json:"markdown"`
		Citations []wireCitation `json:"citations"`
	}
	if err := json.Unmarshal([]byte(out), &resp); err != nil {
		return knowledge.StudyGuide{}, fmt.Errorf("notebooklm: GenerateStudyGuide: parsing %q response: %w", toolGenerateGuide, err)
	}
	return knowledge.StudyGuide{
		SubjectID: req.SubjectID,
		TopicID:   req.TopicID,
		Markdown:  resp.Markdown,
		Citations: toCitations(resp.Citations),
	}, nil
}

// AnswerGrounded powers the tutor chat. The unofficial bridge exposes a
// request/response "ask" tool rather than a token stream, so this adapter
// performs one call and then emits the result as a single terminal AnswerChunk
// over the channel — preserving the streaming Source contract for callers (the
// SSE handler in 2-A02) without claiming a streaming capability the bridge lacks.
//
// Per the Source contract, any setup/transport error is returned synchronously
// with a nil channel.
func (a *Adapter) AnswerGrounded(ctx context.Context, req knowledge.AskRequest) (<-chan knowledge.AnswerChunk, error) {
	if req.SubjectID == "" {
		return nil, errors.New("notebooklm: AnswerGrounded requires a SubjectID")
	}
	if req.Text == "" {
		return nil, errors.New("notebooklm: AnswerGrounded requires question Text")
	}

	args := map[string]any{
		"subjectId": req.SubjectID,
		"question":  req.Text,
	}
	if req.ConversationID != "" {
		args["conversationId"] = req.ConversationID
	}
	if req.TopicID != "" {
		args["topicId"] = req.TopicID
	}
	if req.SystemPrompt != "" {
		args["systemPrompt"] = req.SystemPrompt
	}

	out, err := a.client.callTool(ctx, toolAnswerQuestion, args)
	if err != nil {
		return nil, fmt.Errorf("notebooklm: AnswerGrounded: %w", err)
	}

	var resp struct {
		Answer    string         `json:"answer"`
		Citations []wireCitation `json:"citations"`
	}
	if err := json.Unmarshal([]byte(out), &resp); err != nil {
		return nil, fmt.Errorf("notebooklm: AnswerGrounded: parsing %q response: %w", toolAnswerQuestion, err)
	}

	ch := make(chan knowledge.AnswerChunk, 1)
	final := knowledge.AnswerChunk{
		Delta:     resp.Answer,
		Citations: toCitations(resp.Citations),
		Done:      true,
	}
	// Send respecting cancellation; the buffered channel means this never blocks
	// in practice, but we honour ctx for correctness.
	go func() {
		defer close(ch)
		select {
		case ch <- final:
		case <-ctx.Done():
		}
	}()
	return ch, nil
}

// --- wire shapes (the JSON the MCP tools return) and their translations ---

// wireTopic mirrors a NotebookLM outline node before translation to the domain
// TopicSuggestion tree.
type wireTopic struct {
	Name      string      `json:"name"`
	SourceID  string      `json:"sourceId"`
	PageStart int         `json:"pageStart"`
	PageEnd   int         `json:"pageEnd"`
	Children  []wireTopic `json:"children"`
}

// toTopicSuggestions converts wire topics into domain suggestions, assigning a
// stable sibling Order from list position (the bridge does not always supply it).
func toTopicSuggestions(in []wireTopic) []knowledge.TopicSuggestion {
	if len(in) == 0 {
		return nil
	}
	out := make([]knowledge.TopicSuggestion, 0, len(in))
	for i, t := range in {
		out = append(out, knowledge.TopicSuggestion{
			Name:      t.Name,
			SourceID:  t.SourceID,
			PageStart: t.PageStart,
			PageEnd:   t.PageEnd,
			Order:     i,
			Children:  toTopicSuggestions(t.Children),
		})
	}
	return out
}

// wireQuestion mirrors a NotebookLM quiz item before translation to a draft.
type wireQuestion struct {
	ID                 string         `json:"id"`
	Text               string         `json:"text"`
	Options            []string       `json:"options"`
	CorrectOptionIndex int            `json:"correctOptionIndex"`
	Difficulty         string         `json:"difficulty"`
	Citations          []wireCitation `json:"citations"`
}

// toDraft converts a wire question into a domain QuestionDraft, defaulting the
// subject/topic from the request when the bridge omits them.
func (q wireQuestion) toDraft(subjectID, topicID string) knowledge.QuestionDraft {
	opts := make([]knowledge.QuestionOption, 0, len(q.Options))
	for _, o := range q.Options {
		opts = append(opts, knowledge.QuestionOption{Text: o})
	}
	return knowledge.QuestionDraft{
		ID:                 q.ID,
		SubjectID:          subjectID,
		TopicID:            topicID,
		Text:               q.Text,
		Options:            opts,
		CorrectOptionIndex: q.CorrectOptionIndex,
		Difficulty:         q.Difficulty,
		Citations:          toCitations(q.Citations),
	}
}

// wireCitation mirrors a NotebookLM citation before translation.
type wireCitation struct {
	SourceID string `json:"sourceId"`
	Label    string `json:"label"`
	Locator  string `json:"locator"`
}

// toCitations converts wire citations into domain citations.
func toCitations(in []wireCitation) []knowledge.Citation {
	if len(in) == 0 {
		return nil
	}
	out := make([]knowledge.Citation, 0, len(in))
	for _, c := range in {
		out = append(out, knowledge.Citation{
			SourceID: c.SourceID,
			Label:    c.Label,
			Locator:  c.Locator,
		})
	}
	return out
}
