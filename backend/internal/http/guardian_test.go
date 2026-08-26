package http

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sort"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/guardian/ingest"
	"github.com/shafqat/studyrover/backend/internal/guardian/session"
	"github.com/shafqat/studyrover/backend/internal/guardian/wall"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// --- fakes -------------------------------------------------------------------

// fakeStore implements just the store.Store slice the guardian handlers use.
// The embedded nil interface makes any other call panic loudly.
type fakeStore struct {
	store.Store
	mu        sync.Mutex
	student   *store.Student
	devices   map[string]store.GuardianDevice
	settings  *store.Setting
	policy    store.GuardianPolicy
	grants    map[string]store.GuardianGrant
	overrides []store.GuardianOverrideLog
	usage     []store.GuardianDailyUsage
	seq       int
}

func newFakeStore() *fakeStore {
	return &fakeStore{
		student:  &store.Student{ID: "stu-1", Name: "Maya"},
		devices:  map[string]store.GuardianDevice{},
		settings: &store.Setting{ID: "singleton", RewardRateMinPerQ: 3, DailyCapHours: 3, DefaultExamSize: 20, DefaultPassBar: 70, DefaultCooldownMin: 10, KnowledgeBackend: "notebooklm"},
		policy:   store.GuardianPolicy{ID: "default", Enabled: true, RewardStyle: "flat", DiminishingReturns: true, UpdatedAt: testNow},
		grants:   map[string]store.GuardianGrant{},
	}
}

func (f *fakeStore) nextID(prefix string) string {
	f.seq++
	return fmt.Sprintf("%s-%d", prefix, f.seq)
}

func (f *fakeStore) GetStudent(context.Context) (store.Student, error) {
	if f.student == nil {
		return store.Student{}, pgx.ErrNoRows
	}
	return *f.student, nil
}

func (f *fakeStore) GetStudentByID(_ context.Context, id string) (store.Student, error) {
	if f.student != nil && f.student.ID == id {
		return *f.student, nil
	}
	return store.Student{}, pgx.ErrNoRows
}

