// Package codex implements the knowledge.Source seam on top of the OpenAI Codex
// CLI (`codex exec`), so a parent can bring their own ChatGPT/Codex
// subscription instead of paying for a metered API key. The operator signs the
// CLI in once on the server (`codex login`, as the user the service runs as)
// and every call reuses that login.
//
// Like the Ollama and z.ai adapters, Codex has no document-understanding/OCR
// surface here, so Ingest is not supported; document ingestion must use the
// Gemini (or NotebookLM) adapter. The other Source methods run one
// non-interactive `codex exec` per call with strong JSON-only prompts.
//
// The package is split into two files: client.go owns the process plumbing
// (building the command, feeding the prompt on stdin, reading the JSONL event
// stream) and codex.go implements the knowledge.Source methods on top of it.
// The command runner is injectable so the adapter is unit-testable without the
// CLI installed.
package codex

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"
)

// defaultBin is the Codex CLI looked up on PATH when Config.Bin is empty.
const defaultBin = "codex"

// defaultTimeout bounds one `codex exec` run. Lessons are the longest outputs.
const defaultTimeout = 5 * time.Minute

// Config configures the Codex client. Values come from the caller (wired from
// application config) rather than being read from the environment here, so the
// package stays decoupled and testable.
type Config struct {
	// Bin is the codex executable (a name on PATH or an absolute path). Empty
	// uses "codex". systemd units have a short PATH, so production usually sets
	// an absolute path.
	Bin string
	// Home is the CODEX_HOME holding the subscription login (auth.json). Empty
	// inherits the process environment (~/.codex of the service user).
	Home string
	// Model overrides the model id (`codex exec -m`). Empty uses the CLI's
	// default for the signed-in plan.
	Model string
	// Timeout bounds one run. Zero uses defaultTimeout.
	Timeout time.Duration
	// Run executes the command and returns its stdout. Empty uses os/exec.
	// Inject a stub in tests.
	Run Runner
}

// Runner executes one codex invocation: bin with args, the prompt on stdin and
// env appended to the process environment. It returns stdout, or an error that
// carries stderr when the process fails.
type Runner func(ctx context.Context, bin string, args []string, env []string, stdin string) ([]byte, error)

// ErrNoCLI is returned when the codex executable cannot be found. It lets
// callers distinguish "not installed" from runtime errors.
var ErrNoCLI = errors.New("codex: CLI not found; install it and set CODEX_BIN")

// client is the low-level Codex CLI client used by the Source adapter.
type client struct {
	bin     string
	home    string
	model   string
	timeout time.Duration
	run     Runner
}

// newClient builds a client from cfg, applying defaults for any zero field.
func newClient(cfg Config) *client {
	bin := cfg.Bin
	if bin == "" {
		bin = defaultBin
	}
	timeout := cfg.Timeout
	if timeout <= 0 {
		timeout = defaultTimeout
	}
	run := cfg.Run
	if run == nil {
		run = execRunner
	}
	return &client{bin: bin, home: cfg.Home, model: cfg.Model, timeout: timeout, run: run}
}

// chatMessage is a single message in the conversation (role + content). The
// CLI takes one prompt, so chat flattens the messages into it.
type chatMessage struct {
	Role    string
	Content string
}

