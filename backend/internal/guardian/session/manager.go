// Package session is the grant lifecycle (task 3-F06): persist grants, open
// them on the wall, count down, auto-revoke on expiry, and reconcile the wall
// with the DB on boot.
//
// The database is the source of truth for what a student has been granted;
// the wall is the enforcement point and may lose state (router reboot) or
// keep stale state (StudyRover crash). Manager keeps the two aligned:
// Grant/Revoke write both, Run's reconcile brings the wall back in line with
// the DB, and the periodic sweep closes rows whose time ran out.
package session

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/shafqat/studyrover/backend/internal/guardian/wall"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// Source mirrors contracts.GrantSource.
type Source string

const (
	SourceExam   Source = "exam"
	SourceManual Source = "manual"
)

// Errors callers can test for.
var (
	// ErrDeviceNotGated: Grant refuses devices that are not gated — the wall
	// would let them through anyway, and a grant row would be a lie.
	ErrDeviceNotGated = errors.New("session: device is not gated")
	// ErrGrantNotFound: no grant row with that id.
	ErrGrantNotFound = errors.New("session: grant not found")
)

const defaultTick = 15 * time.Second

// reconcileSlack is how far the wall's expiry may lag the DB's before
// reconcile re-opens the grant with the DB's remaining time.
const reconcileSlack = time.Minute

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

func (c Config) withDefaults() Config {
	if c.Tick <= 0 {
		c.Tick = defaultTick
	}
	if c.Now == nil {
		c.Now = time.Now
	}
	if c.Logger == nil {
		c.Logger = slog.Default()
	}
	return c
}

// repo is the slice of store.Store the manager uses. Narrow so tests can run
// against an in-memory fake (store.Store satisfies it via Querier).
type repo interface {
	CreateGuardianGrant(ctx context.Context, arg store.CreateGuardianGrantParams) (store.GuardianGrant, error)
	GetGuardianGrant(ctx context.Context, id string) (store.GuardianGrant, error)
	ListActiveGuardianGrants(ctx context.Context, now time.Time) ([]store.GuardianGrant, error)
	ListActiveGuardianGrantsByStudent(ctx context.Context, arg store.ListActiveGuardianGrantsByStudentParams) ([]store.GuardianGrant, error)
	ListActiveGuardianGrantsByDevice(ctx context.Context, arg store.ListActiveGuardianGrantsByDeviceParams) ([]store.GuardianGrant, error)
	RevokeGuardianGrant(ctx context.Context, arg store.RevokeGuardianGrantParams) (store.GuardianGrant, error)
	ExpireGuardianGrants(ctx context.Context, now time.Time) ([]store.GuardianGrant, error)
}

// Manager owns grants. Safe for concurrent use.
type Manager struct {
	db   repo
	wall wall.Wall
	cfg  Config
	// mu serialises the read-modify-write in Grant/Revoke so two concurrent
	// grants for one device stack instead of racing to "the" active row.
	mu sync.Mutex
}

// NewManager wires the store and wall.
func NewManager(db store.Store, w wall.Wall, cfg Config) *Manager {
	return newManager(db, w, cfg)
}

// newManager is the interface-typed constructor tests use with fakes.
func newManager(db repo, w wall.Wall, cfg Config) *Manager {
	return &Manager{db: db, wall: w, cfg: cfg.withDefaults()}
}

// Run reconciles on start (reload active grants from the DB, re-open any the
// wall lost, revoke any the wall has that the DB doesn't) and then sweeps
// expired grants every Tick until ctx is cancelled. Blocks.
func (m *Manager) Run(ctx context.Context) error {
	log := m.cfg.Logger
	log.Info("guardian session: starting", "wall", m.wall.Kind(), "tick", m.cfg.Tick)
	if err := m.reconcile(ctx); err != nil {
		if ctx.Err() != nil {
			return nil
		}
		log.Error("guardian session: reconcile failed", "err", err)
	}
	ticker := time.NewTicker(m.cfg.Tick)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			log.Info("guardian session: stopped")
			return nil
		case <-ticker.C:
			if err := m.sweep(ctx); err != nil && ctx.Err() == nil {
				log.Error("guardian session: sweep failed", "err", err)
			}
		}
	}
}