func (f *fakeStore) sortedDevices() []store.GuardianDevice {
	out := make([]store.GuardianDevice, 0, len(f.devices))
	for _, d := range f.devices {
		out = append(out, d)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

func (f *fakeStore) ListGuardianDevices(context.Context) ([]store.GuardianDevice, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.sortedDevices(), nil
}

func (f *fakeStore) GetGuardianDevice(_ context.Context, id string) (store.GuardianDevice, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if d, ok := f.devices[id]; ok {
		return d, nil
	}
	return store.GuardianDevice{}, pgx.ErrNoRows
}

func (f *fakeStore) GetGuardianDeviceByMAC(_ context.Context, mac string) (store.GuardianDevice, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, d := range f.devices {
		if d.Mac == mac {
			return d, nil
		}
	}
	return store.GuardianDevice{}, pgx.ErrNoRows
}

func (f *fakeStore) CreateGuardianDevice(_ context.Context, arg store.CreateGuardianDeviceParams) (store.GuardianDevice, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	d := store.GuardianDevice{ID: f.nextID("dev"), StudentID: arg.StudentID, Name: arg.Name, Mac: arg.Mac, Ip: arg.Ip, Hostname: arg.Hostname, Gated: arg.Gated, CreatedAt: testNow}
	f.devices[d.ID] = d
	return d, nil
}

func (f *fakeStore) UpdateGuardianDevice(_ context.Context, arg store.UpdateGuardianDeviceParams) (store.GuardianDevice, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	d, ok := f.devices[arg.ID]
	if !ok {
		return store.GuardianDevice{}, pgx.ErrNoRows
	}
	if arg.Name != nil {
		d.Name = *arg.Name
	}
	if arg.Mac != nil {
		d.Mac = *arg.Mac
	}
	if arg.Ip != nil {
		d.Ip = arg.Ip
	}
	if arg.Hostname != nil {
		d.Hostname = arg.Hostname
	}
	if arg.Gated != nil {
		d.Gated = *arg.Gated
	}
	f.devices[arg.ID] = d
	return d, nil
}

func (f *fakeStore) DeleteGuardianDevice(_ context.Context, id string) (int64, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if _, ok := f.devices[id]; !ok {
		return 0, nil
	}
	delete(f.devices, id)
	return 1, nil
}

func (f *fakeStore) GetSettings(context.Context) (store.Setting, error) {
	if f.settings == nil {
		return store.Setting{}, pgx.ErrNoRows
	}
	return *f.settings, nil
}

func (f *fakeStore) UpsertSettings(_ context.Context, arg store.UpsertSettingsParams) (store.Setting, error) {
	if f.settings == nil {
		f.settings = &store.Setting{ID: "singleton", RewardRateMinPerQ: 3, DailyCapHours: 3, DefaultExamSize: 20, DefaultPassBar: 70, DefaultCooldownMin: 10, KnowledgeBackend: "notebooklm"}
	}
	if v, ok := arg.RewardRateMinPerQ.(int32); ok {
		f.settings.RewardRateMinPerQ = v
	}
	if v, ok := arg.DailyCapHours.(int32); ok {
		f.settings.DailyCapHours = v
	}
	// Any other non-nil param would be a bug in the partial upsert.
	if arg.DefaultExamSize != nil || arg.DefaultPassBar != nil || arg.DefaultCooldownMin != nil || arg.KnowledgeBackend != nil || arg.DifficultyRamp != nil {
		return store.Setting{}, errors.New("unexpected settings field written by guardian policy")
	}
	return *f.settings, nil
}

func (f *fakeStore) GetGuardianPolicy(context.Context) (store.GuardianPolicy, error) {
	return f.policy, nil
}

func (f *fakeStore) UpdateGuardianPolicy(_ context.Context, arg store.UpdateGuardianPolicyParams) (store.GuardianPolicy, error) {
	if arg.Enabled != nil {
		f.policy.Enabled = *arg.Enabled
	}
	if arg.RewardStyle != nil {
		f.policy.RewardStyle = *arg.RewardStyle
	}
	if arg.DiminishingReturns != nil {
		f.policy.DiminishingReturns = *arg.DiminishingReturns
	}
	f.policy.UpdatedAt = testNow.Add(time.Minute)
	return f.policy, nil
}

func (f *fakeStore) GetGuardianGrant(_ context.Context, id string) (store.GuardianGrant, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if g, ok := f.grants[id]; ok {
		return g, nil
	}
	return store.GuardianGrant{}, pgx.ErrNoRows
}

func (f *fakeStore) recentGrants(student string, limit int32) []store.GuardianGrant {
	out := []store.GuardianGrant{}
	for _, g := range f.grants {
		if student == "" || g.StudentID == student {
			out = append(out, g)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].StartedAt.After(out[j].StartedAt) })
	if len(out) > int(limit) {
		out = out[:limit]
	}
	return out
}

func (f *fakeStore) ListRecentGuardianGrants(_ context.Context, limit int32) ([]store.GuardianGrant, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.recentGrants("", limit), nil
}

func (f *fakeStore) ListRecentGuardianGrantsByStudent(_ context.Context, arg store.ListRecentGuardianGrantsByStudentParams) ([]store.GuardianGrant, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.recentGrants(arg.StudentID, arg.Limit), nil
}

func (f *fakeStore) InsertGuardianOverride(_ context.Context, arg store.InsertGuardianOverrideParams) (store.GuardianOverrideLog, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	o := store.GuardianOverrideLog{ID: f.nextID("ovr"), DeviceID: arg.DeviceID, DeviceName: arg.DeviceName, Minutes: arg.Minutes, Reason: arg.Reason, Who: arg.Who, At: testNow}
	f.overrides = append(f.overrides, o)
	return o, nil
}

func (f *fakeStore) ListGuardianOverrides(_ context.Context, limit int32) ([]store.GuardianOverrideLog, error) {
	out := append([]store.GuardianOverrideLog{}, f.overrides...)
	sort.Slice(out, func(i, j int) bool { return out[i].ID > out[j].ID })
	if len(out) > int(limit) {
		out = out[:limit]
	}
	return out, nil
}

func (f *fakeStore) ListGuardianDailyUsageSince(_ context.Context, day pgtype.Date) ([]store.GuardianDailyUsage, error) {
	out := []store.GuardianDailyUsage{}
	for _, u := range f.usage {
		if !u.Day.Time.Before(day.Time) {
			out = append(out, u)
		}
	}
	return out, nil
}

func (f *fakeStore) GetGuardianDailyUsage(_ context.Context, arg store.GetGuardianDailyUsageParams) (store.GuardianDailyUsage, error) {
	for _, u := range f.usage {
		if u.StudentID == arg.StudentID && dayKey(u.Day) == dayKey(arg.Day) {
			return u, nil
		}
	}
	return store.GuardianDailyUsage{}, pgx.ErrNoRows
}

// fakeSessions is a GuardianSessions backed by the fake store's grant map.
type fakeSessions struct {
	st       *fakeStore
	grantErr error
	revoked  []string // device ids passed to RevokeDevice
}

func (s *fakeSessions) Grant(_ context.Context, req session.Request) (store.GuardianGrant, error) {
	if s.grantErr != nil {
		return store.GuardianGrant{}, s.grantErr
	}
	s.st.mu.Lock()
	defer s.st.mu.Unlock()
	g := store.GuardianGrant{
		ID: s.st.nextID("grant"), DeviceID: req.Device.ID, StudentID: req.Device.StudentID, Mac: req.Device.Mac,
		Minutes: int32(req.Minutes), Source: string(req.Source), StartedAt: testNow, ExpiresAt: testNow.Add(time.Duration(req.Minutes) * time.Minute),
	}
	if req.AttemptID != "" {
		a := req.AttemptID
		g.AttemptID = &a
	}
	if req.Reason != "" {
		r := req.Reason
		g.Reason = &r
	}
	s.st.grants[g.ID] = g
	return g, nil
}

func (s *fakeSessions) Revoke(_ context.Context, id string) (store.GuardianGrant, error) {
	s.st.mu.Lock()
	defer s.st.mu.Unlock()
	g, ok := s.st.grants[id]
	if !ok {
		return store.GuardianGrant{}, pgx.ErrNoRows
	}
	if !g.RevokedAt.Valid {
		g.RevokedAt = pgtype.Timestamptz{Time: testNow, Valid: true}
		s.st.grants[id] = g
	}
	return g, nil
}

func (s *fakeSessions) RevokeDevice(_ context.Context, deviceID string) error {
	s.revoked = append(s.revoked, deviceID)
	return nil
}

func (s *fakeSessions) active(student string) []store.GuardianGrant {
	s.st.mu.Lock()
	defer s.st.mu.Unlock()
	out := []store.GuardianGrant{}
	for _, g := range s.st.grants {
		if g.RevokedAt.Valid || !g.ExpiresAt.After(testNow) {
			continue
		}
		if student == "" || g.StudentID == student {
			out = append(out, g)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ExpiresAt.After(out[j].ExpiresAt) })
	return out
}

func (s *fakeSessions) Active(context.Context) ([]store.GuardianGrant, error) {
	return s.active(""), nil
}
func (s *fakeSessions) ActiveForStudent(_ context.Context, id string) ([]store.GuardianGrant, error) {
	return s.active(id), nil
}

// fakeWall records Gate calls and serves canned Discover/Ping results.
type fakeWall struct {
	gates    []string // "mac=true"/"mac=false" in call order
	discover []wall.DiscoveredDevice
	pingErr  error
	gateErr  error
}

func (w *fakeWall) Kind() wall.Kind { return wall.KindFake }
func (w *fakeWall) Grant(context.Context, string, time.Duration) (string, error) {
	return "", nil
}
func (w *fakeWall) Revoke(context.Context, string) error                   { return nil }
func (w *fakeWall) ListActive(context.Context) ([]wall.ActiveGrant, error) { return nil, nil }
func (w *fakeWall) Discover(context.Context) ([]wall.DiscoveredDevice, error) {
	return w.discover, nil
}
func (w *fakeWall) Ping(context.Context) error { return w.pingErr }
func (w *fakeWall) Gate(_ context.Context, mac string, gated bool) error {
	if w.gateErr != nil {
		return w.gateErr
	}
	w.gates = append(w.gates, fmt.Sprintf("%s=%v", mac, gated))
	return nil
}

// --- harness -------------------------------------------------------------------

var testNow = time.Date(2026, 8, 26, 10, 30, 0, 0, time.Local)

type env struct {
	st  *fakeStore
	wl  *fakeWall
	ss  *fakeSessions
	h   *Handlers
	srv http.Handler
}

func newEnv(t *testing.T, enabled bool) *env {
	t.Helper()
	st := newFakeStore()
	e := &env{st: st, wl: &fakeWall{}, ss: &fakeSessions{st: st}}
	e.h = &Handlers{Store: st, Sessions: auth.NewSessionManager("test-secret", "http://localhost")}
	if enabled {
		e.h.Guardian = &GuardianDeps{Wall: e.wl, Sessions: e.ss, Now: func() time.Time { return testNow }}
	}
	e.srv = NewRouter(e.h)
	return e
}

func (e *env) addDevice(id, mac string, gated bool) store.GuardianDevice {
	d := store.GuardianDevice{ID: id, StudentID: "stu-1", Name: "Device " + id, Mac: mac, Gated: gated, CreatedAt: testNow}
	e.st.devices[id] = d
	return d
}

// do performs a request as the given role ("" = anonymous) and decodes the
// JSON body into out when non-nil.
func (e *env) do(t *testing.T, method, path string, body any, role auth.Role, id string, out any) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatal(err)
		}
	}
	req := httptest.NewRequest(method, "/api"+path, &buf)
	req.Header.Set("Content-Type", "application/json")
	if role != "" {
		cookieRec := httptest.NewRecorder()
		if err := e.h.Sessions.Issue(cookieRec, auth.Identity{Role: role, ID: id}); err != nil {
			t.Fatal(err)
		}
		for _, c := range cookieRec.Result().Cookies() {
			req.AddCookie(c)
		}
	}
	rec := httptest.NewRecorder()
	e.srv.ServeHTTP(rec, req)
	if out != nil && rec.Code < 300 && rec.Body.Len() > 0 {
		if err := json.Unmarshal(rec.Body.Bytes(), out); err != nil {
			t.Fatalf("%s %s: decode %q: %v", method, path, rec.Body.String(), err)
		}
	}
	return rec
}

