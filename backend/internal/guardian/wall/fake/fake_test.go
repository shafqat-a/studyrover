package fake

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/shafqat/studyrover/backend/internal/guardian/wall"
)

const (
	macA = "aa:bb:cc:dd:ee:01"
	macB = "aa:bb:cc:dd:ee:02"
)

// clock is a settable clock for the tests.
type clock struct{ t time.Time }

func (c *clock) now() time.Time          { return c.t }
func (c *clock) advance(d time.Duration) { c.t = c.t.Add(d) }
func newClock() *clock                   { return &clock{t: time.Date(2026, 8, 26, 10, 0, 0, 0, time.UTC)} }
func newWall(c *clock, seed ...wall.DiscoveredDevice) *Wall {
	w := New(seed...)
	w.SetClock(c.now)
	return w
}

func TestGrantListRevoke(t *testing.T) {
	ctx := context.Background()
	c := newClock()
	w := newWall(c, wall.DiscoveredDevice{MAC: macA, IP: "192.168.88.10", Hostname: "tablet"})

	ref, err := w.Grant(ctx, "AA-BB-CC-DD-EE-01", 30*time.Minute)
	if err != nil {
		t.Fatalf("Grant: %v", err)
	}
	if ref == "" {
		t.Fatal("Grant returned empty ref")
	}

	active, err := w.ListActive(ctx)
	if err != nil {
		t.Fatalf("ListActive: %v", err)
	}
	if len(active) != 1 {
		t.Fatalf("ListActive = %d grants, want 1", len(active))
	}
	g := active[0]
	if g.MAC != macA || g.IP != "192.168.88.10" || g.Ref != ref {
		t.Fatalf("ListActive[0] = %+v", g)
	}
	if want := c.t.Add(30 * time.Minute); !g.ExpiresAt.Equal(want) {
		t.Fatalf("ExpiresAt = %v, want %v", g.ExpiresAt, want)
	}
	if got := g.Remaining(c.t); got != 30*time.Minute {
		t.Fatalf("Remaining = %v, want 30m", got)
	}

	// re-Grant replaces: new expiry, new ref
	ref2, err := w.Grant(ctx, macA, time.Hour)
	if err != nil {
		t.Fatalf("Grant 2: %v", err)
	}
	if ref2 == ref {
		t.Fatal("re-Grant must return a fresh ref")
	}
	active, _ = w.ListActive(ctx)
	if len(active) != 1 || !active[0].ExpiresAt.Equal(c.t.Add(time.Hour)) || active[0].Ref != ref2 {
		t.Fatalf("after re-Grant: %+v", active)
	}

	if err := w.Revoke(ctx, macA); err != nil {
		t.Fatalf("Revoke: %v", err)
	}
	if active, _ = w.ListActive(ctx); len(active) != 0 {
		t.Fatalf("after Revoke: %+v", active)
	}
	if err := w.Revoke(ctx, macA); !errors.Is(err, wall.ErrNotFound) {
		t.Fatalf("second Revoke = %v, want ErrNotFound", err)
	}
	if err := w.Revoke(ctx, macB); !errors.Is(err, wall.ErrNotFound) {
		t.Fatalf("Revoke unknown = %v, want ErrNotFound", err)
	}
}

func TestExpiryIsLazy(t *testing.T) {
	ctx := context.Background()
	c := newClock()
	w := newWall(c)

	if _, err := w.Grant(ctx, macA, 10*time.Minute); err != nil {
		t.Fatal(err)
	}
	if _, err := w.Grant(ctx, macB, 20*time.Minute); err != nil {
		t.Fatal(err)
	}
	c.advance(10 * time.Minute) // A expires exactly now (not After → gone)
	active, _ := w.ListActive(ctx)
	if len(active) != 1 || active[0].MAC != macB {
		t.Fatalf("after 10m: %+v", active)
	}
	if err := w.Revoke(ctx, macA); !errors.Is(err, wall.ErrNotFound) {
		t.Fatalf("Revoke expired = %v, want ErrNotFound", err)
	}
	c.advance(10 * time.Minute)
	if active, _ = w.ListActive(ctx); len(active) != 0 {
		t.Fatalf("after 20m: %+v", active)
	}
}

