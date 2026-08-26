package session

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/shafqat/studyrover/backend/internal/guardian/wall"
	"github.com/shafqat/studyrover/backend/internal/guardian/wall/fake"
	"github.com/shafqat/studyrover/backend/internal/store"
)

const (
	macA = "aa:bb:cc:dd:ee:01"
	macB = "aa:bb:cc:dd:ee:02"
)

// memRepo is an in-memory guardian_grant table implementing repo with the
// same semantics as the sqlc queries (active = revoked_at IS NULL AND
// expires_at > now; ordering as in the SQL).
type memRepo struct {
	mu     sync.Mutex
	nextID int
	rows   []store.GuardianGrant
	// failCreate, when set, makes CreateGuardianGrant fail (rollback tests).
	failCreate error
}

func (r *memRepo) CreateGuardianGrant(ctx context.Context, arg store.CreateGuardianGrantParams) (store.GuardianGrant, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.failCreate != nil {
		return store.GuardianGrant{}, r.failCreate
	}
	r.nextID++
	row := store.GuardianGrant{
		ID: fmt.Sprintf("g%d", r.nextID), DeviceID: arg.DeviceID, StudentID: arg.StudentID, Mac: arg.Mac,
		Minutes: arg.Minutes, Source: arg.Source, AttemptID: arg.AttemptID, Reason: arg.Reason, WallRef: arg.WallRef,
		StartedAt: arg.StartedAt, ExpiresAt: arg.ExpiresAt,
	}
	r.rows = append(r.rows, row)
	return row, nil
}

func (r *memRepo) GetGuardianGrant(ctx context.Context, id string) (store.GuardianGrant, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, g := range r.rows {
		if g.ID == id {
			return g, nil
		}
	}
	return store.GuardianGrant{}, pgx.ErrNoRows
}

func (r *memRepo) active(now time.Time, keep func(store.GuardianGrant) bool) []store.GuardianGrant {
	out := []store.GuardianGrant{}
	for _, g := range r.rows {
		if !g.RevokedAt.Valid && g.ExpiresAt.After(now) && keep(g) {
			out = append(out, g)
		}
	}
	return out
}

func (r *memRepo) ListActiveGuardianGrants(ctx context.Context, now time.Time) ([]store.GuardianGrant, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := r.active(now, func(store.GuardianGrant) bool { return true })
	sort.SliceStable(out, func(i, j int) bool { return out[i].ExpiresAt.Before(out[j].ExpiresAt) })
	return out, nil
}

func (r *memRepo) ListActiveGuardianGrantsByStudent(ctx context.Context, arg store.ListActiveGuardianGrantsByStudentParams) ([]store.GuardianGrant, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := r.active(arg.Now, func(g store.GuardianGrant) bool { return g.StudentID == arg.StudentID })
	sort.SliceStable(out, func(i, j int) bool { return out[i].ExpiresAt.After(out[j].ExpiresAt) })
	return out, nil
}

func (r *memRepo) ListActiveGuardianGrantsByDevice(ctx context.Context, arg store.ListActiveGuardianGrantsByDeviceParams) ([]store.GuardianGrant, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := r.active(arg.Now, func(g store.GuardianGrant) bool { return g.DeviceID == arg.DeviceID })
	sort.SliceStable(out, func(i, j int) bool { return out[i].ExpiresAt.After(out[j].ExpiresAt) })
	return out, nil
}

func (r *memRepo) RevokeGuardianGrant(ctx context.Context, arg store.RevokeGuardianGrantParams) (store.GuardianGrant, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for i, g := range r.rows {
		if g.ID == arg.ID && !g.RevokedAt.Valid {
			r.rows[i].RevokedAt = arg.RevokedAt
			return r.rows[i], nil
		}
	}
	return store.GuardianGrant{}, pgx.ErrNoRows
}

func (r *memRepo) ExpireGuardianGrants(ctx context.Context, now time.Time) ([]store.GuardianGrant, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := []store.GuardianGrant{}
	for i, g := range r.rows {
		if !g.RevokedAt.Valid && !g.ExpiresAt.After(now) {
			r.rows[i].RevokedAt = ts(g.ExpiresAt)
			out = append(out, r.rows[i])
		}
	}
	return out, nil
}

