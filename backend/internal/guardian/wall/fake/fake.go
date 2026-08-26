// Package fake is the in-memory Wall (task 3-F05): lets the whole Guardian run
// and be tested with no MikroTik hardware. STUB — implemented by the Go core
// agent; the signatures below are frozen.
package fake

import (
	"context"
	"errors"
	"time"

	"github.com/shafqat/studyrover/backend/internal/guardian/wall"
)

// Wall is an in-memory wall. Zero value is NOT usable; use New.
type Wall struct{}

// New returns a fake wall. seed devices are what Discover reports.
func New(seed ...wall.DiscoveredDevice) *Wall { return &Wall{} }

// Now lets tests control time; defaults to time.Now.
func (w *Wall) SetClock(now func() time.Time) {}

func (w *Wall) Kind() wall.Kind { return wall.KindFake }
func (w *Wall) Grant(ctx context.Context, mac string, d time.Duration) (string, error) {
	return "", errors.New("fake wall: not implemented")
}
func (w *Wall) Revoke(ctx context.Context, mac string) error {
	return errors.New("fake wall: not implemented")
}
func (w *Wall) ListActive(ctx context.Context) ([]wall.ActiveGrant, error) {
	return nil, errors.New("fake wall: not implemented")
}
func (w *Wall) Discover(ctx context.Context) ([]wall.DiscoveredDevice, error) {
	return nil, errors.New("fake wall: not implemented")
}
func (w *Wall) Ping(ctx context.Context) error { return nil }

var _ wall.Wall = (*Wall)(nil)
