// Package jobs is StudyRover's Postgres-backed asynchronous job system. It drives
// the long-running, AI-heavy operations (document ingest, syllabus derivation and
// question generation — contract 2-C03) through the lifecycle
//
//	queued → processing → ready | error
//
// with at-least-once delivery, a bounded worker pool, exponential backoff and
// progress reporting.
//
// The package is split into three concerns:
//
//   - queue.go  — the Queue: a thin, testable wrapper over the sqlc job queries
//     (Enqueue / Claim / Complete / Fail / Progress / Get / List).
//   - worker.go — the Worker: a bounded pool that claims runnable jobs and
//     dispatches each to the Handler registered for its type, applying retry and
//     backoff on failure.
//   - handler.go — the Handler contract and the Registry the features populate at
//     wiring time (2-W04).
//
// Nothing in this package talks to an external API directly: handlers are
// injected by the features (ingest/syllabus/questions), each of which goes
// through the knowledge.Source seam. That keeps the queue/worker pure and unit
// testable against an in-memory store and fake handlers.
package jobs

import (
	"context"
	"fmt"
)

// Handler executes the work for a single job of a given type. Implementations are
// supplied by the features that own that work (ingest, syllabus, questions) and
// registered with a Registry at wiring time.
//
// The contract:
//
//   - ctx is cancelled when the worker is shutting down; long-running handlers
//     should honour it and return promptly.
//
//   - job is the freshly claimed row (already marked processing, with attempts
//     incremented). Read job.Payload for the request and job.SubjectID for scope.
//
//   - prog reports incremental progress in the range [0,100]; it is best-effort
//     and safe to call zero or many times. A non-nil error from prog should not
//     abort handling.
//
//   - The returned result, when non-nil, is the JSON payload stored on the job
//     (contract 2-C03 Job.result, e.g. a TopicSuggestion[] for syllabus jobs).
//
//   - A nil error marks the job ready; a non-nil error triggers retry-with-backoff
//     until the worker's attempt budget is exhausted, after which the job is
//     marked error with the message.
type Handler interface {
	Handle(ctx context.Context, job Job, prog ProgressFunc) (result []byte, err error)
}

// HandlerFunc adapts an ordinary function into a Handler.
type HandlerFunc func(ctx context.Context, job Job, prog ProgressFunc) ([]byte, error)

// Handle calls f.
func (f HandlerFunc) Handle(ctx context.Context, job Job, prog ProgressFunc) ([]byte, error) {
	return f(ctx, job, prog)
}

// ProgressFunc reports a job's completion percentage (0-100) while it runs. It is
// provided to handlers by the worker and persists progress via the queue.
type ProgressFunc func(ctx context.Context, percent int32) error

// noopProgress is used when a caller does not care about progress (for example a
// handler invoked directly in a unit test).
func noopProgress(context.Context, int32) error { return nil }

// Registry maps a job type (contract 2-C03 Job.type: "ingest" | "syllabus" |
// "questions") to the Handler that processes it. Features register their handlers
// at wiring time (2-W04); the worker consults the registry for each claimed job.
//
// A Registry is not safe for concurrent registration, which is fine because
// Register is only called during single-threaded startup, before Run. Lookups
// during processing are read-only and concurrency-safe.
type Registry struct {
	handlers map[string]Handler
}

// NewRegistry returns an empty handler registry.
func NewRegistry() *Registry {
	return &Registry{handlers: make(map[string]Handler)}
}

// Register associates a Handler with a job type. It panics on an empty type, a
// nil handler, or a duplicate registration, since all three are wiring bugs that
// must surface at startup rather than at job-dispatch time.
func (r *Registry) Register(jobType string, h Handler) {
	if jobType == "" {
		panic("jobs: Register called with empty job type")
	}
	if h == nil {
		panic(fmt.Sprintf("jobs: Register called with nil handler for type %q", jobType))
	}
	if _, dup := r.handlers[jobType]; dup {
		panic(fmt.Sprintf("jobs: duplicate handler registered for type %q", jobType))
	}
	r.handlers[jobType] = h
}

// RegisterFunc is a convenience wrapper around Register for HandlerFunc values.
func (r *Registry) RegisterFunc(jobType string, fn HandlerFunc) {
	r.Register(jobType, fn)
}

// Handler returns the Handler registered for jobType, or (nil, false) if none is
// registered. The worker treats an unknown type as a non-retryable failure.
func (r *Registry) Handler(jobType string) (Handler, bool) {
	h, ok := r.handlers[jobType]
	return h, ok
}
