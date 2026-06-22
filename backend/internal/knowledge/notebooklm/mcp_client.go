// Package notebooklm implements the knowledge.Source seam against an
// (unofficial) NotebookLM MCP server (spec §4 — the prototype path).
//
// # Experimental
//
// This adapter talks to an UNOFFICIAL, undocumented NotebookLM MCP bridge. It is
// ToS-gray and exists only as a prototype: the endpoints it calls can change or
// vanish without notice. Every call therefore degrades gracefully — failures
// surface as clear, wrapped errors (never panics) so the surrounding job worker
// can mark the job as errored and the operator can swap in the Gemini-direct
// adapter or the official API later. Treat this code as throwaway scaffolding,
// not a stable integration.
//
// # Layering
//
// [mcpClient] owns the wire protocol (JSON-RPC 2.0 over HTTP, the lingua franca
// of MCP) and nothing else; it is injected with an http.RoundTripper so unit
// tests drive it against a stub server with no network. [Adapter] (in
// notebooklm.go) maps StudyRover's knowledge.Source calls onto MCP tool
// invocations and translates results back into the internal domain shapes.
package notebooklm

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync/atomic"
	"time"
)

// ErrUnconfigured is returned by constructors and calls when the adapter has no
// MCP endpoint configured. It lets wiring decide whether NotebookLM is available
// without the adapter panicking or making a doomed request.
var ErrUnconfigured = errors.New("notebooklm: MCP endpoint not configured")

// ErrToolMissing indicates the MCP server does not expose a tool this adapter
// needs. Because the bridge is undocumented and unstable, a renamed or removed
// tool is an expected failure mode, surfaced clearly rather than as a generic
// transport error.
var ErrToolMissing = errors.New("notebooklm: MCP tool not available on server")

// defaultTimeout bounds a single MCP round trip. NotebookLM generation can be
// slow, so this is generous; callers may override via Config.Timeout.
const defaultTimeout = 120 * time.Second

// mcpClient is a minimal JSON-RPC 2.0 client for an MCP server reachable over
// HTTP. It is deliberately tiny: MCP defines a handful of methods (initialize,
// tools/list, tools/call) and this client only needs tools/list and tools/call.
//
// The client is transport-agnostic: it is constructed with an *http.Client whose
// Transport can be a stub http.RoundTripper in tests, so no real network is
// required to exercise the adapter.
type mcpClient struct {
	endpoint   string
	httpClient *http.Client
	// id is an atomically-incremented JSON-RPC request id.
	id atomic.Int64
}

// newMCPClient builds an mcpClient for endpoint using httpClient. A nil
// httpClient falls back to a client with the default timeout. The endpoint is
// trimmed but not otherwise validated here; an empty endpoint makes every call
// fail with ErrUnconfigured.
func newMCPClient(endpoint string, httpClient *http.Client) *mcpClient {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: defaultTimeout}
	}
	return &mcpClient{
		endpoint:   strings.TrimSpace(endpoint),
		httpClient: httpClient,
	}
}

// rpcRequest is a JSON-RPC 2.0 request envelope.
type rpcRequest struct {
	JSONRPC string `json:"jsonrpc"`
	ID      int64  `json:"id"`
	Method  string `json:"method"`
	Params  any    `json:"params,omitempty"`
}

// rpcResponse is a JSON-RPC 2.0 response envelope. Result is left raw so the
// caller decodes the method-specific shape.
type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      int64           `json:"id"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

// rpcError is a JSON-RPC 2.0 error object.
type rpcError struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data,omitempty"`
}

func (e *rpcError) Error() string {
	if e == nil {
		return "<nil rpc error>"
	}
	return fmt.Sprintf("notebooklm: MCP rpc error %d: %s", e.Code, e.Message)
}

// toolCallParams are the params for an MCP "tools/call" request.
type toolCallParams struct {
	Name      string         `json:"name"`
	Arguments map[string]any `json:"arguments,omitempty"`
}

