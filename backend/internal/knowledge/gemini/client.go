// Package gemini implements the knowledge.Source seam against Google's Gemini
// API (the official, stable "generativelanguage" REST surface). It provides
// document understanding (including scanned-PDF OCR via inline file parts),
// grounded generation with citations, and streamed tutor answers.
//
// The package is split into two files: client.go owns the low-level HTTP plumbing
// (auth, retries, request/response shaping) and gemini.go implements the
// knowledge.Source methods on top of it. The HTTP transport is injectable so the
// adapter is unit-testable with a mocked round-tripper and never needs a live API
// key in CI.
package gemini

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// defaultBaseURL is the public Gemini REST endpoint. It is overridable via
// Config.BaseURL so tests can point at a mock server (or a stub transport).
const defaultBaseURL = "https://generativelanguage.googleapis.com/v1beta"

// defaultModel is the model used when Config.Model is empty. The 2.x flash model
// supports document understanding, OCR of scanned PDFs, and grounded generation.
const defaultModel = "gemini-2.0-flash"

// Config configures the Gemini client. The API key comes from the caller (wired
// from application config) rather than being read from the environment here, so
// the package stays decoupled and testable.
type Config struct {
	// APIKey authenticates requests. When empty the client still constructs but
	// every call fails with ErrNoAPIKey, so the adapter degrades gracefully
	// instead of panicking.
	APIKey string
	// BaseURL overrides the Gemini endpoint. Empty uses defaultBaseURL.
	BaseURL string
	// Model overrides the generative model id. Empty uses defaultModel.
	Model string
	// HTTPClient performs requests. Empty uses a client with a sane timeout.
	// Inject a client with a stub transport in tests.
	HTTPClient *http.Client
	// MaxRetries is the number of additional attempts on transient failures
	// (HTTP 429/5xx or transport errors). Zero means a single attempt.
	MaxRetries int
	// RetryBackoff is the base delay between retries; it grows linearly with the
	// attempt number. Zero disables waiting (useful in tests).
	RetryBackoff time.Duration
}

// ErrNoAPIKey is returned by every call when the client was constructed without
// an API key. It lets callers distinguish "not configured" from runtime errors.
var ErrNoAPIKey = errors.New("gemini: no API key configured")

// client is the low-level Gemini HTTP client used by the Source adapter.
type client struct {
	apiKey       string
	baseURL      string
	model        string
	http         *http.Client
	maxRetries   int
	retryBackoff time.Duration
}

// newClient builds a client from cfg, applying defaults for any zero field.
func newClient(cfg Config) *client {
	hc := cfg.HTTPClient
	if hc == nil {
		hc = &http.Client{Timeout: 60 * time.Second}
	}
	base := cfg.BaseURL
	if base == "" {
		base = defaultBaseURL
	}
	model := cfg.Model
	if model == "" {
		model = defaultModel
	}
	return &client{
		apiKey:       cfg.APIKey,
		baseURL:      strings.TrimRight(base, "/"),
		model:        model,
		http:         hc,
		maxRetries:   cfg.MaxRetries,
		retryBackoff: cfg.RetryBackoff,
	}
}

// --- Gemini wire types (minimal subset we use) ---

// generateRequest is the body sent to :generateContent / :streamGenerateContent.
type generateRequest struct {
	SystemInstruction *content          `json:"systemInstruction,omitempty"`
	Contents          []content         `json:"contents"`
	GenerationConfig  *generationConfig `json:"generationConfig,omitempty"`
}

// content is a single turn (role + parts).
type content struct {
	Role  string `json:"role,omitempty"`
	Parts []part `json:"parts"`
}

// part is one piece of a content turn: either text or inline binary data.
type part struct {
	Text       string      `json:"text,omitempty"`
	InlineData *inlineData `json:"inlineData,omitempty"`
}

// inlineData carries base64-encoded bytes (e.g. a PDF for OCR). encoding/json
// base64-encodes []byte automatically.
type inlineData struct {
	MIMEType string `json:"mimeType"`
	Data     []byte `json:"data"`
}

// generationConfig tunes the model output. ResponseMIMEType "application/json"
// requests structured output for syllabus/question drafting.
type generationConfig struct {
	Temperature      float64 `json:"temperature,omitempty"`
	ResponseMIMEType string  `json:"responseMimeType,omitempty"`
}

// generateResponse is the (subset of the) model reply.
type generateResponse struct {
	Candidates []struct {
		Content      content `json:"content"`
		FinishReason string  `json:"finishReason"`
	} `json:"candidates"`
	Error *apiError `json:"error"`
}