func (e *env) parent(t *testing.T, method, path string, body, out any) *httptest.ResponseRecorder {
	t.Helper()
	return e.do(t, method, path, body, auth.RoleParent, "parent-1", out)
}

func expectStatus(t *testing.T, rec *httptest.ResponseRecorder, want int) {
	t.Helper()
	if rec.Code != want {
		t.Fatalf("status = %d, want %d; body %s", rec.Code, want, rec.Body.String())
	}
}

func str(s string) *string { return &s }
func boolp(b bool) *bool   { return &b }
func intp(i int) *int      { return &i }

// --- tests: disabled -----------------------------------------------------------

func TestGuardianDisabled(t *testing.T) {
	e := newEnv(t, false)

	var status contracts.GuardianStatus
	expectStatus(t, e.parent(t, "GET", "/guardian/status", nil, &status), 200)
	if status.Enabled || !status.Paused || status.Wall != contracts.Fake || status.WallHealthy {
		t.Fatalf("disabled status = %+v", status)
	}
	if status.Active == nil || status.Recent == nil || status.DailyUsage == nil || status.Devices == nil {
		t.Fatalf("disabled status must carry empty arrays, got %s", "nil")
	}

	var et contracts.EarnedTime
	expectStatus(t, e.parent(t, "GET", "/guardian/earned-time?studentId=stu-1", nil, &et), 200)
	if et.Enabled || et.RemainingSeconds != 0 || et.CapMinutes != 0 || et.MinutesToday != 0 {
		t.Fatalf("disabled earned time = %+v", et)
	}

	for _, c := range []struct{ method, path string }{
		{"GET", "/guardian/devices"}, {"POST", "/guardian/devices"}, {"POST", "/guardian/devices/scan"},
		{"GET", "/guardian/devices/x"}, {"PUT", "/guardian/devices/x"}, {"DELETE", "/guardian/devices/x"},
		{"GET", "/guardian/policy"}, {"PUT", "/guardian/policy"}, {"GET", "/guardian/sessions"},
		{"POST", "/guardian/sessions/x/revoke"}, {"POST", "/guardian/grant"}, {"GET", "/guardian/override-log"},
	} {
		rec := e.parent(t, c.method, c.path, map[string]any{}, nil)
		if rec.Code != http.StatusConflict {
			t.Fatalf("%s %s while disabled: status %d, want 409", c.method, c.path, rec.Code)
		}
	}
}