// get is a test accessor.
func (r *memRepo) get(t *testing.T, id string) store.GuardianGrant {
	t.Helper()
	g, err := r.GetGuardianGrant(context.Background(), id)
	if err != nil {
		t.Fatalf("grant %s: %v", id, err)
	}
	return g
}

// harness bundles a manager with its fakes and a settable clock.
type harness struct {
	t    *testing.T
	repo *memRepo
	wall *fake.Wall
	m    *Manager
	now  time.Time
}

func newHarness(t *testing.T) *harness {
	h := &harness{t: t, repo: &memRepo{}, now: time.Date(2026, 8, 26, 10, 0, 0, 0, time.UTC)}
	h.wall = fake.New()
	h.wall.SetClock(func() time.Time { return h.now })
	h.m = newManager(h.repo, h.wall, Config{
		Tick:   time.Hour, // tests drive sweep/reconcile directly
		Now:    func() time.Time { return h.now },
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
	return h
}

func (h *harness) advance(d time.Duration) { h.now = h.now.Add(d) }

func (h *harness) wallActive() []wall.ActiveGrant {
	h.t.Helper()
	got, err := h.wall.ListActive(context.Background())
	if err != nil {
		h.t.Fatal(err)
	}
	return got
}

func device(id, mac string, gated bool) store.GuardianDevice {
	return store.GuardianDevice{ID: id, StudentID: "s1", Name: "dev " + id, Mac: mac, Gated: gated}
}

func TestGrantOpensWallAndPersists(t *testing.T) {
	ctx := context.Background()
	h := newHarness(t)

	row, err := h.m.Grant(ctx, Request{Device: device("d1", "AA-BB-CC-DD-EE-01", true), Minutes: 30, AttemptID: "att1"})
	if err != nil {
		t.Fatalf("Grant: %v", err)
	}
	if row.Mac != macA || row.Minutes != 30 || row.Source != string(SourceExam) || row.AttemptID == nil || *row.AttemptID != "att1" {
		t.Fatalf("row = %+v", row)
	}
	if !row.StartedAt.Equal(h.now) || !row.ExpiresAt.Equal(h.now.Add(30*time.Minute)) {
		t.Fatalf("times = %v → %v", row.StartedAt, row.ExpiresAt)
	}
	if row.WallRef == nil || *row.WallRef == "" {
		t.Fatal("wall ref must be stored")
	}
	active := h.wallActive()
	if len(active) != 1 || active[0].MAC != macA || active[0].Ref != *row.WallRef || !active[0].ExpiresAt.Equal(row.ExpiresAt) {
		t.Fatalf("wall = %+v", active)
	}

	// DB views.
	all, err := h.m.Active(ctx)
	if err != nil || len(all) != 1 || all[0].ID != row.ID {
		t.Fatalf("Active = %+v, %v", all, err)
	}
	mine, err := h.m.ActiveForStudent(ctx, "s1")
	if err != nil || len(mine) != 1 {
		t.Fatalf("ActiveForStudent = %+v, %v", mine, err)
	}
	none, err := h.m.ActiveForStudent(ctx, "s2")
	if err != nil || len(none) != 0 {
		t.Fatalf("ActiveForStudent(s2) = %+v, %v", none, err)
	}
}

func TestGrantRefusesUngatedAndBadInput(t *testing.T) {
	ctx := context.Background()
	h := newHarness(t)

	if _, err := h.m.Grant(ctx, Request{Device: device("d1", macA, false), Minutes: 30}); !errors.Is(err, ErrDeviceNotGated) {
		t.Fatalf("ungated = %v, want ErrDeviceNotGated", err)
	}
	if _, err := h.m.Grant(ctx, Request{Device: device("d1", macA, true), Minutes: 0}); err == nil {
		t.Fatal("zero minutes must fail")
	}
	if _, err := h.m.Grant(ctx, Request{Device: device("d1", "bad-mac", true), Minutes: 5}); err == nil {
		t.Fatal("invalid MAC must fail")
	}
	if len(h.repo.rows) != 0 || len(h.wallActive()) != 0 {
		t.Fatal("nothing must be written on validation failure")
	}
}

func TestGrantStacks(t *testing.T) {
	ctx := context.Background()
	h := newHarness(t)
	dev := device("d1", macA, true)

	first, err := h.m.Grant(ctx, Request{Device: dev, Minutes: 30, Source: SourceExam, AttemptID: "a1"})
	if err != nil {
		t.Fatal(err)
	}
	h.advance(10 * time.Minute) // 20 remaining
	second, err := h.m.Grant(ctx, Request{Device: dev, Minutes: 15, Source: SourceManual, Reason: "chores"})
	if err != nil {
		t.Fatal(err)
	}
	// 20 remaining + 15 = 35 from now, i.e. first.ExpiresAt + 15m.
	if want := first.ExpiresAt.Add(15 * time.Minute); !second.ExpiresAt.Equal(want) {
		t.Fatalf("stacked ExpiresAt = %v, want %v", second.ExpiresAt, want)
	}
	if second.Minutes != 15 || second.Source != string(SourceManual) || second.Reason == nil || *second.Reason != "chores" {
		t.Fatalf("second row = %+v", second)
	}
	// Exactly one open row per device: the first is revoked.
	if old := h.repo.get(t, first.ID); !old.RevokedAt.Valid || !old.RevokedAt.Time.Equal(h.now) {
		t.Fatalf("first row must be superseded: %+v", old)
	}
	active, _ := h.m.Active(ctx)
	if len(active) != 1 || active[0].ID != second.ID {
		t.Fatalf("Active = %+v", active)
	}
	// The wall carries the combined expiry and the new ref.
	w := h.wallActive()
	if len(w) != 1 || !w[0].ExpiresAt.Equal(second.ExpiresAt) || w[0].Ref != *second.WallRef {
		t.Fatalf("wall = %+v", w)
	}
	if w[0].Remaining(h.now) != 35*time.Minute {
		t.Fatalf("remaining = %v", w[0].Remaining(h.now))
	}
}

func TestGrantWallFailureWritesNothing(t *testing.T) {
	ctx := context.Background()
	h := newHarness(t)
	boom := errors.New("router unreachable")
	h.wall.SetErr(boom)

	_, err := h.m.Grant(ctx, Request{Device: device("d1", macA, true), Minutes: 30})
	if !errors.Is(err, boom) {
		t.Fatalf("err = %v, want wrapped wall error", err)
	}
	if len(h.repo.rows) != 0 {
		t.Fatalf("no row must be persisted when the wall fails: %+v", h.repo.rows)
	}
}

func TestGrantDBFailureRollsBackWall(t *testing.T) {
	ctx := context.Background()
	h := newHarness(t)
	dev := device("d1", macA, true)

	// No previous grant: the wall grant is revoked again.
	h.repo.failCreate = errors.New("db down")
	if _, err := h.m.Grant(ctx, Request{Device: dev, Minutes: 30}); err == nil || !strings.Contains(err.Error(), "db down") {
		t.Fatalf("err = %v", err)
	}
	if got := h.wallActive(); len(got) != 0 {
		t.Fatalf("wall must be rolled back: %+v", got)
	}

	// With a previous grant: the wall is restored to the previous expiry.
	h.repo.failCreate = nil
	first, err := h.m.Grant(ctx, Request{Device: dev, Minutes: 30})
	if err != nil {
		t.Fatal(err)
	}
	h.advance(5 * time.Minute)
	h.repo.failCreate = errors.New("db down")
	if _, err := h.m.Grant(ctx, Request{Device: dev, Minutes: 30}); err == nil {
		t.Fatal("expected failure")
	}
	got := h.wallActive()
	if len(got) != 1 || !got[0].ExpiresAt.Equal(first.ExpiresAt) {
		t.Fatalf("wall must be restored to the previous expiry %v: %+v", first.ExpiresAt, got)
	}
	if old := h.repo.get(t, first.ID); old.RevokedAt.Valid {
		t.Fatal("previous row must stay active when the new insert fails")
	}
}

func TestRevoke(t *testing.T) {
	ctx := context.Background()
	h := newHarness(t)

	if _, err := h.m.Revoke(ctx, "nope"); !errors.Is(err, ErrGrantNotFound) {
		t.Fatalf("Revoke unknown = %v", err)
	}
	row, err := h.m.Grant(ctx, Request{Device: device("d1", macA, true), Minutes: 30})
	if err != nil {
		t.Fatal(err)
	}
	h.advance(time.Minute)
	revoked, err := h.m.Revoke(ctx, row.ID)
	if err != nil {
		t.Fatalf("Revoke: %v", err)
	}
	if !revoked.RevokedAt.Valid || !revoked.RevokedAt.Time.Equal(h.now) {
		t.Fatalf("revoked = %+v", revoked)
	}
	if got := h.wallActive(); len(got) != 0 {
		t.Fatalf("wall still open: %+v", got)
	}
	if active, _ := h.m.Active(ctx); len(active) != 0 {
		t.Fatalf("Active = %+v", active)
	}
	// Idempotent: a second revoke returns the row unchanged, no wall error
	// (the fake would return ErrNotFound, which must be swallowed).
	h.advance(time.Minute)
	again, err := h.m.Revoke(ctx, row.ID)
	if err != nil {
		t.Fatalf("second Revoke: %v", err)
	}
	if !again.RevokedAt.Time.Equal(revoked.RevokedAt.Time) {
		t.Fatalf("second Revoke changed revoked_at: %v vs %v", again.RevokedAt.Time, revoked.RevokedAt.Time)
	}
}

func TestRevokeDevice(t *testing.T) {
	ctx := context.Background()
	h := newHarness(t)

	if _, err := h.m.Grant(ctx, Request{Device: device("d1", macA, true), Minutes: 30}); err != nil {
		t.Fatal(err)
	}
	if _, err := h.m.Grant(ctx, Request{Device: device("d2", macB, true), Minutes: 30}); err != nil {
		t.Fatal(err)
	}
	if err := h.m.RevokeDevice(ctx, "d1"); err != nil {
		t.Fatalf("RevokeDevice: %v", err)
	}
	active, _ := h.m.Active(ctx)
	if len(active) != 1 || active[0].DeviceID != "d2" {
		t.Fatalf("Active = %+v", active)
	}
	w := h.wallActive()
	if len(w) != 1 || w[0].MAC != macB {
		t.Fatalf("wall = %+v", w)
	}
	if err := h.m.RevokeDevice(ctx, "d1"); err != nil { // nothing left: fine
		t.Fatalf("second RevokeDevice: %v", err)
	}
	if err := h.m.RevokeDevice(ctx, "unknown"); err != nil {
		t.Fatalf("RevokeDevice unknown: %v", err)
	}
}

func TestSweepExpires(t *testing.T) {
	ctx := context.Background()
	h := newHarness(t)

	short, err := h.m.Grant(ctx, Request{Device: device("d1", macA, true), Minutes: 10})
	if err != nil {
		t.Fatal(err)
	}
	long, err := h.m.Grant(ctx, Request{Device: device("d2", macB, true), Minutes: 60})
	if err != nil {
		t.Fatal(err)
	}
	// Simulate a wall that did NOT enforce expiry itself (fake drops lazily,
	// so freeze its clock behind the manager's).
	frozen := h.now
	h.wall.SetClock(func() time.Time { return frozen })

	h.advance(5 * time.Minute)
	if err := h.m.sweep(ctx); err != nil {
		t.Fatal(err)
	}
	if active, _ := h.m.Active(ctx); len(active) != 2 {
		t.Fatalf("nothing should expire yet: %+v", active)
	}

	h.advance(5 * time.Minute) // exactly at short's expiry: expires_at <= now
	if err := h.m.sweep(ctx); err != nil {
		t.Fatal(err)
	}
	if got := h.repo.get(t, short.ID); !got.RevokedAt.Valid || !got.RevokedAt.Time.Equal(short.ExpiresAt) {
		t.Fatalf("short grant must be revoked at its expiry: %+v", got)
	}
	if got := h.repo.get(t, long.ID); got.RevokedAt.Valid {
		t.Fatalf("long grant must stay: %+v", got)
	}
	w := h.wallActive()
	if len(w) != 1 || w[0].MAC != macB {
		t.Fatalf("wall after sweep = %+v", w)
	}
	// Sweeping again is a no-op.
	if err := h.m.sweep(ctx); err != nil {
		t.Fatal(err)
	}
}

func TestReconcile(t *testing.T) {
	ctx := context.Background()
	h := newHarness(t)

	// DB has two active grants...
	a, err := h.m.Grant(ctx, Request{Device: device("d1", macA, true), Minutes: 30})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := h.m.Grant(ctx, Request{Device: device("d2", macB, true), Minutes: 45}); err != nil {
		t.Fatal(err)
	}
	// ...but the router rebooted: it lost A, and someone hand-added C.
	if err := h.wall.Revoke(ctx, macA); err != nil {
		t.Fatal(err)
	}
	if _, err := h.wall.Grant(ctx, "aa:bb:cc:dd:ee:03", time.Hour); err != nil {
		t.Fatal(err)
	}
	h.advance(10 * time.Minute)

	if err := h.m.reconcile(ctx); err != nil {
		t.Fatalf("reconcile: %v", err)
	}
	w := h.wallActive()
	if len(w) != 2 {
		t.Fatalf("wall after reconcile = %+v", w)
	}
	if w[0].MAC != macA || !w[0].ExpiresAt.Equal(a.ExpiresAt) {
		t.Fatalf("A must be re-opened with its DB expiry %v: %+v", a.ExpiresAt, w[0])
	}
	if w[1].MAC != macB {
		t.Fatalf("B must be untouched: %+v", w[1])
	}
	// Reconcile is idempotent.
	if err := h.m.reconcile(ctx); err != nil {
		t.Fatal(err)
	}
	if again := h.wallActive(); len(again) != 2 || again[0] != w[0] || again[1] != w[1] {
		t.Fatalf("second reconcile changed the wall: %+v", again)
	}
}

func TestReconcileExtendsShortWallGrant(t *testing.T) {
	ctx := context.Background()
	h := newHarness(t)

	a, err := h.m.Grant(ctx, Request{Device: device("d1", macA, true), Minutes: 60})
	if err != nil {
		t.Fatal(err)
	}
	// The wall somehow holds a much shorter grant for A.
	if _, err := h.wall.Grant(ctx, macA, 5*time.Minute); err != nil {
		t.Fatal(err)
	}
	if err := h.m.reconcile(ctx); err != nil {
		t.Fatal(err)
	}
	w := h.wallActive()
	if len(w) != 1 || !w[0].ExpiresAt.Equal(a.ExpiresAt) {
		t.Fatalf("wall must be extended to the DB expiry: %+v", w)
	}
}

func TestRunReconcilesSweepsAndStops(t *testing.T) {
	h := newHarness(t)
	h.m.cfg.Tick = 5 * time.Millisecond
	ctx, cancel := context.WithCancel(context.Background())

	row, err := h.m.Grant(ctx, Request{Device: device("d1", macA, true), Minutes: 10})
	if err != nil {
		t.Fatal(err)
	}
	if err := h.wall.Revoke(ctx, macA); err != nil { // wall lost it
		t.Fatal(err)
	}

	done := make(chan error, 1)
	go func() { done <- h.m.Run(ctx) }()

	// Reconcile re-opens the grant.
	waitFor(t, func() bool { return len(h.wallActive()) == 1 })

	// Then the clock passes the expiry and a tick sweeps it.
	h.m.mu.Lock()
	h.advance(11 * time.Minute)
	h.m.mu.Unlock()
	waitFor(t, func() bool {
		g, _ := h.repo.GetGuardianGrant(context.Background(), row.ID)
		return g.RevokedAt.Valid
	})

	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("Run = %v, want nil on cancel", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Run did not stop after cancel")
	}
}

func TestNewManagerDefaults(t *testing.T) {
	m := NewManager(nil, fake.New(), Config{})
	if m.cfg.Tick != defaultTick || m.cfg.Now == nil || m.cfg.Logger == nil {
		t.Fatalf("defaults not applied: %+v", m.cfg)
	}
}

func waitFor(t *testing.T, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(2 * time.Millisecond)
	}
	t.Fatal("condition not met in time")
}
