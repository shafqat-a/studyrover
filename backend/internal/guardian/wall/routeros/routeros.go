// Package routeros implements Wall against the MikroTik RouterOS v7 REST API
// (task 3-F04, spec §11). STUB — implemented by the Go core agent; Config and
// New are frozen so wiring can be written against them.
package routeros

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/shafqat/studyrover/backend/internal/guardian/wall"
)

// Config is everything needed to talk to the router (from env, see
// internal/config: ROUTEROS_URL, ROUTEROS_USER, ROUTEROS_PASSWORD,
// ROUTEROS_INSECURE_TLS, ROUTEROS_HOTSPOT_SERVER).
type Config struct {
	// BaseURL of the REST API, e.g. "https://192.168.88.1" (path /rest is appended).
	BaseURL  string
	User     string
	Password string
	// InsecureTLS skips certificate verification (self-signed router certs).
	InsecureTLS bool
	// HotspotServer is the /ip/hotspot server name gating the student devices
	// (empty = the first/only server).
	HotspotServer string
	// HTTPClient overrides the client (tests); nil = a sane default with timeout.
	HTTPClient *http.Client
	// Timeout per REST call when HTTPClient is nil.
	Timeout time.Duration
}

// Wall talks to one router.
type Wall struct{ cfg Config }

// New validates cfg and returns a wall. It does not contact the router; use
// Ping for that.
func New(cfg Config) (*Wall, error) {
	if cfg.BaseURL == "" || cfg.User == "" {
		return nil, errors.New("routeros: BaseURL and User are required")
	}
	return &Wall{cfg: cfg}, nil
}

func (w *Wall) Kind() wall.Kind { return wall.KindRouterOS }
func (w *Wall) Grant(ctx context.Context, mac string, d time.Duration) (string, error) {
	return "", errors.New("routeros: not implemented")
}
func (w *Wall) Revoke(ctx context.Context, mac string) error {
	return errors.New("routeros: not implemented")
}
func (w *Wall) ListActive(ctx context.Context) ([]wall.ActiveGrant, error) {
	return nil, errors.New("routeros: not implemented")
}
func (w *Wall) Discover(ctx context.Context) ([]wall.DiscoveredDevice, error) {
	return nil, errors.New("routeros: not implemented")
}
func (w *Wall) Ping(ctx context.Context) error { return errors.New("routeros: not implemented") }

func (w *Wall) Gate(ctx context.Context, mac string, gated bool) error {
	return errors.New("routeros: not implemented")
}

var _ wall.Wall = (*Wall)(nil)
