package zai

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/shafqat/studyrover/backend/internal/knowledge"
)

// TestGenerateQuestionsParsesOpenAIResponse drives the adapter against a fake
// z.ai server that returns an OpenAI-shaped chat-completions body, proving the
// request shaping, auth header, and response parsing into QuestionDrafts.
func TestGenerateQuestionsParsesOpenAIResponse(t *testing.T) {
	var gotAuth, gotModel string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/chat/completions" {
			t.Errorf("unexpected path %q", r.URL.Path)
		}
		gotAuth = r.Header.Get("Authorization")
		body, _ := io.ReadAll(r.Body)
		var req chatRequest
		_ = json.Unmarshal(body, &req)
		gotModel = req.Model

		// The model wraps the JSON in a code fence to exercise extractJSON.
		content := "```json\n[{\"text\":\"What is 2+2?\",\"options\":[{\"text\":\"3\"},{\"text\":\"4\"},{\"text\":\"5\"},{\"text\":\"6\"}],\"correctOptionIndex\":1,\"difficulty\":\"easy\"}]\n```"
		resp := map[string]any{
			"choices": []map[string]any{
				{"message": map[string]string{"role": "assistant", "content": content}},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	src := New(Config{APIKey: "test-key", BaseURL: srv.URL, Model: "glm-5.2"})
	drafts, err := src.GenerateQuestions(context.Background(), knowledge.GenRequest{
		SubjectID:   "subj-1",
		SubjectName: "Math",
		TopicName:   "Arithmetic",
		Count:       1,
	})
	if err != nil {
		t.Fatalf("GenerateQuestions: %v", err)
	}
	if len(drafts) != 1 {
		t.Fatalf("want 1 draft, got %d", len(drafts))
	}
	d := drafts[0]
	if d.Text != "What is 2+2?" || len(d.Options) != 4 || d.CorrectOptionIndex != 1 {
		t.Errorf("unexpected draft: %+v", d)
	}
	if !strings.HasPrefix(gotAuth, "Bearer test-key") {
		t.Errorf("missing/incorrect auth header: %q", gotAuth)
	}
	if gotModel != "glm-5.2" {
		t.Errorf("want model glm-5.2, got %q", gotModel)
	}
}

// TestNoAPIKeyDegradesGracefully confirms calls fail with ErrNoAPIKey rather
// than panicking when the adapter has no key.
func TestNoAPIKeyDegradesGracefully(t *testing.T) {
	src := New(Config{})
	_, err := src.GenerateQuestions(context.Background(), knowledge.GenRequest{SubjectID: "s"})
	if !errors.Is(err, ErrNoAPIKey) {
		t.Fatalf("want ErrNoAPIKey, got %v", err)
	}
}

// TestRepairJSONEscapes covers the LaTeX/HTML under-escaping repair.
func TestRepairJSONEscapes(t *testing.T) {
	cases := []struct{ in, want string }{
		// Lone LaTeX backslashes get doubled so JSON parses.
		{`["\(x^2\)"]`, `["\\(x^2\\)"]`},
		{`["\frac{1}{2}"]`, `["\\frac{1}{2}"]`},
		// Already-valid escapes are preserved.
		{`["\\frac"]`, `["\\frac"]`},
		{`["a \" b"]`, `["a \" b"]`},
		// Backslashes outside strings are untouched.
		{`[\ ]`, `[\ ]`},
	}
	for _, c := range cases {
		if got := repairJSONEscapes(c.in); got != c.want {
			t.Errorf("repairJSONEscapes(%q) = %q, want %q", c.in, got, c.want)
		}
	}
	// The repaired form must actually unmarshal.
	var out []string
	if err := json.Unmarshal([]byte(`["\(\frac{a}{b}\)"]`), &out); err == nil {
		t.Fatal("expected raw under-escaped JSON to fail before repair")
	}
	if err := json.Unmarshal([]byte(repairJSONEscapes(`["\(\frac{a}{b}\)"]`)), &out); err != nil {
		t.Fatalf("repaired JSON should parse: %v", err)
	}
	if len(out) != 1 || out[0] != `\(\frac{a}{b}\)` {
		t.Errorf("unexpected parse result: %q", out)
	}
}

// TestAPIErrorSurfaces confirms a z.ai error envelope (e.g. insufficient
// balance) surfaces as a clear error rather than being swallowed.
func TestAPIErrorSurfaces(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"error":{"code":"1113","message":"Insufficient balance"}}`)
	}))
	defer srv.Close()

	src := New(Config{APIKey: "k", BaseURL: srv.URL})
	_, err := src.GenerateQuestions(context.Background(), knowledge.GenRequest{SubjectID: "s", Count: 1})
	if err == nil || !strings.Contains(err.Error(), "1113") {
		t.Fatalf("want error mentioning 1113, got %v", err)
	}
}
