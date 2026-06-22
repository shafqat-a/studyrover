package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// Job type identifiers (contract 2-C03 Job.type). Features enqueue with these and
// register a matching Handler under the same string.
const (
	TypeIngest    = "ingest"
	TypeSyllabus  = "syllabus"
	TypeQuestions = "questions"
)

// Job is the persisted job row (contract 2-C03), aliased from the store so the
// jobs package's public API does not leak the store import onto every caller.
type Job = store.Job

// ErrNoJob is returned by Claim when there is no runnable job to process. It is
// the expected, non-error idle condition for the worker poll loop, not a failure.
var ErrNoJob = errors.New("jobs: no runnable job")

// Clock supplies "now" so backoff scheduling is deterministic in tests. Production
// wiring uses the real wall clock; tests inject a fixed clock.
type Clock interface {
	Now() time.Time
}

// clockFunc adapts a func into a Clock.
type clockFunc func() time.Time

func (f clockFunc) Now() time.Time { return f() }

// systemClock is the default real-wall-clock Clock.
var systemClock Clock = clockFunc(time.Now)

// Queue is the persistence-facing half of the job system. It wraps the sqlc job
// queries behind a small, intention-revealing API (Enqueue, Claim, Complete,
// Fail, Progress, Get, List) so the worker — and the feature handlers — never
// touch raw SQL.
//
// Queue depends only on store.Store, the same seam the HTTP handlers use, which
// keeps it unit testable: tests pass an in-memory fake Store, production passes
// the *store.DB pool. Claim relies on the FOR UPDATE SKIP LOCKED query so several
// workers (and processes) can drain the queue concurrently without double-running
// a job.
type Queue struct {
	store store.Store
	clock Clock
}

// NewQueue builds a Queue over the given store using the real clock.
func NewQueue(s store.Store) *Queue {
	return &Queue{store: s, clock: systemClock}
}

// WithClock returns a copy of q that reads time from clk. Used by tests to make
// backoff scheduling deterministic.
func (q *Queue) WithClock(clk Clock) *Queue {
	cp := *q
	if clk != nil {
		cp.clock = clk
	}
	return &cp
}

// EnqueueParams describes a job to schedule. Payload is any JSON-serialisable
// value (the feature-specific request); RunAfter, when non-zero, delays the job
// until that time (used for retry backoff).
type EnqueueParams struct {
	Type      string
	SubjectID *string
	Payload   any
	RunAfter  time.Time
}

// Enqueue schedules a new job and returns the created row (status "queued"). The
// payload is JSON-encoded; a nil payload is stored as the empty object the schema
// defaults to.
func (q *Queue) Enqueue(ctx context.Context, p EnqueueParams) (store.Job, error) {
	if p.Type == "" {
		return store.Job{}, fmt.Errorf("jobs: enqueue: empty job type")
	}

	var payload []byte
	if p.Payload != nil {
		raw, err := json.Marshal(p.Payload)
		if err != nil {
			return store.Job{}, fmt.Errorf("jobs: enqueue: marshal payload: %w", err)
		}
		payload = raw
	}

	arg := store.EnqueueJobParams{
		Type:      p.Type,
		SubjectID: p.SubjectID,
		Payload:   payloadArg(payload),
		RunAfter:  runAfterArg(p.RunAfter),
	}
	return q.store.EnqueueJob(ctx, arg)
}

// Claim atomically grabs the oldest runnable queued job, marks it processing and
// increments its attempt counter. It returns ErrNoJob when the queue is idle so
// the worker can back off and poll again. The underlying query uses
// FOR UPDATE SKIP LOCKED, so concurrent workers never claim the same row.
func (q *Queue) Claim(ctx context.Context) (store.Job, error) {
	job, err := q.store.ClaimNextJob(ctx)
	if errors.Is(err, pgx.ErrNoRows) {
		return store.Job{}, ErrNoJob
	}
	if err != nil {
		return store.Job{}, fmt.Errorf("jobs: claim: %w", err)
	}
	return job, nil
}