// Grant persists a grant, opens it on the wall, and returns the row. When the
// device already has an active grant, the new minutes are ADDED to the
// remaining time (one open grant per device; the previous row is revoked and
// a new one created with the combined expiry).
//
// Order of operations: the wall is opened first so its ref can be stored on
// the row in a single insert (there is no "set wall_ref" query). If the wall
// refuses, nothing is written. If the insert then fails, the wall grant is
// rolled back to what it was (revoked, or re-opened with the previous
// remaining time).
func (m *Manager) Grant(ctx context.Context, req Request) (store.GuardianGrant, error) {
	if !req.Device.Gated {
		return store.GuardianGrant{}, ErrDeviceNotGated
	}
	if req.Minutes <= 0 {
		return store.GuardianGrant{}, fmt.Errorf("session: minutes must be positive, got %d", req.Minutes)
	}
	if req.Device.ID == "" || req.Device.StudentID == "" {
		return store.GuardianGrant{}, errors.New("session: device id and student id are required")
	}
	mac, err := wall.NormalizeMAC(req.Device.Mac)
	if err != nil {
		return store.GuardianGrant{}, fmt.Errorf("session: device %s: %w", req.Device.ID, err)
	}
	source := req.Source
	if source == "" {
		if req.AttemptID != "" {
			source = SourceExam
		} else {
			source = SourceManual
		}
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	now := m.cfg.Now()
	existing, err := m.db.ListActiveGuardianGrantsByDevice(ctx, store.ListActiveGuardianGrantsByDeviceParams{DeviceID: req.Device.ID, Now: now})
	if err != nil {
		return store.GuardianGrant{}, fmt.Errorf("session: list active grants for device %s: %w", req.Device.ID, err)
	}
	add := time.Duration(req.Minutes) * time.Minute
	expires := now.Add(add)
	if len(existing) > 0 {
		// Rows come longest-remaining first; stack on top of that one.
		expires = existing[0].ExpiresAt.Add(add)
	}

	ref, err := m.wall.Grant(ctx, mac, expires.Sub(now))
	if err != nil {
		return store.GuardianGrant{}, fmt.Errorf("session: wall grant for %s: %w", mac, err)
	}

	row, err := m.db.CreateGuardianGrant(ctx, store.CreateGuardianGrantParams{
		DeviceID:  req.Device.ID,
		StudentID: req.Device.StudentID,
		Mac:       mac,
		Minutes:   int32(req.Minutes),
		Source:    string(source),
		AttemptID: optional(req.AttemptID),
		Reason:    optional(req.Reason),
		WallRef:   optional(ref),
		StartedAt: now,
		ExpiresAt: expires,
	})
	if err != nil {
		m.rollbackWall(ctx, mac, existing, now)
		return store.GuardianGrant{}, fmt.Errorf("session: persist grant for %s: %w", mac, err)
	}

	// The previous row(s) are superseded by the combined one.
	for _, old := range existing {
		if _, err := m.db.RevokeGuardianGrant(ctx, store.RevokeGuardianGrantParams{RevokedAt: ts(now), ID: old.ID}); err != nil && !errors.Is(err, pgx.ErrNoRows) {
			m.cfg.Logger.Error("guardian session: supersede old grant", "grant", old.ID, "err", err)
		}
	}
	m.cfg.Logger.Info("guardian session: granted", "grant", row.ID, "device", req.Device.ID, "mac", mac,
		"minutes", req.Minutes, "source", source, "expiresAt", expires, "stacked", len(existing) > 0)
	return row, nil
}

// rollbackWall undoes a wall.Grant whose DB insert failed: re-open the
// previous grant with its remaining time, or revoke when there was none.
func (m *Manager) rollbackWall(ctx context.Context, mac string, previous []store.GuardianGrant, now time.Time) {
	var err error
	if len(previous) > 0 {
		_, err = m.wall.Grant(ctx, mac, previous[0].ExpiresAt.Sub(now))
	} else if err = m.wall.Revoke(ctx, mac); errors.Is(err, wall.ErrNotFound) {
		err = nil
	}
	if err != nil {
		m.cfg.Logger.Error("guardian session: wall rollback failed; reconcile will fix it", "mac", mac, "err", err)
	}
}

// Revoke closes a grant now (DB + wall). Idempotent on already-closed grants.
func (m *Manager) Revoke(ctx context.Context, grantID string) (store.GuardianGrant, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	row, err := m.db.GetGuardianGrant(ctx, grantID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return store.GuardianGrant{}, fmt.Errorf("%w: %s", ErrGrantNotFound, grantID)
		}
		return store.GuardianGrant{}, fmt.Errorf("session: load grant %s: %w", grantID, err)
	}
	if row.RevokedAt.Valid {
		return row, nil
	}
	now := m.cfg.Now()
	revoked, err := m.db.RevokeGuardianGrant(ctx, store.RevokeGuardianGrantParams{RevokedAt: ts(now), ID: grantID})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Lost a race with the sweep or another revoke; the row is closed.
			return m.db.GetGuardianGrant(ctx, grantID)
		}
		return store.GuardianGrant{}, fmt.Errorf("session: revoke grant %s: %w", grantID, err)
	}
	if err := m.closeWall(ctx, revoked.Mac); err != nil {
		return revoked, fmt.Errorf("session: wall revoke for %s: %w", revoked.Mac, err)
	}
	m.cfg.Logger.Info("guardian session: revoked", "grant", grantID, "mac", revoked.Mac)
	return revoked, nil
}