// toolResult is the MCP "tools/call" result. MCP returns content as a list of
// typed blocks; this adapter only consumes text blocks. IsError marks a
// tool-level (as opposed to protocol-level) failure.
type toolResult struct {
	Content []contentBlock `json:"content"`
	IsError bool           `json:"isError"`
}

// contentBlock is one block of an MCP tool result. Only text blocks are used.
type contentBlock struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

// text concatenates all text blocks in the result, in order. NotebookLM tools
// return their JSON or prose payload as text, which the adapter then parses.
func (r toolResult) text() string {
	var b strings.Builder
	for _, c := range r.Content {
		if c.Type == "text" {
			b.WriteString(c.Text)
		}
	}
	return b.String()
}

// callTool invokes an MCP tool by name with the given arguments and returns the
// concatenated text content. It degrades gracefully: an unconfigured endpoint,
// transport failure, malformed response, protocol error, or tool-level error all
// produce a wrapped error rather than a panic. A "method not found"/"unknown
// tool" style RPC error maps to ErrToolMissing so callers can distinguish a
// drifted/removed endpoint from a genuine failure.
func (c *mcpClient) callTool(ctx context.Context, name string, args map[string]any) (string, error) {
	res, err := c.call(ctx, "tools/call", toolCallParams{Name: name, Arguments: args})
	if err != nil {
		return "", err
	}
	var tr toolResult
	if err := json.Unmarshal(res, &tr); err != nil {
		return "", fmt.Errorf("notebooklm: decoding tool %q result: %w", name, err)
	}
	if tr.IsError {
		return "", fmt.Errorf("notebooklm: tool %q reported an error: %s", name, truncate(tr.text(), 256))
	}
	return tr.text(), nil
}

// call performs a single JSON-RPC round trip and returns the raw result. It is
// the one place that touches the network, so all transport hardening lives here.
func (c *mcpClient) call(ctx context.Context, method string, params any) (json.RawMessage, error) {
	if c.endpoint == "" {
		return nil, ErrUnconfigured
	}

	reqBody := rpcRequest{
		JSONRPC: "2.0",
		ID:      c.id.Add(1),
		Method:  method,
		Params:  params,
	}
	payload, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("notebooklm: encoding %s request: %w", method, err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint, bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("notebooklm: building %s request: %w", method, err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("notebooklm: %s transport failure (endpoint unreachable?): %w", method, err)
	}
	defer resp.Body.Close()

	// Bound the response read so a misbehaving prototype server can't exhaust
	// memory. 8 MiB is ample for NotebookLM tool payloads.
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, fmt.Errorf("notebooklm: reading %s response: %w", method, err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("notebooklm: %s returned HTTP %d: %s", method, resp.StatusCode, truncate(string(body), 256))
	}

	var rpcResp rpcResponse
	if err := json.Unmarshal(body, &rpcResp); err != nil {
		return nil, fmt.Errorf("notebooklm: malformed JSON-RPC response for %s (unstable endpoint?): %w", method, err)
	}
	if rpcResp.Error != nil {
		if isMethodNotFound(rpcResp.Error) {
			return nil, fmt.Errorf("%w: %s", ErrToolMissing, rpcResp.Error.Message)
		}
		return nil, rpcResp.Error
	}
	return rpcResp.Result, nil
}

// isMethodNotFound reports whether an RPC error indicates a missing method or
// tool. -32601 is the JSON-RPC "method not found" code; the bridge may also
// signal a removed tool via a message containing "not found"/"unknown".
func isMethodNotFound(e *rpcError) bool {
	if e == nil {
		return false
	}
	if e.Code == -32601 {
		return true
	}
	m := strings.ToLower(e.Message)
	return strings.Contains(m, "unknown tool") ||
		strings.Contains(m, "tool not found") ||
		strings.Contains(m, "no such tool")
}

// truncate shortens s to at most n runes, appending an ellipsis when it cuts.
// Used to keep wrapped error messages from echoing huge response bodies.
func truncate(s string, n int) string {
	r := []rune(strings.TrimSpace(s))
	if len(r) <= n {
		return string(r)
	}
	return string(r[:n]) + "…"
}