func TestGuardianRequiresParent(t *testing.T) {
	e := newEnv(t, true)
	if rec := e.do(t, "GET", "/guardian/status", nil, "", "", nil); rec.Code != 401 {
		t.Fatalf("anonymous status = %d", rec.Code)
	}
	if rec := e.do(t, "GET", "/guardian/devices", nil, auth.RoleStudent, "stu-1", nil); rec.Code != 401 {
		t.Fatalf("student devices = %d, want 401", rec.Code)
	}
	if rec := e.do(t, "POST", "/guardian/grant", contracts.ManualGrant{DeviceId: "d", Minutes: 5}, auth.RoleStudent, "stu-1", nil); rec.Code != 401 {
		t.Fatalf("student grant = %d, want 401", rec.Code)
	}
}

// --- tests: devices ----------------------------------------------------------------

func TestCreateDevice(t *testing.T) {
	e := newEnv(t, true)

	var d contracts.GuardianDevice
	rec := e.parent(t, "POST", "/guardian/devices", contracts.CreateGuardianDevice{Name: " Maya's laptop ", Mac: "AA-BB-CC-DD-EE-01", Hostname: str("maya-pc")}, &d)
	expectStatus(t, rec, 201)
	if d.Mac != "aa:bb:cc:dd:ee:01" || d.Name != "Maya's laptop" || d.StudentId != "stu-1" || !d.Gated || d.Hostname == nil || *d.Hostname != "maya-pc" {
		t.Fatalf("created = %+v", d)
	}
	if len(e.wl.gates) != 1 || e.wl.gates[0] != "aa:bb:cc:dd:ee:01=true" {
		t.Fatalf("wall gates = %v", e.wl.gates)
	}

	// Duplicate MAC in another spelling → 409.
	rec = e.parent(t, "POST", "/guardian/devices", contracts.CreateGuardianDevice{Name: "dup", Mac: "aabb.ccdd.ee01"}, nil)
	expectStatus(t, rec, 409)

	// Bad MAC → 400; missing name → 400; unknown student → 400.
	expectStatus(t, e.parent(t, "POST", "/guardian/devices", contracts.CreateGuardianDevice{Name: "x", Mac: "not-a-mac"}, nil), 400)
	expectStatus(t, e.parent(t, "POST", "/guardian/devices", contracts.CreateGuardianDevice{Name: " ", Mac: "aa:bb:cc:dd:ee:02"}, nil), 400)
	expectStatus(t, e.parent(t, "POST", "/guardian/devices", contracts.CreateGuardianDevice{Name: "x", Mac: "aa:bb:cc:dd:ee:02", StudentId: str("nobody")}, nil), 400)

	// gated=false does not touch the wall.
	before := len(e.wl.gates)
	expectStatus(t, e.parent(t, "POST", "/guardian/devices", contracts.CreateGuardianDevice{Name: "tv", Mac: "aa:bb:cc:dd:ee:03", Gated: boolp(false)}, nil), 201)
	if len(e.wl.gates) != before {
		t.Fatalf("ungated create must not gate: %v", e.wl.gates)
	}

	// Wall failure → 502 and no row.
	e.wl.gateErr = errors.New("router says no")
	rec = e.parent(t, "POST", "/guardian/devices", contracts.CreateGuardianDevice{Name: "phone", Mac: "aa:bb:cc:dd:ee:04"}, nil)
	expectStatus(t, rec, http.StatusBadGateway)
	if _, err := e.st.GetGuardianDeviceByMAC(context.Background(), "aa:bb:cc:dd:ee:04"); err == nil {
		t.Fatal("row must not be created when the wall refused the gate")
	}

	var list []contracts.GuardianDevice
	expectStatus(t, e.parent(t, "GET", "/guardian/devices", nil, &list), 200)
	if len(list) != 2 {
		t.Fatalf("list = %d devices, want 2", len(list))
	}
}

