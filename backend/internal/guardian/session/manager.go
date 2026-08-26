// Package session is the grant lifecycle (task 3-F06): persist grants, open
// them on the wall, count down, auto-revoke on expiry, and reconcile the wall
// with the DB on boot. STUB — implemented by the Go core agent; API frozen.
package session

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/shafqat/studyrover/backend/internal/guardian/wall"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// Source mirrors contracts.GrantSource.
type Source string

const (
	SourceExam   Source = "exam"
	SourceManual Source = "manual"
)

// Request opens a grant for a registered device.
type Request struct {
	Device    store.GuardianDevice
	Minutes   int
	Source    Source
	AttemptID string // source=exam
	Reason    string // source=manual
}

// Config tunes the manager.
type Config struct {
	// Tick is how often expired grants are swept (default 15s).
	Tick time.Duration
	// Now overrides the clock (tests). Default time.Now.
	Now    func() time.Time
	Logger *slog.Logger
}

// Manager owns grants. Safe for concurrent use.
type Manager struct{}

// NewManager wires the store and wall.
func NewManager(db store.Store, w wall.Wall, cfg Config) *Manager { return &Manager{} }

// Run reconciles on start (reload active grants from the DB, re-open any the
// wall lost, revoke any the wall has that the DB doesn't) and then sweeps
// expired grants every Tick until ctx is cancelled. Blocks.
func (m *Manager) Run(ctx context.Context) error { return errors.New("session: not implemented") }

// Grant persists a grant, opens it on the wall, and returns the row. When the
// device already has an active grant, the new minutes are ADDED to the
// remaining time (one open grant per device; the previous row is revoked and
// a new one created with the combined expiry).
func (m *Manager) Grant(ctx context.Context, req Request) (store.GuardianGrant, error) {
	return store.GuardianGrant{}, errors.New("session: not implemented")
}

// Revoke closes a grant now (DB + wall). Idempotent on already-closed grants.
func (m *Manager) Revoke(ctx context.Context, grantID string) (store.GuardianGrant, error) {
	return store.GuardianGrant{}, errors.New("session: not implemented")
}

// RevokeDevice closes every active grant for a device (used on device delete).
func (m *Manager) RevokeDevice(ctx context.Context, deviceID string) error {
	return errors.New("session: not implemented")
}

// Active lists grants that are open right now (DB view).
func (m *Manager) Active(ctx context.Context) ([]store.GuardianGrant, error) {
	return nil, errors.New("session: not implemented")
}

// ActiveForStudent lists the student's open grants, longest remaining first.
func (m *Manager) ActiveForStudent(ctx context.Context, studentID string) ([]store.GuardianGrant, error) {
	return nil, errors.New("session: not implemented")
}
