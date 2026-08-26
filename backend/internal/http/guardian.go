// Guardian (Phase 3) shared handler dependencies and store→contract mappers.
// The 14 /guardian endpoints live in guardian_*.go, one file per concern.
package http

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/core"
	"github.com/shafqat/studyrover/backend/internal/guardian/ingest"
	"github.com/shafqat/studyrover/backend/internal/guardian/session"
	"github.com/shafqat/studyrover/backend/internal/guardian/wall"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// GuardianSessions is the slice of *session.Manager the handlers use, held as
// an interface so handler tests can substitute a fake.
type GuardianSessions interface {
	Grant(ctx context.Context, req session.Request) (store.GuardianGrant, error)
	Revoke(ctx context.Context, grantID string) (store.GuardianGrant, error)
	RevokeDevice(ctx context.Context, deviceID string) error
	Active(ctx context.Context) ([]store.GuardianGrant, error)
	ActiveForStudent(ctx context.Context, studentID string) ([]store.GuardianGrant, error)
}

// GuardianDeps is everything the /guardian handlers need beyond the store.
// Wired in internal/app only when config.GuardianEnabled.
type GuardianDeps struct {
	Wall       wall.Wall
	Sessions   GuardianSessions
	Subscriber *ingest.Subscriber
	// Now overrides the clock (tests). Nil = time.Now.
	Now func() time.Time
}

func (d *GuardianDeps) now() time.Time {
	if d != nil && d.Now != nil {
		return d.Now()
	}
	return time.Now()
}

// wallPingTimeout bounds the health probe in GET /guardian/status.
const wallPingTimeout = 3 * time.Second

// guardianDisabledDetail is the 409 detail for mutating/listing endpoints when
// the Guardian is not wired.
const guardianDisabledDetail = "Guardian is not enabled on this server (set GUARDIAN_ENABLED=true)"

// requireGuardian writes a 409 Problem and returns false when the Guardian is
// not wired into this server.
func (h *Handlers) requireGuardian(w http.ResponseWriter) bool {
	if h.Guardian == nil {
		conflict(w, guardianDisabledDetail)
		return false
	}
	return true
}

// requireGuardianParent enforces parent auth then the enabled check (in that
// order, so an anonymous caller learns nothing about the server's features).
func (h *Handlers) requireGuardianParent(w http.ResponseWriter, r *http.Request) (auth.Identity, bool) {
	id, ok := auth.ParentFromCtx(r.Context())
	if !ok {
		unauthorized(w)
		return auth.Identity{}, false
	}
	if !h.requireGuardian(w) {
		return auth.Identity{}, false
	}
	return id, true
}

// wallError reports a Network Wall failure as 502 Bad Gateway: the request was
// valid but the upstream device (router / fake wall) refused it. The parent
// needs to see the wall's message.
func wallError(w http.ResponseWriter, op string, err error) {
	writeProblem(w, http.StatusBadGateway, contracts.INTERNAL, "Network wall error", op+": "+err.Error())
}

func isNoRows(err error) bool { return errors.Is(err, pgx.ErrNoRows) }

// --- policy -----------------------------------------------------------------

// effectiveGuardianPolicy merges the settings singleton (rate, cap, pass bar,
// cooldown, ramp — resolved through the L10 defaults), the guardian_policy row
// (enabled, style, diminishing returns) and the wall kind into the contract
// view. It also returns the raw store rows for callers that need them.
func (h *Handlers) effectiveGuardianPolicy(ctx context.Context) (contracts.GuardianPolicy, store.GuardianPolicy, error) {
	settings, err := h.resolvedSettings(ctx)
	if err != nil {
		return contracts.GuardianPolicy{}, store.GuardianPolicy{}, err
	}
	gp, err := h.Store.GetGuardianPolicy(ctx)
	if err != nil {
		if !isNoRows(err) {
			return contracts.GuardianPolicy{}, store.GuardianPolicy{}, err
		}
		// Migration 0027 seeds the singleton; a missing row reads as defaults.
		gp = store.GuardianPolicy{ID: "default", Enabled: true, RewardStyle: string(contracts.Flat), DiminishingReturns: true}
	}
	style := contracts.RewardStyle(gp.RewardStyle)
	if !style.Valid() {
		style = contracts.Flat
	}
	kind := contracts.Fake
	if h.Guardian != nil && h.Guardian.Wall != nil {
		kind = contracts.WallKind(h.Guardian.Wall.Kind())
	}
	return contracts.GuardianPolicy{
		Enabled:            gp.Enabled,
		RateMinPerQ:        settings.RewardRateMinPerQ,
		DailyCapHours:      settings.DailyCapHours,
		PassBar:            settings.DefaultPassBar,
		CooldownMin:        settings.DefaultCooldownMin,
		DifficultyRamp:     settings.DifficultyRamp,
		RewardStyle:        style,
		DiminishingReturns: gp.DiminishingReturns,
		UpdatedAt:          gp.UpdatedAt,
		Wall:               kind,
	}, gp, nil
}