// apiError mirrors the Gemini error envelope.
type apiError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Status  string `json:"status"`
}

func (e *apiError) Error() string {
	return fmt.Sprintf("gemini: api error %d (%s): %s", e.Code, e.Status, e.Message)
}

// text returns the concatenated text of the first candidate, or "" if none.
func (r *generateResponse) text() string {
	if len(r.Candidates) == 0 {
		return ""
	}
	var sb strings.Builder
	for _, p := range r.Candidates[0].Content.Parts {
		sb.WriteString(p.Text)
	}
	return sb.String()
}

// generate performs a non-streaming generateContent call and returns the parsed
// response. It retries transient failures per the client's retry policy.
func (c *client) generate(ctx context.Context, req generateRequest) (*generateResponse, error) {
	if c.apiKey == "" {
		return nil, ErrNoAPIKey
	}
	endpoint := fmt.Sprintf("%s/models/%s:generateContent", c.baseURL, c.model)
	body, err := c.do(ctx, endpoint, req)
	if err != nil {
		return nil, err
	}
	defer body.Close()

	var out generateResponse
	if err := json.NewDecoder(body).Decode(&out); err != nil {
		return nil, fmt.Errorf("gemini: decode response: %w", err)
	}
	if out.Error != nil {
		return nil, out.Error
	}
	return &out, nil
}

// streamGenerate performs a streaming call and invokes onChunk for each decoded
// response object as it arrives. Gemini's REST streaming endpoint returns a JSON
// array streamed element by element; we decode it incrementally so partial
// answers surface in real time.
func (c *client) streamGenerate(ctx context.Context, req generateRequest, onChunk func(*generateResponse) error) error {
	if c.apiKey == "" {
		return ErrNoAPIKey
	}
	endpoint := fmt.Sprintf("%s/models/%s:streamGenerateContent", c.baseURL, c.model)
	body, err := c.do(ctx, endpoint, req)
	if err != nil {
		return err
	}
	defer body.Close()

	dec := json.NewDecoder(body)
	// The streaming endpoint emits a top-level JSON array. Consume the opening
	// bracket, then decode each element as it becomes available.
	if _, err := dec.Token(); err != nil {
		if errors.Is(err, io.EOF) {
			return nil
		}
		return fmt.Errorf("gemini: read stream open: %w", err)
	}
	for dec.More() {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		var chunk generateResponse
		if err := dec.Decode(&chunk); err != nil {
			return fmt.Errorf("gemini: decode stream chunk: %w", err)
		}
		if chunk.Error != nil {
			return chunk.Error
		}
		if err := onChunk(&chunk); err != nil {
			return err
		}
	}
	return nil
}

// do issues a POST with the JSON-encoded payload and returns the response body
// on success, retrying transient failures. The caller closes the body.
func (c *client) do(ctx context.Context, endpoint string, payload any) (io.ReadCloser, error) {
	raw, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("gemini: marshal request: %w", err)
	}

	var lastErr error
	attempts := c.maxRetries + 1
	for attempt := 0; attempt < attempts; attempt++ {
		if attempt > 0 {
			if err := c.wait(ctx, attempt); err != nil {
				return nil, err
			}
		}

		httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(raw))
		if err != nil {
			return nil, fmt.Errorf("gemini: build request: %w", err)
		}
		httpReq.Header.Set("Content-Type", "application/json")
		httpReq.Header.Set("x-goog-api-key", c.apiKey)

		resp, err := c.http.Do(httpReq)
		if err != nil {
			lastErr = fmt.Errorf("gemini: transport: %w", err)
			continue // transport errors are transient
		}

		if resp.StatusCode == http.StatusOK {
			return resp.Body, nil
		}

		// Non-200: read and close the body, then decide whether to retry.
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<10))
		resp.Body.Close()
		statusErr := fmt.Errorf("gemini: http %d: %s", resp.StatusCode, strings.TrimSpace(string(msg)))
		if isRetryable(resp.StatusCode) {
			lastErr = statusErr
			continue
		}
		return nil, statusErr
	}
	if lastErr == nil {
		lastErr = errors.New("gemini: request failed")
	}
	return nil, lastErr
}

// wait sleeps for the linear backoff before the given attempt, respecting ctx.
func (c *client) wait(ctx context.Context, attempt int) error {
	if c.retryBackoff <= 0 {
		return nil
	}
	d := time.Duration(attempt) * c.retryBackoff
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}

// isRetryable reports whether an HTTP status warrants a retry (rate limiting or
// server-side faults).
func isRetryable(status int) bool {
	return status == http.StatusTooManyRequests || status >= 500
}
