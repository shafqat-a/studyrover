package jobs

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"sync"
	"time"
)

// Default worker tuning. All are overridable via Config; the zero Config yields
// these values so callers can pass Config{} and get sane behaviour.
const (
	defaultConcurrency  = 4
	defaultPollInterval = time.Second
	defaultMaxAttempts  = 5
	defaultBaseBackoff  = 2 * time.Second
	defaultMaxBackoff   = 5 * time.Minute
)

// Config tunes a Worker. A zero value is valid and uses the package defaults.
type Config struct {
	// Concurrency is the number of jobs processed in parallel (the bounded pool
	// size). Defaults to defaultConcurrency.
	Concurrency int
	// PollInterval is how long an idle worker waits before polling for a new job
	// when the queue is empty. Defaults to defaultPollInterval.
	PollInterval time.Duration
	// MaxAttempts caps how many times a job is tried before being marked error.
	// Defaults to defaultMaxAttempts. A value of 1 disables retries.
	MaxAttempts int32
	// BaseBackoff is the first retry delay; subsequent retries grow exponentially
	// up to MaxBackoff. Defaults to defaultBaseBackoff.
	BaseBackoff time.Duration
	// MaxBackoff caps the exponential backoff delay. Defaults to defaultMaxBackoff.
	MaxBackoff time.Duration
	// Clock injects "now" for deterministic backoff in tests. Defaults to the
	// real wall clock.
	Clock Clock
	// Logger receives structured lifecycle logs. Defaults to slog.Default().
	Logger *slog.Logger
}

func (c Config) withDefaults() Config {
	if c.Concurrency <= 0 {
		c.Concurrency = defaultConcurrency
	}
	if c.PollInterval <= 0 {
		c.PollInterval = defaultPollInterval
	}
	if c.MaxAttempts <= 0 {
		c.MaxAttempts = defaultMaxAttempts
	}
	if c.BaseBackoff <= 0 {
		c.BaseBackoff = defaultBaseBackoff
	}
	if c.MaxBackoff <= 0 {
		c.MaxBackoff = defaultMaxBackoff
	}
	if c.Clock == nil {
		c.Clock = systemClock
	}
	if c.Logger == nil {
		c.Logger = slog.Default()
	}
	return c
}

// Worker drains the Queue with a bounded pool of goroutines, dispatching each
// claimed job to the Handler registered for its type and applying retry with
// exponential backoff on failure.
//
// Lifecycle: build with NewWorker, register handlers on the embedded Registry (or
// the one passed in), then Run(ctx). Run blocks until ctx is cancelled and all
// in-flight jobs have drained, giving a clean shutdown. The pool is bounded by
// Config.Concurrency, so at most that many jobs run at once regardless of how full
// the queue is.
type Worker struct {
	queue *Queue
	reg   *Registry
	cfg   Config
	log   *slog.Logger
}

// NewWorker builds a Worker over q dispatching to handlers in reg. If reg is nil a
// fresh empty Registry is created (accessible via Registry); features then call
// Register before Run.
func NewWorker(q *Queue, reg *Registry, cfg Config) *Worker {
	if reg == nil {
		reg = NewRegistry()
	}
	cfg = cfg.withDefaults()
	return &Worker{
		queue: q.WithClock(cfg.Clock),
		reg:   reg,
		cfg:   cfg,
		log:   cfg.Logger.With("component", "jobs.worker"),
	}
}

// Registry exposes the handler registry so features can Register their handlers at
// wiring time (2-W04) before Run is called.
func (w *Worker) Registry() *Registry { return w.reg }

// Run starts the bounded worker pool and blocks until ctx is cancelled. On
// cancellation it stops claiming new jobs and waits for in-flight handlers to
// finish (which should themselves honour the cancelled ctx). It always returns nil
// once drained; per-job failures are recorded on the jobs, not surfaced here.
func (w *Worker) Run(ctx context.Context) error {
	w.log.Info("starting", "concurrency", w.cfg.Concurrency, "poll", w.cfg.PollInterval)

	var wg sync.WaitGroup
	for i := 0; i < w.cfg.Concurrency; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			w.loop(ctx, id)
		}(i)
	}

	wg.Wait()
	w.log.Info("stopped")
	return nil
}