func TestGetUpdateDeleteDevice(t *testing.T) {
	e := newEnv(t, true)
	e.addDevice("d1", "aa:bb:cc:dd:ee:01", true)
	e.addDevice("d2", "aa:bb:cc:dd:ee:02", true)

	var d contracts.GuardianDevice
	expectStatus(t, e.parent(t, "GET", "/guardian/devices/d1", nil, &d), 200)
	if d.Id != "d1" {
		t.Fatalf("get = %+v", d)
	}
	expectStatus(t, e.parent(t, "GET", "/guardian/devices/nope", nil, nil), 404)

	// Rename only: no wall traffic.
	expectStatus(t, e.parent(t, "PUT", "/guardian/devices/d1", contracts.UpdateGuardianDevice{Name: str("Renamed")}, &d), 200)
	if d.Name != "Renamed" || len(e.wl.gates) != 0 {
		t.Fatalf("rename = %+v gates %v", d, e.wl.gates)
	}

	// Ungate: revokes the device's grants and removes the rule.
	expectStatus(t, e.parent(t, "PUT", "/guardian/devices/d1", contracts.UpdateGuardianDevice{Gated: boolp(false)}, &d), 200)
	if d.Gated || len(e.wl.gates) != 1 || e.wl.gates[0] != "aa:bb:cc:dd:ee:01=false" || len(e.ss.revoked) != 1 || e.ss.revoked[0] != "d1" {
		t.Fatalf("ungate = %+v gates %v revoked %v", d, e.wl.gates, e.ss.revoked)
	}

	// Re-gate with a new MAC: (old was ungated so no ungate call) gate new.
	e.wl.gates = nil
	e.ss.revoked = nil
	expectStatus(t, e.parent(t, "PUT", "/guardian/devices/d1", contracts.UpdateGuardianDevice{Mac: str("AA:BB:CC:DD:EE:09"), Gated: boolp(true)}, &d), 200)
	if d.Mac != "aa:bb:cc:dd:ee:09" || !d.Gated {
		t.Fatalf("mac change = %+v", d)
	}
	if len(e.wl.gates) != 1 || e.wl.gates[0] != "aa:bb:cc:dd:ee:09=true" || len(e.ss.revoked) != 1 {
		t.Fatalf("mac change gates %v revoked %v", e.wl.gates, e.ss.revoked)
	}

	// MAC change on a gated device moves the rule: ungate old, gate new.
	e.wl.gates = nil
	expectStatus(t, e.parent(t, "PUT", "/guardian/devices/d1", contracts.UpdateGuardianDevice{Mac: str("aa:bb:cc:dd:ee:0a")}, &d), 200)
	if len(e.wl.gates) != 2 || e.wl.gates[0] != "aa:bb:cc:dd:ee:09=false" || e.wl.gates[1] != "aa:bb:cc:dd:ee:0a=true" {
		t.Fatalf("move gates %v", e.wl.gates)
	}

	// MAC collision with another device → 409; bad mac → 400; empty name → 400.
	expectStatus(t, e.parent(t, "PUT", "/guardian/devices/d1", contracts.UpdateGuardianDevice{Mac: str("aa:bb:cc:dd:ee:02")}, nil), 409)
	expectStatus(t, e.parent(t, "PUT", "/guardian/devices/d1", contracts.UpdateGuardianDevice{Mac: str("zz")}, nil), 400)
	expectStatus(t, e.parent(t, "PUT", "/guardian/devices/d1", contracts.UpdateGuardianDevice{Name: str("  ")}, nil), 400)
	expectStatus(t, e.parent(t, "PUT", "/guardian/devices/nope", contracts.UpdateGuardianDevice{Name: str("x")}, nil), 404)

	// Delete: revoke, ungate, 204; then 404.
	e.wl.gates = nil
	e.ss.revoked = nil
	expectStatus(t, e.parent(t, "DELETE", "/guardian/devices/d2", nil, nil), 204)
	if len(e.ss.revoked) != 1 || e.ss.revoked[0] != "d2" || len(e.wl.gates) != 1 || e.wl.gates[0] != "aa:bb:cc:dd:ee:02=false" {
		t.Fatalf("delete revoked %v gates %v", e.ss.revoked, e.wl.gates)
	}
	if _, ok := e.st.devices["d2"]; ok {
		t.Fatal("row not deleted")
	}
	expectStatus(t, e.parent(t, "DELETE", "/guardian/devices/d2", nil, nil), 404)
}

