// Package ingest consumes the platform's score_event outbox and turns each
// event into a grant decision (tasks 3-F02, 3-A12). STUB — implemented by the
// Go http/ingest agent; the exported surface below is frozen for wiring.
package ingest

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/shafqat/studyrover/backend/internal/guardian/session"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// Config tunes the subscriber.
type Config struct {
	// Poll interval for new score_event rows (default 2s).
	Poll time.Duration
	// Batch size per poll (default 50).
	Batch  int
	Now    func() time.Time
	Logger *slog.Logger
}

// Subscriber polls score_event forward from the inbox cursor and runs the
// pipeline for each unseen event exactly once.
type Subscriber struct{}

// NewSubscriber wires the pipeline dependencies.
func NewSubscriber(db store.Store, sessions *session.Manager, cfg Config) *Subscriber {
	return &Subscriber{}
}

// Run polls until ctx is cancelled. Blocks.
func (s *Subscriber) Run(ctx context.Context) error { return errors.New("ingest: not implemented") }

// ProcessOnce drains everything currently unseen (used by tests and by the
// submit handler's optional "kick" so grants land within milliseconds).
func (s *Subscriber) ProcessOnce(ctx context.Context) (processed int, err error) {
	return 0, errors.New("ingest: not implemented")
}

// Kick nudges the subscriber to poll now (non-blocking, coalesced).
func (s *Subscriber) Kick() {}