// loop is one pool goroutine: it claims and processes jobs until ctx is done,
// sleeping PollInterval whenever the queue is empty.
func (w *Worker) loop(ctx context.Context, id int) {
	log := w.log.With("loop", id)
	timer := time.NewTimer(0)
	if !timer.Stop() {
		<-timer.C
	}
	defer timer.Stop()

	for {
		if ctx.Err() != nil {
			return
		}

		job, err := w.queue.Claim(ctx)
		switch {
		case errors.Is(err, ErrNoJob):
			// Idle: wait a poll interval (or exit on cancellation).
			timer.Reset(w.cfg.PollInterval)
			select {
			case <-ctx.Done():
				return
			case <-timer.C:
			}
			continue
		case err != nil:
			if ctx.Err() != nil {
				return
			}
			log.Error("claim failed", "err", err)
			// Transient store error: back off a poll interval before retrying.
			timer.Reset(w.cfg.PollInterval)
			select {
			case <-ctx.Done():
				return
			case <-timer.C:
			}
			continue
		}

		w.process(ctx, job)
	}
}

// process dispatches a single claimed job to its handler and records the outcome
// (ready, retry-with-backoff, or terminal error).
func (w *Worker) process(ctx context.Context, job Job) {
	log := w.log.With("job", job.ID, "type", job.Type, "attempt", job.Attempts)

	handler, ok := w.reg.Handler(job.Type)
	if !ok {
		// Unknown type is a wiring bug, not transient: fail terminally without
		// burning the retry budget.
		err := fmt.Errorf("no handler registered for job type %q", job.Type)
		log.Error("dispatch failed", "err", err)
		if _, ferr := w.queue.Fail(ctx, job.ID, err); ferr != nil {
			log.Error("mark failed", "err", ferr)
		}
		return
	}

	prog := func(ctx context.Context, percent int32) error {
		_, err := w.queue.Progress(ctx, job.ID, percent)
		return err
	}

	result, err := w.safeHandle(ctx, handler, job, prog)
	if err == nil {
		if _, cerr := w.queue.Complete(ctx, job.ID, result); cerr != nil {
			log.Error("mark ready", "err", cerr)
			return
		}
		log.Info("ready")
		return
	}

	// Failure. Retry with backoff while attempts remain; otherwise fail terminally.
	if job.Attempts < w.cfg.MaxAttempts {
		nextAttempt := job.Attempts + 1
		delay := w.backoff(job.Attempts)
		if _, rerr := w.queue.Retry(ctx, job, err, delay, nextAttempt); rerr != nil {
			log.Error("schedule retry", "err", rerr)
			return
		}
		log.Warn("retrying", "err", err, "delay", delay, "next_attempt", nextAttempt)
		return
	}

	log.Error("failed permanently", "err", err)
	if _, ferr := w.queue.Fail(ctx, job.ID, err); ferr != nil {
		log.Error("mark failed", "err", ferr)
	}
}

// safeHandle runs a handler, converting a panic into an error so one buggy handler
// cannot take down a pool goroutine.
func (w *Worker) safeHandle(ctx context.Context, h Handler, job Job, prog ProgressFunc) (result []byte, err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("handler panicked: %v", r)
		}
	}()
	return h.Handle(ctx, job, prog)
}

// backoff returns the delay before the next attempt given how many attempts have
// already been made. It grows exponentially from BaseBackoff and is capped at
// MaxBackoff: base, base*2, base*4, … For the first failure attempts == 1.
func (w *Worker) backoff(attempts int32) time.Duration {
	if attempts < 1 {
		attempts = 1
	}
	// base * 2^(attempts-1), guarding against overflow on the shift.
	exp := float64(attempts - 1)
	factor := math.Pow(2, exp)
	delay := time.Duration(float64(w.cfg.BaseBackoff) * factor)
	if delay <= 0 || delay > w.cfg.MaxBackoff {
		return w.cfg.MaxBackoff
	}
	return delay
}