// event is the subset of one `codex exec --json` JSONL line that we use.
type event struct {
	Type string `json:"type"`
	Item *struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"item"`
	Message string `json:"message"`
	Error   *struct {
		Message string `json:"message"`
	} `json:"error"`
}

// binPath resolves the executable, so a missing CLI is reported clearly.
func (c *client) binPath() (string, error) {
	p, err := exec.LookPath(c.bin)
	if err != nil {
		return "", ErrNoCLI
	}
	return p, nil
}

// chat runs one `codex exec` with the messages flattened into a single prompt
// and returns the agent's final message.
func (c *client) chat(ctx context.Context, messages []chatMessage) (string, error) {
	bin, err := c.binPath()
	if err != nil {
		return "", err
	}

	// An empty scratch directory as the working root: the agent has nothing to
	// read, and the read-only sandbox stops it from writing anywhere.
	dir, err := os.MkdirTemp("", "studyrover-codex-")
	if err != nil {
		return "", fmt.Errorf("codex: temp dir: %w", err)
	}
	defer os.RemoveAll(dir)

	args := []string{
		"exec",
		"--json",
		"--ephemeral",
		"--skip-git-repo-check",
		"--ignore-user-config",
		"--ignore-rules",
		"--sandbox", "read-only",
		"--color", "never",
		"--cd", dir,
	}
	if c.model != "" {
		args = append(args, "--model", c.model)
	}
	args = append(args, "-") // prompt on stdin

	var env []string
	if c.home != "" {
		env = append(env, "CODEX_HOME="+c.home)
	}

	ctx, cancel := context.WithTimeout(ctx, c.timeout)
	defer cancel()
	out, err := c.run(ctx, bin, args, env, buildPrompt(messages))
	if ctxErr := ctx.Err(); ctxErr != nil {
		return "", fmt.Errorf("codex: %w", ctxErr)
	}
	// Parse even on a non-zero exit: the JSONL error event is clearer than stderr.
	answer, evErr := parseEvents(out)
	if evErr != nil {
		return "", evErr
	}
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(answer) == "" {
		return "", errors.New("codex: empty response")
	}
	return answer, nil
}

// buildPrompt flattens role-tagged messages into one prompt. System messages
// become an instruction block ahead of the request.
func buildPrompt(messages []chatMessage) string {
	var sys, user []string
	for _, m := range messages {
		if m.Role == "system" {
			sys = append(sys, m.Content)
		} else {
			user = append(user, m.Content)
		}
	}
	var b strings.Builder
	b.WriteString("Answer directly in your reply. Do not run commands, read files or edit files.\n")
	if len(sys) > 0 {
		b.WriteString("\n<instructions>\n")
		b.WriteString(strings.Join(sys, "\n\n"))
		b.WriteString("\n</instructions>\n")
	}
	b.WriteString("\n")
	b.WriteString(strings.Join(user, "\n\n"))
	return b.String()
}

// parseEvents reads the JSONL event stream and returns the last agent message,
// or the error the run reported (failed turn, expired login, usage limit).
// "error" events are not fatal on their own: the CLI emits them while it
// retries ("Reconnecting... 2/5"); only turn.failed ends the run.
func parseEvents(out []byte) (string, error) {
	var answer, lastErr string
	sc := bufio.NewScanner(bytes.NewReader(out))
	sc.Buffer(make([]byte, 0, 64*1024), 16*1024*1024)
	for sc.Scan() {
		line := bytes.TrimSpace(sc.Bytes())
		if len(line) == 0 || line[0] != '{' {
			continue
		}
		var ev event
		if json.Unmarshal(line, &ev) != nil {
			continue
		}
		switch ev.Type {
		case "item.completed":
			if ev.Item != nil && ev.Item.Type == "agent_message" {
				answer = ev.Item.Text
			}
		case "turn.failed":
			msg := lastErr
			if ev.Error != nil && ev.Error.Message != "" {
				msg = ev.Error.Message
			}
			return "", runError(msg)
		case "error":
			lastErr = ev.Message
		}
	}
	return answer, nil
}

// runError wraps a failed run's message, pointing at `codex login` when the
// subscription login is missing or expired.
func runError(msg string) error {
	if msg == "" {
		return errors.New("codex: turn failed")
	}
	if strings.Contains(msg, "401") {
		return fmt.Errorf("codex: not signed in (run `codex login` as the service user): %s", msg)
	}
	return fmt.Errorf("codex: %s", msg)
}

// execRunner is the production Runner: it starts the process with the prompt on
// stdin and returns stdout, folding the tail of stderr into the error on a
// non-zero exit.
func execRunner(ctx context.Context, bin string, args []string, env []string, stdin string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, bin, args...)
	cmd.Env = append(os.Environ(), env...)
	cmd.Stdin = strings.NewReader(stdin)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		if len(msg) > 500 {
			msg = msg[len(msg)-500:]
		}
		return stdout.Bytes(), fmt.Errorf("codex: %v: %s", err, msg)
	}
	return stdout.Bytes(), nil
}
