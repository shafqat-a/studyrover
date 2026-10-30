package codex

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/shafqat/studyrover/backend/internal/knowledge"
)

// fakeBin creates an executable stand-in so binPath's PATH lookup succeeds; the
// stub Runner never actually starts it.
func fakeBin(t *testing.T) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "codex")
	if err := os.WriteFile(p, []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	return p
}

// jsonl renders one agent message the way `codex exec --json` prints it.
func jsonl(text string) []byte {
	return []byte(`{"type":"thread.started","thread_id":"t1"}
{"type":"turn.started"}
{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":` + text + `}}
{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}
`)
}

// TestGenerateQuestionsRunsCodexExec proves the command shaping (exec, JSON
// events, read-only sandbox, prompt on stdin, model, CODEX_HOME) and parsing
// of the agent message into QuestionDrafts.
func TestGenerateQuestionsRunsCodexExec(t *testing.T) {
	var gotArgs, gotEnv []string
	var gotStdin string
	src := New(Config{
		Bin:   fakeBin(t),
		Home:  "/srv/codex-home",
		Model: "gpt-test",
		Run: func(ctx context.Context, bin string, args, env []string, stdin string) ([]byte, error) {
			gotArgs, gotEnv, gotStdin = args, env, stdin
			// The model wraps the JSON in a code fence to exercise extractJSON.
			return jsonl(`"` + "```json\\n" + `[{\"text\":\"What is 2+2?\",\"options\":[{\"text\":\"3\"},{\"text\":\"4\"},{\"text\":\"5\"},{\"text\":\"6\"}],\"correctOptionIndex\":1,\"difficulty\":\"easy\"}]` + "\\n```" + `"`), nil
		},
	})

	drafts, err := src.GenerateQuestions(context.Background(), knowledge.GenRequest{SubjectID: "s1", SubjectName: "Maths", Count: 1})
	if err != nil {
		t.Fatalf("GenerateQuestions: %v", err)
	}
	if len(drafts) != 1 || drafts[0].CorrectOptionIndex != 1 || len(drafts[0].Options) != 4 {
		t.Fatalf("unexpected drafts: %+v", drafts)
	}

	args := strings.Join(gotArgs, " ")
	for _, want := range []string{"exec", "--json", "--ephemeral", "--sandbox read-only", "--model gpt-test"} {
		if !strings.Contains(args, want) {
			t.Errorf("args %q missing %q", args, want)
		}
	}
	if gotArgs[len(gotArgs)-1] != "-" {
		t.Errorf("prompt must be read from stdin, args end with %q", gotArgs[len(gotArgs)-1])
	}
	if len(gotEnv) != 1 || gotEnv[0] != "CODEX_HOME=/srv/codex-home" {
		t.Errorf("env = %v", gotEnv)
	}
	if !strings.Contains(gotStdin, "<instructions>") || !strings.Contains(gotStdin, `"Maths"`) {
		t.Errorf("stdin did not carry the system and user prompts: %q", gotStdin)
	}
}

// TestRetryErrorsAreNotFatal: the CLI prints "error" events while it retries;
// a run that then succeeds must return the answer.
func TestRetryErrorsAreNotFatal(t *testing.T) {
	out := append([]byte(`{"type":"error","message":"Reconnecting... 1/5 (stream disconnected)"}`+"\n"), jsonl(`"hello"`)...)
	got, err := parseEvents(out)
	if err != nil || got != "hello" {
		t.Fatalf("parseEvents = %q, %v", got, err)
	}
}

// TestNotSignedInPointsAtLogin: a 401 failed turn names `codex login`.
func TestNotSignedInPointsAtLogin(t *testing.T) {
	src := New(Config{
		Bin: fakeBin(t),
		Run: func(ctx context.Context, bin string, args, env []string, stdin string) ([]byte, error) {
			return []byte(`{"type":"error","message":"unexpected status 401 Unauthorized"}
{"type":"turn.failed","error":{"message":"unexpected status 401 Unauthorized"}}
`), errors.New("exit status 1")
		},
	})
	_, err := src.GenerateStudyGuide(context.Background(), knowledge.GuideRequest{SubjectID: "s1"})
	if err == nil || !strings.Contains(err.Error(), "codex login") {
		t.Fatalf("want a codex login hint, got %v", err)
	}
}

// TestMissingCLI: without the executable every method fails with ErrNoCLI,
// and the tutor reports it synchronously.
func TestMissingCLI(t *testing.T) {
	src := New(Config{Bin: filepath.Join(t.TempDir(), "no-such-codex")})
	if _, err := src.GenerateQuestions(context.Background(), knowledge.GenRequest{SubjectID: "s1"}); !errors.Is(err, ErrNoCLI) {
		t.Fatalf("GenerateQuestions err = %v, want ErrNoCLI", err)
	}
	if ch, err := src.AnswerGrounded(context.Background(), knowledge.AskRequest{Text: "hi"}); ch != nil || !errors.Is(err, ErrNoCLI) {
		t.Fatalf("AnswerGrounded = %v, %v; want nil, ErrNoCLI", ch, err)
	}
}

// TestAnswerGroundedSendsWholeAnswer: one delta with the full answer, then Done.
func TestAnswerGroundedSendsWholeAnswer(t *testing.T) {
	src := New(Config{
		Bin: fakeBin(t),
		Run: func(ctx context.Context, bin string, args, env []string, stdin string) ([]byte, error) {
			return jsonl(`"Photosynthesis makes glucose."`), nil
		},
	})
	ch, err := src.AnswerGrounded(context.Background(), knowledge.AskRequest{Text: "What is photosynthesis?", SystemPrompt: "Be brief."})
	if err != nil {
		t.Fatal(err)
	}
	var chunks []knowledge.AnswerChunk
	for c := range ch {
		chunks = append(chunks, c)
	}
	if len(chunks) != 2 || chunks[0].Delta != "Photosynthesis makes glucose." || !chunks[1].Done {
		t.Fatalf("chunks = %+v", chunks)
	}
}