// Progress records a job's completion percentage, clamped to [0,100]. It is
// best-effort: callers (the worker's ProgressFunc) may ignore the returned error.
func (q *Queue) Progress(ctx context.Context, id string, percent int32) (store.Job, error) {
	if percent < 0 {
		percent = 0
	}
	if percent > 100 {
		percent = 100
	}
	return q.store.UpdateJobProgress(ctx, store.UpdateJobProgressParams{ID: id, Progress: percent})
}

// Complete marks a job ready and stores its result (the JSON the handler
// returned; nil is allowed and stored as SQL NULL).
func (q *Queue) Complete(ctx context.Context, id string, result []byte) (store.Job, error) {
	return q.store.CompleteJob(ctx, store.CompleteJobParams{ID: id, Result: result})
}

// Fail marks a job errored, recording cause as the failure message. This is the
// terminal failure used once the attempt budget is exhausted.
func (q *Queue) Fail(ctx context.Context, id string, cause error) (store.Job, error) {
	msg := "unknown error"
	if cause != nil {
		msg = cause.Error()
	}
	return q.store.FailJob(ctx, store.FailJobParams{ID: id, Error: &msg})
}

// Retry schedules a fresh attempt of failed by re-enqueueing the same work with a
// backoff delay, and marks the failed attempt errored with a "retrying" note so
// the original row never lingers in the processing state.
//
// The job system uses one row per attempt: the original job is the first attempt,
// each Retry spawns its successor. The successor carries the same type, subject
// and payload, and becomes runnable only after delay has elapsed (run_after).
// nextAttempt is the successor's attempt number, surfaced in the retry note so the
// chain is traceable.
func (q *Queue) Retry(ctx context.Context, failed store.Job, cause error, delay time.Duration, nextAttempt int32) (store.Job, error) {
	runAfter := q.clock.Now().Add(delay)

	successor, err := q.Enqueue(ctx, EnqueueParams{
		Type:      failed.Type,
		SubjectID: failed.SubjectID,
		Payload:   rawPayload(failed.Payload),
		RunAfter:  runAfter,
	})
	if err != nil {
		return store.Job{}, fmt.Errorf("jobs: retry: enqueue successor: %w", err)
	}

	note := fmt.Errorf("attempt %d failed, retrying as job %s after %s: %w",
		failed.Attempts, successor.ID, delay, cause)
	if _, ferr := q.Fail(ctx, failed.ID, note); ferr != nil {
		return successor, fmt.Errorf("jobs: retry: mark prior attempt failed: %w", ferr)
	}
	return successor, nil
}

// Get returns a job by id.
func (q *Queue) Get(ctx context.Context, id string) (store.Job, error) {
	return q.store.GetJob(ctx, id)
}

// List returns jobs, newest first, optionally filtered by subject. limit and
// offset paginate; a non-positive limit defaults to 50.
func (q *Queue) List(ctx context.Context, subjectID *string, limit, offset int32) ([]store.Job, error) {
	if limit <= 0 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	return q.store.ListJobs(ctx, store.ListJobsParams{
		Limit:     limit,
		Offset:    offset,
		SubjectID: subjectID,
	})
}

// payloadArg shapes the payload for EnqueueJob.Payload, whose generated type is
// interface{} (the COALESCE-NULL narg). A nil slice becomes SQL NULL so the
// schema default ('{}') applies.
func payloadArg(payload []byte) any {
	if len(payload) == 0 {
		return nil
	}
	return payload
}

// runAfterArg shapes RunAfter for EnqueueJob.RunAfter (interface{} narg). The zero
// time becomes SQL NULL so run_after defaults to now().
func runAfterArg(t time.Time) any {
	if t.IsZero() {
		return nil
	}
	return t
}

// rawPayload preserves an already-encoded JSON payload (store.Job.Payload is the
// raw jsonb bytes) when re-enqueueing a retry, avoiding a decode/re-encode round
// trip. json.RawMessage marshals to itself.
func rawPayload(b []byte) any {
	if len(b) == 0 {
		return nil
	}
	return json.RawMessage(b)
}