func TestScanDevices(t *testing.T) {
	e := newEnv(t, true)
	e.addDevice("d1", "aa:bb:cc:dd:ee:01", true)
	e.wl.discover = []wall.DiscoveredDevice{
		{MAC: "AA:BB:CC:DD:EE:01", IP: "192.168.88.10", Hostname: "maya-pc"},
		{MAC: "aa:bb:cc:dd:ee:02", IP: "192.168.88.11"},
	}
	var found []contracts.DiscoveredDevice
	expectStatus(t, e.parent(t, "POST", "/guardian/devices/scan", nil, &found), 200)
	if len(found) != 2 {
		t.Fatalf("found = %+v", found)
	}
	if found[0].Mac != "aa:bb:cc:dd:ee:01" || !found[0].Registered || found[0].Hostname == nil || *found[0].Hostname != "maya-pc" || found[0].Ip == nil {
		t.Fatalf("found[0] = %+v", found[0])
	}
	if found[1].Registered || found[1].Hostname != nil {
		t.Fatalf("found[1] = %+v", found[1])
	}
}

// --- tests: policy -------------------------------------------------------------------

func TestPolicyGetAndUpdate(t *testing.T) {
	e := newEnv(t, true)

	var p contracts.GuardianPolicy
	expectStatus(t, e.parent(t, "GET", "/guardian/policy", nil, &p), 200)
	if !p.Enabled || p.RateMinPerQ != 3 || p.DailyCapHours != 3 || p.PassBar != 70 || p.CooldownMin != 10 || p.RewardStyle != contracts.Flat || !p.DiminishingReturns || p.Wall != contracts.Fake {
		t.Fatalf("policy = %+v", p)
	}

	body := contracts.UpdateGuardianPolicy{RateMinPerQ: intp(5), DailyCapHours: intp(2), Enabled: boolp(false), RewardStyle: (*contracts.RewardStyle)(str("scaled")), DiminishingReturns: boolp(false)}
	expectStatus(t, e.parent(t, "PUT", "/guardian/policy", body, &p), 200)
	if p.Enabled || p.RateMinPerQ != 5 || p.DailyCapHours != 2 || p.RewardStyle != contracts.Scaled || p.DiminishingReturns {
		t.Fatalf("updated policy = %+v", p)
	}
	if e.st.settings.RewardRateMinPerQ != 5 || e.st.settings.DailyCapHours != 2 || e.st.settings.DefaultPassBar != 70 {
		t.Fatalf("settings row = %+v", e.st.settings)
	}

	// Partial: only re-enable; the rest must survive.
	expectStatus(t, e.parent(t, "PUT", "/guardian/policy", contracts.UpdateGuardianPolicy{Enabled: boolp(true)}, &p), 200)
	if !p.Enabled || p.RateMinPerQ != 5 || p.RewardStyle != contracts.Scaled {
		t.Fatalf("partial update = %+v", p)
	}

	// Validation.
	expectStatus(t, e.parent(t, "PUT", "/guardian/policy", contracts.UpdateGuardianPolicy{RateMinPerQ: intp(-1)}, nil), 400)
	expectStatus(t, e.parent(t, "PUT", "/guardian/policy", contracts.UpdateGuardianPolicy{DailyCapHours: intp(25)}, nil), 400)
	expectStatus(t, e.parent(t, "PUT", "/guardian/policy", contracts.UpdateGuardianPolicy{RewardStyle: (*contracts.RewardStyle)(str("bonus"))}, nil), 400)
	expectStatus(t, e.parent(t, "PUT", "/guardian/policy", map[string]any{"passBar": 50}, nil), 400) // read-only field rejected

	// No settings row yet: GET resolves the defaults.
	e.st.settings = nil
	expectStatus(t, e.parent(t, "GET", "/guardian/policy", nil, &p), 200)
	if p.RateMinPerQ != 3 || p.DailyCapHours != 3 || p.PassBar != 70 {
		t.Fatalf("defaults = %+v", p)
	}
}