func TestDiscoverUnion(t *testing.T) {
	ctx := context.Background()
	w := newWall(newClock(), wall.DiscoveredDevice{MAC: "AA:BB:CC:DD:EE:01", IP: "192.168.88.10", Hostname: "tablet"})

	devs, err := w.Discover(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(devs) != 1 || devs[0].MAC != macA || devs[0].Hostname != "tablet" {
		t.Fatalf("seed only: %+v", devs)
	}

	if _, err := w.Grant(ctx, macB, time.Minute); err != nil {
		t.Fatal(err)
	}
	if err := w.Gate(ctx, "aa:bb:cc:dd:ee:03", true); err != nil {
		t.Fatal(err)
	}
	if err := w.Gate(ctx, macA, true); err != nil { // already seeded: no duplicate
		t.Fatal(err)
	}
	devs, _ = w.Discover(ctx)
	if len(devs) != 3 {
		t.Fatalf("Discover = %+v, want 3 devices", devs)
	}
	if devs[0].MAC != macA || devs[0].IP != "192.168.88.10" {
		t.Fatalf("seed must come first and keep its IP: %+v", devs[0])
	}
	if devs[1].MAC != macB || devs[2].MAC != "aa:bb:cc:dd:ee:03" {
		t.Fatalf("extras must be sorted by MAC: %+v", devs[1:])
	}
}

func TestGate(t *testing.T) {
	ctx := context.Background()
	w := newWall(newClock())

	if got := w.Gated(); len(got) != 0 {
		t.Fatalf("Gated initially = %v", got)
	}
	for i := 0; i < 2; i++ { // idempotent
		if err := w.Gate(ctx, macB, true); err != nil {
			t.Fatal(err)
		}
	}
	if err := w.Gate(ctx, macA, true); err != nil {
		t.Fatal(err)
	}
	if got := w.Gated(); len(got) != 2 || got[0] != macA || got[1] != macB {
		t.Fatalf("Gated = %v", got)
	}
	if !w.IsGated("AA-BB-CC-DD-EE-01") || w.IsGated("aa:bb:cc:dd:ee:09") || w.IsGated("garbage") {
		t.Fatal("IsGated mismatch")
	}
	if err := w.Gate(ctx, macA, false); err != nil {
		t.Fatal(err)
	}
	if err := w.Gate(ctx, macA, false); err != nil { // ungating twice is fine
		t.Fatal(err)
	}
	if got := w.Gated(); len(got) != 1 || got[0] != macB {
		t.Fatalf("Gated after ungate = %v", got)
	}
}

func TestInvalidMACAndInjectedError(t *testing.T) {
	ctx := context.Background()
	w := newWall(newClock())

	if _, err := w.Grant(ctx, "not-a-mac", time.Minute); err == nil {
		t.Fatal("Grant with invalid MAC must fail")
	}
	if err := w.Gate(ctx, "", true); err == nil {
		t.Fatal("Gate with invalid MAC must fail")
	}

	boom := errors.New("router unreachable")
	w.SetErr(boom)
	if _, err := w.Grant(ctx, macA, time.Minute); !errors.Is(err, boom) {
		t.Fatalf("Grant with SetErr = %v", err)
	}
	if err := w.Ping(ctx); !errors.Is(err, boom) {
		t.Fatalf("Ping with SetErr = %v", err)
	}
	w.SetErr(nil)
	if err := w.Ping(ctx); err != nil {
		t.Fatalf("Ping after clearing = %v", err)
	}
	if _, err := w.Grant(ctx, macA, time.Minute); err != nil {
		t.Fatalf("Grant after clearing = %v", err)
	}
}

func TestKind(t *testing.T) {
	if k := New().Kind(); k != wall.KindFake {
		t.Fatalf("Kind = %q", k)
	}
}
