// Package zai implements the knowledge.Source seam against the z.ai (Zhipu GLM)
// OpenAI-compatible API (POST {base}/chat/completions). It provides grounded
// generation with citations and streamed tutor answers, mirroring the Ollama
// adapter but speaking the OpenAI chat-completions wire format.
//
// Like Ollama Cloud, z.ai has no document-understanding/OCR surface, so Ingest
// is not supported here; document ingestion must use the Gemini (or NotebookLM)
// adapter. The other Source methods work via /chat/completions using strong
// JSON-only prompts.
//
// The package is split into two files: client.go owns the low-level HTTP
// plumbing (auth, retries, request/response shaping, SSE streaming) and zai.go
// implements the knowledge.Source methods on top of it. The HTTP transport is
// injectable so the adapter is unit-testable with a mocked round-tripper and
// never needs a live API key in CI.
package zai

import (
	"bufio"
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

// defaultBaseURL is the public z.ai OpenAI-compatible endpoint root. It is
// overridable via Config.BaseURL so tests can point at a mock server.
const defaultBaseURL = "https://api.z.ai/api/paas/v4"

// defaultModel is the model used when Config.Model is empty.
const defaultModel = "glm-5.2"

// Config configures the z.ai client. The API key comes from the caller (wired
// from application config) rather than being read from the environment here, so
// the package stays decoupled and testable.
type Config struct {
	// APIKey authenticates requests via the Bearer header. When empty the client
	// still constructs but every call fails with ErrNoAPIKey, so the adapter
	// degrades gracefully instead of panicking.
	APIKey string
	// BaseURL overrides the z.ai endpoint root. Empty uses defaultBaseURL.
	BaseURL string
	// Model overrides the chat model id. Empty uses defaultModel.
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
var ErrNoAPIKey = errors.New("zai: no API key configured")

// client is the low-level z.ai HTTP client used by the Source adapter.
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
		hc = &http.Client{Timeout: 120 * time.Second}
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

// --- OpenAI-compatible wire types (minimal subset we use) ---

// chatMessage is a single message in the conversation (role + content).
type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// chatRequest is the body sent to /chat/completions.
type chatRequest struct {
	Model    string        `json:"model"`
	Stream   bool          `json:"stream"`
	Messages []chatMessage `json:"messages"`
}

// apiError is the z.ai error envelope (returned on failures, sometimes with a
// 200 status and sometimes with a non-200 status).
type apiError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// chatResponse is the (subset of the) non-streaming reply.
type chatResponse struct {
	Choices []struct {
		Message chatMessage `json:"message"`
	} `json:"choices"`
	Error *apiError `json:"error"`
}

// streamChunk is one SSE data payload during a streaming call.
type streamChunk struct {
	Choices []struct {
		Delta struct {
			Content string `json:"content"`
		} `json:"delta"`
	} `json:"choices"`
	Error *apiError `json:"error"`
}

// chat performs a non-streaming /chat/completions call and returns the
// assistant's message content. It retries transient failures per the client's
// retry policy.
func (c *client) chat(ctx context.Context, messages []chatMessage) (string, error) {
	if c.apiKey == "" {
		return "", ErrNoAPIKey
	}
	req := chatRequest{Model: c.model, Stream: false, Messages: messages}
	body, err := c.do(ctx, req)
	if err != nil {
		return "", err
	}
	defer body.Close()

	var out chatResponse
	if err := json.NewDecoder(body).Decode(&out); err != nil {
		return "", fmt.Errorf("zai: decode response: %w", err)
	}
	if out.Error != nil && out.Error.Message != "" {
		return "", fmt.Errorf("zai: api error %s: %s", out.Error.Code, out.Error.Message)
	}
	if len(out.Choices) == 0 {
		return "", fmt.Errorf("zai: empty response (no choices)")
	}
	return out.Choices[0].Message.Content, nil
}

// streamChat performs a streaming /chat/completions call and invokes onDelta for
// each non-empty content delta as it arrives. The response is Server-Sent Events
// ("data: {json}" lines) terminated by a "data: [DONE]" sentinel.
func (c *client) streamChat(ctx context.Context, messages []chatMessage, onDelta func(string) error) error {
	if c.apiKey == "" {
		return ErrNoAPIKey
	}
	req := chatRequest{Model: c.model, Stream: true, Messages: messages}
	body, err := c.do(ctx, req)
	if err != nil {
		return err
	}
	defer body.Close()

	scanner := bufio.NewScanner(body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		line := bytes.TrimSpace(scanner.Bytes())
		if len(line) == 0 || !bytes.HasPrefix(line, []byte("data:")) {
			continue
		}
		payload := bytes.TrimSpace(line[len("data:"):])
		if string(payload) == "[DONE]" {
			return nil
		}
		var chunk streamChunk
		if err := json.Unmarshal(payload, &chunk); err != nil {
			return fmt.Errorf("zai: decode stream chunk: %w", err)
		}
		if chunk.Error != nil && chunk.Error.Message != "" {
			return fmt.Errorf("zai: api error %s: %s", chunk.Error.Code, chunk.Error.Message)
		}
		for _, ch := range chunk.Choices {
			if ch.Delta.Content != "" {
				if err := onDelta(ch.Delta.Content); err != nil {
					return err
				}
			}
		}
	}
	if err := scanner.Err(); err != nil && !errors.Is(err, io.EOF) {
		return fmt.Errorf("zai: read stream: %w", err)
	}
	return nil
}

// do issues a POST to /chat/completions with the JSON-encoded payload and
// returns the response body on success, retrying transient failures. The caller
// closes the body.
func (c *client) do(ctx context.Context, payload any) (io.ReadCloser, error) {
	raw, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("zai: marshal request: %w", err)
	}
	endpoint := c.baseURL + "/chat/completions"

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
			return nil, fmt.Errorf("zai: build request: %w", err)
		}
		httpReq.Header.Set("Content-Type", "application/json")
		httpReq.Header.Set("Accept", "application/json")
		httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)

		resp, err := c.http.Do(httpReq)
		if err != nil {
			lastErr = fmt.Errorf("zai: transport: %w", err)
			continue // transport errors are transient
		}

		if resp.StatusCode == http.StatusOK {
			return resp.Body, nil
		}

		// Non-200: read and close the body, then decide whether to retry.
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<10))
		resp.Body.Close()
		statusErr := fmt.Errorf("zai: http %d: %s", resp.StatusCode, strings.TrimSpace(string(msg)))
		if isRetryable(resp.StatusCode) {
			lastErr = statusErr
			continue
		}
		return nil, statusErr
	}
	if lastErr == nil {
		lastErr = errors.New("zai: request failed")
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