// RevokeDevice closes every active grant for a device (used on device delete).
func (m *Manager) RevokeDevice(ctx context.Context, deviceID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := m.cfg.Now()
	active, err := m.db.ListActiveGuardianGrantsByDevice(ctx, store.ListActiveGuardianGrantsByDeviceParams{DeviceID: deviceID, Now: now})
	if err != nil {
		return fmt.Errorf("session: list active grants for device %s: %w", deviceID, err)
	}
	macs := map[string]bool{}
	for _, g := range active {
		if _, err := m.db.RevokeGuardianGrant(ctx, store.RevokeGuardianGrantParams{RevokedAt: ts(now), ID: g.ID}); err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("session: revoke grant %s: %w", g.ID, err)
		}
		macs[g.Mac] = true
	}
	var firstErr error
	for mac := range macs {
		if err := m.closeWall(ctx, mac); err != nil && firstErr == nil {
			firstErr = fmt.Errorf("session: wall revoke for %s: %w", mac, err)
		}
	}
	if len(active) > 0 {
		m.cfg.Logger.Info("guardian session: revoked device", "device", deviceID, "grants", len(active))
	}
	return firstErr
}

// Active lists grants that are open right now (DB view).
func (m *Manager) Active(ctx context.Context) ([]store.GuardianGrant, error) {
	return m.db.ListActiveGuardianGrants(ctx, m.cfg.Now())
}

// ActiveForStudent lists the student's open grants, longest remaining first.
func (m *Manager) ActiveForStudent(ctx context.Context, studentID string) ([]store.GuardianGrant, error) {
	return m.db.ListActiveGuardianGrantsByStudent(ctx, store.ListActiveGuardianGrantsByStudentParams{StudentID: studentID, Now: m.cfg.Now()})
}

// reconcile makes the wall match the DB: every DB-active grant is open on the
// wall with (at least) its remaining time, and nothing else is.
func (m *Manager) reconcile(ctx context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	log := m.cfg.Logger
	now := m.cfg.Now()
	active, err := m.db.ListActiveGuardianGrants(ctx, now)
	if err != nil {
		return fmt.Errorf("list active grants: %w", err)
	}
	onWall, err := m.wall.ListActive(ctx)
	if err != nil {
		return fmt.Errorf("list wall grants: %w", err)
	}
	wallByMAC := make(map[string]wall.ActiveGrant, len(onWall))
	for _, g := range onWall {
		wallByMAC[g.MAC] = g
	}
	dbByMAC := make(map[string]store.GuardianGrant, len(active))
	for _, g := range active {
		// One open grant per device, but a MAC could in theory be registered
		// twice; keep the longest so the wall never cuts a grant short.
		if cur, ok := dbByMAC[g.Mac]; !ok || g.ExpiresAt.After(cur.ExpiresAt) {
			dbByMAC[g.Mac] = g
		}
	}

	reopened, closed := 0, 0
	for mac, g := range dbByMAC {
		w, ok := wallByMAC[mac]
		if ok && !w.ExpiresAt.Before(g.ExpiresAt.Add(-reconcileSlack)) {
			continue
		}
		if _, err := m.wall.Grant(ctx, mac, g.ExpiresAt.Sub(now)); err != nil {
			log.Error("guardian session: reconcile re-open failed", "grant", g.ID, "mac", mac, "err", err)
			continue
		}
		reopened++
	}
	for mac := range wallByMAC {
		if _, ok := dbByMAC[mac]; ok {
			continue
		}
		if err := m.closeWall(ctx, mac); err != nil {
			log.Error("guardian session: reconcile revoke failed", "mac", mac, "err", err)
			continue
		}
		closed++
	}
	log.Info("guardian session: reconciled", "dbActive", len(active), "wallActive", len(onWall), "reopened", reopened, "closed", closed)
	return nil
}

// sweep marks grants whose time ran out as revoked and closes them on the
// wall (a no-op there when the wall already enforced the expiry itself).
func (m *Manager) sweep(ctx context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := m.cfg.Now()
	expired, err := m.db.ExpireGuardianGrants(ctx, now)
	if err != nil {
		return fmt.Errorf("expire grants: %w", err)
	}
	for _, g := range expired {
		if err := m.closeWall(ctx, g.Mac); err != nil {
			m.cfg.Logger.Error("guardian session: wall revoke on expiry failed", "grant", g.ID, "mac", g.Mac, "err", err)
			continue
		}
		m.cfg.Logger.Info("guardian session: expired", "grant", g.ID, "mac", g.Mac)
	}
	return nil
}

// closeWall revokes mac on the wall, treating "nothing to revoke" as success.
func (m *Manager) closeWall(ctx context.Context, mac string) error {
	if err := m.wall.Revoke(ctx, mac); err != nil && !errors.Is(err, wall.ErrNotFound) {
		return err
	}
	return nil
}

// optional maps "" to NULL for the nullable text columns.
func optional(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// ts wraps a time for the nullable revoked_at column.
func ts(t time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: t, Valid: true}
}
