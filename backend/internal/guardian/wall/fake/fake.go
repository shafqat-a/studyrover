// Package fake is the in-memory Wall (task 3-F05): lets the whole Guardian run
// and be tested with no MikroTik hardware. It mirrors the routeros semantics
// that matter to callers — Grant replaces, Revoke of an unknown MAC is
// ErrNotFound, expired grants vanish from ListActive, Discover shows the
// devices a real scan would — and adds a few exported test helpers
// (SetClock, SetErr, Gated, IsGated).
package fake

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"sort"
	"sync"
	"time"

	"github.com/shafqat/studyrover/backend/internal/guardian/wall"
)

// grant is one open grant on the fake wall.
type grant struct {
	ip        string
	expiresAt time.Time
	ref       string
}

// Wall is an in-memory wall. Zero value is NOT usable; use New.
type Wall struct {
	mu     sync.Mutex
	now    func() time.Time
	err    error                            // injected failure for mutating calls (SetErr)
	seed   []wall.DiscoveredDevice          // what New was told is on the network
	seen   map[string]wall.DiscoveredDevice // every MAC ever granted/gated, by MAC
	grants map[string]grant                 // open grants by MAC
	gated  map[string]bool                  // gated MACs
}

// New returns a fake wall. seed devices are what Discover reports.
func New(seed ...wall.DiscoveredDevice) *Wall {
	w := &Wall{
		now:    time.Now,
		seen:   map[string]wall.DiscoveredDevice{},
		grants: map[string]grant{},
		gated:  map[string]bool{},
	}
	for _, d := range seed {
		if mac, err := wall.NormalizeMAC(d.MAC); err == nil {
			d.MAC = mac
		}
		w.seed = append(w.seed, d)
	}
	return w
}

// Now lets tests control time; defaults to time.Now.
func (w *Wall) SetClock(now func() time.Time) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if now == nil {
		now = time.Now
	}
	w.now = now
}

// SetErr makes every subsequent Grant/Revoke/Gate/Ping call fail with err
// until called again with nil. Test helper for exercising callers' rollback
// paths (e.g. session.Manager when the router is unreachable).
func (w *Wall) SetErr(err error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.err = err
}

// Gated returns the MACs currently gated, sorted. Test helper.
func (w *Wall) Gated() []string {
	w.mu.Lock()
	defer w.mu.Unlock()
	out := make([]string, 0, len(w.gated))
	for mac := range w.gated {
		out = append(out, mac)
	}
	sort.Strings(out)
	return out
}

// IsGated reports whether mac currently has a gate rule. Test helper.
func (w *Wall) IsGated(mac string) bool {
	mac, err := wall.NormalizeMAC(mac)
	if err != nil {
		return false
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.gated[mac]
}

func (w *Wall) Kind() wall.Kind { return wall.KindFake }

// Grant opens (or re-opens, replacing the expiry) internet for mac until
// now+d and returns a fresh random ref.
func (w *Wall) Grant(ctx context.Context, mac string, d time.Duration) (string, error) {
	mac, err := wall.NormalizeMAC(mac)
	if err != nil {
		return "", err
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.err != nil {
		return "", w.err
	}
	w.remember(mac)
	ref := newRef()
	w.grants[mac] = grant{ip: w.ipFor(mac), expiresAt: w.now().Add(d), ref: ref}
	return ref, nil
}

// Revoke closes mac's grant; wall.ErrNotFound when there is none (including
// one that has already expired).
func (w *Wall) Revoke(ctx context.Context, mac string) error {
	mac, err := wall.NormalizeMAC(mac)
	if err != nil {
		return err
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.err != nil {
		return w.err
	}
	w.dropExpired()
	if _, ok := w.grants[mac]; !ok {
		return wall.ErrNotFound
	}
	delete(w.grants, mac)
	return nil
}

// ListActive returns the open grants sorted by MAC; expired ones are dropped
// lazily on the way.
func (w *Wall) ListActive(ctx context.Context) ([]wall.ActiveGrant, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.dropExpired()
	out := make([]wall.ActiveGrant, 0, len(w.grants))
	for mac, g := range w.grants {
		out = append(out, wall.ActiveGrant{MAC: mac, IP: g.ip, ExpiresAt: g.expiresAt, Ref: g.ref})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].MAC < out[j].MAC })
	return out, nil
}

// Discover returns the seed devices plus every MAC that was ever granted or
// gated (so the UI's scan always shows the devices in play), deduplicated
// by MAC with seed entries winning.
func (w *Wall) Discover(ctx context.Context) ([]wall.DiscoveredDevice, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	out := make([]wall.DiscoveredDevice, 0, len(w.seed)+len(w.seen))
	have := map[string]bool{}
	for _, d := range w.seed {
		out = append(out, d)
		have[d.MAC] = true
	}
	extra := make([]wall.DiscoveredDevice, 0, len(w.seen))
	for mac, d := range w.seen {
		if !have[mac] {
			extra = append(extra, d)
		}
	}
	sort.Slice(extra, func(i, j int) bool { return extra[i].MAC < extra[j].MAC })
	return append(out, extra...), nil
}

// Ping is healthy unless SetErr injected a failure.
func (w *Wall) Ping(ctx context.Context) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.err
}

// Gate records mac as gated (true) or ungated (false). Idempotent.
func (w *Wall) Gate(ctx context.Context, mac string, gated bool) error {
	mac, err := wall.NormalizeMAC(mac)
	if err != nil {
		return err
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.err != nil {
		return w.err
	}
	w.remember(mac)
	if gated {
		w.gated[mac] = true
	} else {
		delete(w.gated, mac)
	}
	return nil
}

// remember records mac so Discover reports it. Caller holds mu.
func (w *Wall) remember(mac string) {
	if _, ok := w.seen[mac]; ok {
		return
	}
	for _, d := range w.seed {
		if d.MAC == mac {
			w.seen[mac] = d
			return
		}
	}
	w.seen[mac] = wall.DiscoveredDevice{MAC: mac}
}

// ipFor is the IP a seed device carries, or "" for unknown MACs. Caller holds mu.
func (w *Wall) ipFor(mac string) string {
	for _, d := range w.seed {
		if d.MAC == mac {
			return d.IP
		}
	}
	return ""
}

// dropExpired forgets grants whose expiry has passed. Caller holds mu.
func (w *Wall) dropExpired() {
	now := w.now()
	for mac, g := range w.grants {
		if !g.expiresAt.After(now) {
			delete(w.grants, mac)
		}
	}
}

// newRef returns a random 16-hex-char handle, mimicking an opaque router id.
func newRef() string {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		// crypto/rand failing is effectively impossible; fall back to a
		// timestamp so the fake never panics inside a test.
		return "fake-" + time.Now().Format("150405.000000000")
	}
	return hex.EncodeToString(b[:])
}

var _ wall.Wall = (*Wall)(nil)