// --- tests: sessions / grants ----------------------------------------------------------

func TestManualGrantAndSessions(t *testing.T) {
	e := newEnv(t, true)
	d := e.addDevice("d1", "aa:bb:cc:dd:ee:01", true)

	var g contracts.GuardianGrant
	rec := e.parent(t, "POST", "/guardian/grant", contracts.ManualGrant{DeviceId: d.ID, Minutes: 45, Reason: str("homework done")}, &g)
	expectStatus(t, rec, 201)
	if g.DeviceId != "d1" || g.DeviceName != "Device d1" || g.Minutes != 45 || g.Source != contracts.Manual || g.Reason == nil || *g.Reason != "homework done" || g.RemainingSeconds != 45*60 || g.RevokedAt != nil {
		t.Fatalf("grant = %+v", g)
	}
	if len(e.st.overrides) != 1 || e.st.overrides[0].Who != "parent-1" || e.st.overrides[0].Minutes != 45 || e.st.overrides[0].DeviceName != "Device d1" {
		t.Fatalf("override log = %+v", e.st.overrides)
	}
	if len(e.st.usage) != 0 {
		t.Fatal("manual grants must not touch daily usage")
	}

	expectStatus(t, e.parent(t, "POST", "/guardian/grant", contracts.ManualGrant{DeviceId: d.ID, Minutes: 0}, nil), 400)
	expectStatus(t, e.parent(t, "POST", "/guardian/grant", contracts.ManualGrant{DeviceId: d.ID, Minutes: 99999}, nil), 400)
	expectStatus(t, e.parent(t, "POST", "/guardian/grant", contracts.ManualGrant{DeviceId: "nope", Minutes: 5}, nil), 404)

	e.ss.grantErr = errors.New("router down")
	expectStatus(t, e.parent(t, "POST", "/guardian/grant", contracts.ManualGrant{DeviceId: d.ID, Minutes: 5}, nil), http.StatusBadGateway)
	e.ss.grantErr = nil

	var log []contracts.GuardianOverrideLog
	expectStatus(t, e.parent(t, "GET", "/guardian/override-log", nil, &log), 200)
	if len(log) != 1 || log[0].Who != "parent-1" || log[0].Reason == nil {
		t.Fatalf("log = %+v", log)
	}

	var active []contracts.GuardianGrant
	expectStatus(t, e.parent(t, "GET", "/guardian/sessions", nil, &active), 200)
	if len(active) != 1 || active[0].Id != g.Id || active[0].DeviceName != "Device d1" || active[0].RemainingSeconds != 45*60 {
		t.Fatalf("sessions = %+v", active)
	}

	var revoked contracts.GuardianGrant
	expectStatus(t, e.parent(t, "POST", "/guardian/sessions/"+g.Id+"/revoke", nil, &revoked), 200)
	if revoked.RevokedAt == nil || revoked.RemainingSeconds != 0 {
		t.Fatalf("revoked = %+v", revoked)
	}
	expectStatus(t, e.parent(t, "POST", "/guardian/sessions/nope/revoke", nil, nil), 404)

	expectStatus(t, e.parent(t, "GET", "/guardian/sessions", nil, &active), 200)
	if len(active) != 0 {
		t.Fatalf("sessions after revoke = %+v", active)
	}
}

// --- tests: status / earned time -----------------------------------------------------------

func TestStatusEnabled(t *testing.T) {
	e := newEnv(t, true)
	e.addDevice("d1", "aa:bb:cc:dd:ee:01", true)
	today := ingest.DayOf(testNow)
	yesterday := ingest.DayOf(testNow.AddDate(0, 0, -1))
	e.st.usage = []store.GuardianDailyUsage{
		{StudentID: "stu-1", Day: today, Minutes: 90, Passes: 2},
		{StudentID: "stu-1", Day: yesterday, Minutes: 30, Passes: 1},
	}
	// One active exam grant, one expired.
	e.st.grants["g-active"] = store.GuardianGrant{ID: "g-active", DeviceID: "d1", StudentID: "stu-1", Mac: "aa:bb:cc:dd:ee:01", Minutes: 60, Source: "exam", StartedAt: testNow.Add(-10 * time.Minute), ExpiresAt: testNow.Add(50 * time.Minute)}
	e.st.grants["g-old"] = store.GuardianGrant{ID: "g-old", DeviceID: "d1", StudentID: "stu-1", Mac: "aa:bb:cc:dd:ee:01", Minutes: 30, Source: "exam", StartedAt: testNow.Add(-3 * time.Hour), ExpiresAt: testNow.Add(-150 * time.Minute)}

	var s contracts.GuardianStatus
	expectStatus(t, e.parent(t, "GET", "/guardian/status", nil, &s), 200)
	if !s.Enabled || s.Paused || s.Wall != contracts.Fake || !s.WallHealthy || s.WallError != nil {
		t.Fatalf("status = %+v", s)
	}
	if len(s.Active) != 1 || s.Active[0].Id != "g-active" || s.Active[0].RemainingSeconds != 50*60 || s.Active[0].DeviceName != "Device d1" {
		t.Fatalf("active = %+v", s.Active)
	}
	if len(s.Recent) != 2 || s.Recent[0].Id != "g-active" || s.Recent[1].RemainingSeconds != 0 {
		t.Fatalf("recent = %+v", s.Recent)
	}
	if len(s.DailyUsage) != 1 || s.DailyUsage[0].Minutes != 90 || s.DailyUsage[0].Passes != 2 || s.DailyUsage[0].CapMinutes != 180 {
		t.Fatalf("dailyUsage = %+v", s.DailyUsage)
	}
	if len(s.Devices) != 1 {
		t.Fatalf("devices = %+v", s.Devices)
	}

	// Paused policy + unhealthy wall are reported, not errors.
	e.st.policy.Enabled = false
	e.wl.pingErr = errors.New("timeout")
	expectStatus(t, e.parent(t, "GET", "/guardian/status", nil, &s), 200)
	if !s.Paused || s.WallHealthy || s.WallError == nil || *s.WallError != "timeout" {
		t.Fatalf("paused/unhealthy status = %+v", s)
	}
}