// resolvedSettings is the settings singleton with the spec defaults applied
// (same view GET /settings returns).
func (h *Handlers) resolvedSettings(ctx context.Context) (contracts.Settings, error) {
	row, err := h.Store.GetSettings(ctx)
	if err != nil {
		if isNoRows(err) {
			return core.ResolveSettings(nil), nil
		}
		return contracts.Settings{}, err
	}
	stored := toContractSettings(row)
	return core.ResolveSettings(&stored), nil
}

// --- lookups ------------------------------------------------------------------

// guardianDeviceNames returns id → friendly name for every registered device
// (grants carry deviceName on the wire).
func (h *Handlers) guardianDeviceNames(ctx context.Context) (map[string]string, error) {
	devices, err := h.Store.ListGuardianDevices(ctx)
	if err != nil {
		return nil, err
	}
	names := make(map[string]string, len(devices))
	for _, d := range devices {
		names[d.ID] = d.Name
	}
	return names, nil
}

// guardianToday is the server-local calendar day as the store keys it, plus
// its YYYY-MM-DD key for comparing scanned rows.
func (h *Handlers) guardianToday() (pgtype.Date, string) {
	d := ingest.DayOf(h.Guardian.now())
	return d, dayKey(d)
}

func dayKey(d pgtype.Date) string { return d.Time.Format("2006-01-02") }

// --- mappers --------------------------------------------------------------------

func toContractGuardianDevice(d store.GuardianDevice) contracts.GuardianDevice {
	return contracts.GuardianDevice{
		Id:        d.ID,
		StudentId: d.StudentID,
		Name:      d.Name,
		Mac:       d.Mac,
		Ip:        d.Ip,
		Hostname:  d.Hostname,
		Gated:     d.Gated,
		CreatedAt: d.CreatedAt,
	}
}

func toContractGuardianDevices(rows []store.GuardianDevice) []contracts.GuardianDevice {
	out := make([]contracts.GuardianDevice, 0, len(rows))
	for _, d := range rows {
		out = append(out, toContractGuardianDevice(d))
	}
	return out
}

// toContractGuardianGrant maps a grant row; remainingSeconds is computed from
// expiresAt at now and is 0 once revoked or expired.
func toContractGuardianGrant(g store.GuardianGrant, deviceName string, now time.Time) contracts.GuardianGrant {
	out := contracts.GuardianGrant{
		Id:         g.ID,
		DeviceId:   g.DeviceID,
		DeviceName: deviceName,
		StudentId:  g.StudentID,
		Mac:        g.Mac,
		Minutes:    int(g.Minutes),
		Source:     contracts.GrantSource(g.Source),
		AttemptId:  g.AttemptID,
		Reason:     g.Reason,
		StartedAt:  g.StartedAt,
		ExpiresAt:  g.ExpiresAt,
	}
	if g.RevokedAt.Valid {
		t := g.RevokedAt.Time
		out.RevokedAt = &t
	} else if rem := g.ExpiresAt.Sub(now); rem > 0 {
		out.RemainingSeconds = int(rem / time.Second)
	}
	return out
}

func toContractGuardianGrants(rows []store.GuardianGrant, names map[string]string, now time.Time) []contracts.GuardianGrant {
	out := make([]contracts.GuardianGrant, 0, len(rows))
	for _, g := range rows {
		out = append(out, toContractGuardianGrant(g, names[g.DeviceID], now))
	}
	return out
}

func toContractOverrideLog(o store.GuardianOverrideLog) contracts.GuardianOverrideLog {
	return contracts.GuardianOverrideLog{
		Id:         o.ID,
		DeviceId:   o.DeviceID,
		DeviceName: o.DeviceName,
		Minutes:    int(o.Minutes),
		Reason:     o.Reason,
		Who:        o.Who,
		At:         o.At,
	}
}

func toContractDailyUsage(u store.GuardianDailyUsage, capMinutes int) contracts.GuardianDailyUsage {
	return contracts.GuardianDailyUsage{
		StudentId:  u.StudentID,
		Day:        openapi_types.Date{Time: u.Day.Time},
		Minutes:    int(u.Minutes),
		Passes:     int(u.Passes),
		CapMinutes: capMinutes,
	}
}