func TestEarnedTime(t *testing.T) {
	e := newEnv(t, true)
	e.addDevice("d1", "aa:bb:cc:dd:ee:01", true)
	e.addDevice("d2", "aa:bb:cc:dd:ee:02", true)
	today := ingest.DayOf(testNow)
	e.st.usage = []store.GuardianDailyUsage{{StudentID: "stu-1", Day: today, Minutes: 75, Passes: 2}}
	attempt := "attempt-9"
	e.st.grants["g-exam"] = store.GuardianGrant{ID: "g-exam", DeviceID: "d1", StudentID: "stu-1", Mac: "aa:bb:cc:dd:ee:01", Minutes: 30, Source: "exam", AttemptID: &attempt, StartedAt: testNow.Add(-10 * time.Minute), ExpiresAt: testNow.Add(20 * time.Minute)}
	// A newer manual grant on the other device with more time left.
	e.st.grants["g-manual"] = store.GuardianGrant{ID: "g-manual", DeviceID: "d2", StudentID: "stu-1", Mac: "aa:bb:cc:dd:ee:02", Minutes: 60, Source: "manual", StartedAt: testNow.Add(-5 * time.Minute), ExpiresAt: testNow.Add(55 * time.Minute)}

	// Student querying own id.
	var et contracts.EarnedTime
	rec := e.do(t, "GET", "/guardian/earned-time?studentId=stu-1", nil, auth.RoleStudent, "stu-1", &et)
	expectStatus(t, rec, 200)
	if !et.Enabled || et.RemainingSeconds != 55*60 || et.ExpiresAt == nil || !et.ExpiresAt.Equal(testNow.Add(55*time.Minute)) || et.DeviceName == nil || *et.DeviceName != "Device d2" {
		t.Fatalf("earned = %+v", et)
	}
	if et.MinutesToday != 75 || et.CapMinutes != 180 {
		t.Fatalf("usage in earned = %+v", et)
	}
	if et.LastGrantMinutes == nil || *et.LastGrantMinutes != 30 || et.LastGrantAttemptId == nil || *et.LastGrantAttemptId != "attempt-9" {
		t.Fatalf("last exam grant = %+v", et)
	}

	// Student querying someone else → 401; parent may query anyone; missing id → 400.
	expectStatus(t, e.do(t, "GET", "/guardian/earned-time?studentId=other", nil, auth.RoleStudent, "stu-1", nil), 401)
	expectStatus(t, e.parent(t, "GET", "/guardian/earned-time?studentId=stu-1", nil, &et), 200)
	expectStatus(t, e.do(t, "GET", "/guardian/earned-time?studentId=", nil, auth.RoleStudent, "", nil), 400)

	// Paused policy → enabled=false but numbers still reported.
	e.st.policy.Enabled = false
	expectStatus(t, e.parent(t, "GET", "/guardian/earned-time?studentId=stu-1", nil, &et), 200)
	if et.Enabled || et.RemainingSeconds != 55*60 {
		t.Fatalf("paused earned = %+v", et)
	}

	// Nothing active, no usage, no grants (fresh struct: omitted optional
	// fields must be absent on the wire).
	e.st.grants = map[string]store.GuardianGrant{}
	e.st.usage = nil
	var idle contracts.EarnedTime
	expectStatus(t, e.parent(t, "GET", "/guardian/earned-time?studentId=stu-1", nil, &idle), 200)
	if idle.RemainingSeconds != 0 || idle.ExpiresAt != nil || idle.DeviceName != nil || idle.MinutesToday != 0 || idle.LastGrantMinutes != nil || idle.LastGrantAttemptId != nil {
		t.Fatalf("idle earned = %+v", idle)
	}
}
