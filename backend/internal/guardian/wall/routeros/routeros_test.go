package routeros

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/shafqat/studyrover/backend/internal/guardian/wall"
)

const (
	testUser = "studyrover"
	testPass = "s3cret"
	macA     = "aa:bb:cc:dd:ee:01"
	macB     = "aa:bb:cc:dd:ee:02"
	macC     = "aa:bb:cc:dd:ee:03"
)

// row is one object in the mock router's tables (all values strings, as
// RouterOS renders them).
type row map[string]string

// mockRouter is a tiny RouterOS v7 REST stand-in: Basic auth, GET with
// ?field=value filters, PUT creates (honouring place-before), DELETE by id.
type mockRouter struct {
	t      *testing.T
	mu     sync.Mutex
	nextID int
	tables map[string][]row
	calls  []string // "METHOD path[?query]"
	// fail, when set, makes every request answer with this RouterOS error.
	fail *struct {
		status          int
		message, detail string
	}
}

func newMockRouter(t *testing.T) (*mockRouter, *httptest.Server) {
	m := &mockRouter{t: t, tables: map[string][]row{}}
	srv := httptest.NewServer(m)
	t.Cleanup(srv.Close)
	return m, srv
}

// seed adds a row to a table and returns its id.
func (m *mockRouter) seed(table string, r row) string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.insert(table, r, "")
}

// insert appends (or places before id) and returns the new id. Caller holds mu.
func (m *mockRouter) insert(table string, r row, before string) string {
	m.nextID++
	id := fmt.Sprintf("*%X", m.nextID)
	r[".id"] = id
	rows := m.tables[table]
	if before != "" {
		for i, existing := range rows {
			if existing[".id"] == before {
				rows = append(rows[:i], append([]row{r}, rows[i:]...)...)
				m.tables[table] = rows
				return id
			}
		}
		m.t.Errorf("place-before %q: no such row in %s", before, table)
	}
	m.tables[table] = append(rows, r)
	return id
}

func (m *mockRouter) rows(table string) []row {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]row(nil), m.tables[table]...)
}

func (m *mockRouter) callsMatching(prefix string) []string {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []string
	for _, c := range m.calls {
		if strings.HasPrefix(c, prefix) {
			out = append(out, c)
		}
	}
	return out
}

func writeErr(w http.ResponseWriter, status int, message, detail string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"error": status, "message": message, "detail": detail})
}

func (m *mockRouter) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	m.mu.Lock()
	defer m.mu.Unlock()

	call := r.Method + " " + r.URL.Path
	if r.URL.RawQuery != "" {
		call += "?" + r.URL.RawQuery
	}
	m.calls = append(m.calls, call)

	if u, p, ok := r.BasicAuth(); !ok || u != testUser || p != testPass {
		writeErr(w, http.StatusUnauthorized, "Unauthorized", "")
		return
	}
	if m.fail != nil {
		writeErr(w, m.fail.status, m.fail.message, m.fail.detail)
		return
	}
	if !strings.HasPrefix(r.URL.Path, "/rest/") {
		writeErr(w, http.StatusNotFound, "no such command prefix", "")
		return
	}
	path := strings.TrimPrefix(r.URL.Path, "/rest/")

	if path == "system/resource" && r.Method == http.MethodGet {
		_ = json.NewEncoder(w).Encode(map[string]string{"version": "7.16.1 (stable)", "board-name": "hAP ax3"})
		return
	}

	// Split "<table>/<id>".
	table, id := path, ""
	if i := strings.LastIndex(path, "/*"); i >= 0 {
		table, id = path[:i], path[i+1:]
	}
	if _, known := map[string]bool{pathFilter: true, pathAddressList: true, pathLease: true, pathARP: true}[table]; !known {
		writeErr(w, http.StatusNotFound, "no such command", table)
		return
	}

	switch {
	case r.Method == http.MethodGet && id == "":
		var out []row
		q := r.URL.Query()
	rowsLoop:
		for _, existing := range m.tables[table] {
			for k, v := range q {
				if strings.HasPrefix(k, ".") {
					continue // .proplist etc.
				}
				if existing[k] != v[0] {
					continue rowsLoop
				}
			}
			out = append(out, existing)
		}
		if out == nil {
			out = []row{}
		}
		_ = json.NewEncoder(w).Encode(out)
	case r.Method == http.MethodPut && id == "":
		if ct := r.Header.Get("Content-Type"); ct != "application/json" {
			writeErr(w, http.StatusBadRequest, "content-type", ct)
			return
		}
		var body row
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeErr(w, http.StatusBadRequest, "bad json", err.Error())
			return
		}
		if table == pathAddressList {
			if body["list"] == "" || body["address"] == "" {
				writeErr(w, http.StatusBadRequest, "missing list or address", "")
				return
			}
		}
		before := body["place-before"]
		delete(body, "place-before")
		if table == pathFilter {
			body["dynamic"] = "false"
		}
		m.insert(table, body, before)
		_ = json.NewEncoder(w).Encode(body)
	case r.Method == http.MethodDelete && id != "":
		rows := m.tables[table]
		for i, existing := range rows {
			if existing[".id"] == id {
				m.tables[table] = append(rows[:i], rows[i+1:]...)
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}
		writeErr(w, http.StatusNotFound, "no such item", id)
	default:
		writeErr(w, http.StatusMethodNotAllowed, "unsupported", call)
	}
}

func newTestWall(t *testing.T, srv *httptest.Server) (*Wall, *time.Time) {
	t.Helper()
	w, err := New(Config{BaseURL: srv.URL + "/", User: testUser, Password: testPass})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	now := time.Date(2026, 8, 26, 10, 0, 0, 0, time.UTC)
	w.now = func() time.Time { return now }
	return w, &now
}

func TestNewValidation(t *testing.T) {
	if _, err := New(Config{}); err == nil {
		t.Fatal("New with empty config must fail")
	}
	if _, err := New(Config{BaseURL: "192.168.88.1", User: "admin"}); err == nil {
		t.Fatal("New without scheme must fail")
	}
	w, err := New(Config{BaseURL: "https://192.168.88.1/", User: "admin", InsecureTLS: true})
	if err != nil {
		t.Fatal(err)
	}
	if w.base != "https://192.168.88.1/rest" {
		t.Fatalf("base = %q", w.base)
	}
	if w.http.Timeout != defaultTimeout {
		t.Fatalf("Timeout = %v", w.http.Timeout)
	}
	if tr, ok := w.http.Transport.(*http.Transport); !ok || tr.TLSClientConfig == nil || !tr.TLSClientConfig.InsecureSkipVerify {
		t.Fatal("InsecureTLS must configure InsecureSkipVerify")
	}
	if w.Kind() != wall.KindRouterOS {
		t.Fatalf("Kind = %q", w.Kind())
	}
}

func TestPingAndAuth(t *testing.T) {
	ctx := context.Background()
	m, srv := newMockRouter(t)
	w, _ := newTestWall(t, srv)

	if err := w.Ping(ctx); err != nil {
		t.Fatalf("Ping: %v", err)
	}
	if calls := m.callsMatching("GET /rest/system/resource"); len(calls) != 1 {
		t.Fatalf("calls = %v", m.calls)
	}

	bad, err := New(Config{BaseURL: srv.URL, User: testUser, Password: "wrong"})
	if err != nil {
		t.Fatal(err)
	}
	err = bad.Ping(ctx)
	var rerr *Error
	if !errors.As(err, &rerr) || rerr.Status != http.StatusUnauthorized {
		t.Fatalf("Ping with bad password = %v, want 401 *Error", err)
	}
	if !strings.Contains(err.Error(), "401") || !strings.Contains(err.Error(), "Unauthorized") {
		t.Fatalf("error text = %q", err)
	}
}

func TestErrorMapping(t *testing.T) {
	ctx := context.Background()
	m, srv := newMockRouter(t)
	w, _ := newTestWall(t, srv)
	m.fail = &struct {
		status          int
		message, detail string
	}{400, "invalid value", "for src-mac-address"}

	err := w.Gate(ctx, macA, true)
	var rerr *Error
	if !errors.As(err, &rerr) {
		t.Fatalf("err = %v, want *Error", err)
	}
	if rerr.Status != 400 || rerr.Message != "invalid value" || rerr.Detail != "for src-mac-address" {
		t.Fatalf("err = %+v", rerr)
	}
	if s := err.Error(); !strings.Contains(s, "invalid value") || !strings.Contains(s, "for src-mac-address") || !strings.Contains(s, "GET ip/firewall/filter") {
		t.Fatalf("error text = %q", s)
	}
}

func TestGateIdempotentAndPlacedFirst(t *testing.T) {
	ctx := context.Background()
	m, srv := newMockRouter(t)
	w, _ := newTestWall(t, srv)

	// A typical default firewall: a dynamic rule (unplaceable), then the
	// household's accept established/related, then drop-all.
	m.seed(pathFilter, row{"chain": "forward", "action": "fasttrack-connection", "dynamic": "true"})
	acceptID := m.seed(pathFilter, row{"chain": "forward", "action": "accept", "connection-state": "established,related", "dynamic": "false", "comment": "defconf: accept established,related"})
	m.seed(pathFilter, row{"chain": "input", "action": "drop", "dynamic": "false"})
	m.seed(pathFilter, row{"chain": "forward", "action": "drop", "dynamic": "false", "comment": "defconf: drop all"})

	for i := 0; i < 3; i++ {
		if err := w.Gate(ctx, "AA-BB-CC-DD-EE-01", true); err != nil {
			t.Fatalf("Gate #%d: %v", i, err)
		}
	}
	rules := m.rows(pathFilter)
	if len(rules) != 5 {
		t.Fatalf("Gate must add exactly one rule, table = %v", rules)
	}
	if puts := m.callsMatching("PUT /rest/ip/firewall/filter"); len(puts) != 1 {
		t.Fatalf("PUTs = %v", puts)
	}
	// Placed before the first static forward rule (index 1), i.e. after the
	// dynamic one at index 0.
	gate := rules[1]
	if rules[2][".id"] != acceptID {
		t.Fatalf("gate must sit before the accept rule; table = %v", rules)
	}
	want := row{
		"chain":            "forward",
		"src-mac-address":  "AA:BB:CC:DD:EE:01",
		"src-address-list": "!studyrover-online",
		"action":           "drop",
		"comment":          "studyrover:" + macA,
	}
	for k, v := range want {
		if gate[k] != v {
			t.Errorf("gate rule %s = %q, want %q", k, gate[k], v)
		}
	}
	if _, leaked := gate["place-before"]; leaked {
		t.Error("place-before must be consumed, not stored")
	}
	// The comment lookup must be a filtered GET.
	if gets := m.callsMatching("GET /rest/ip/firewall/filter?comment="); len(gets) != 3 {
		t.Fatalf("comment lookups = %v", gets)
	}

	// Ungate removes; ungating again is a no-op without error.
	for i := 0; i < 2; i++ {
		if err := w.Gate(ctx, macA, false); err != nil {
			t.Fatalf("Gate(false) #%d: %v", i, err)
		}
	}
	rules = m.rows(pathFilter)
	if len(rules) != 4 {
		t.Fatalf("after ungate, table = %v", rules)
	}
	for _, r := range rules {
		if strings.HasPrefix(r["comment"], CommentPrefix) {
			t.Fatalf("studyrover rule survived ungate: %v", r)
		}
	}
	if dels := m.callsMatching("DELETE /rest/ip/firewall/filter/"); len(dels) != 1 {
		t.Fatalf("DELETEs = %v", dels)
	}
}

func TestGateEmptyForwardChainAppends(t *testing.T) {
	ctx := context.Background()
	m, srv := newMockRouter(t)
	w, _ := newTestWall(t, srv)
	m.seed(pathFilter, row{"chain": "input", "action": "drop", "dynamic": "false"})

	if err := w.Gate(ctx, macA, true); err != nil {
		t.Fatal(err)
	}
	rules := m.rows(pathFilter)
	if len(rules) != 2 || rules[1]["src-mac-address"] != "AA:BB:CC:DD:EE:01" {
		t.Fatalf("table = %v", rules)
	}
}

func TestGrantViaLease(t *testing.T) {
	ctx := context.Background()
	m, srv := newMockRouter(t)
	w, _ := newTestWall(t, srv)
	m.seed(pathLease, row{"mac-address": "AA:BB:CC:DD:EE:01", "address": "192.168.88.10", "active-address": "192.168.88.10", "host-name": "tablet", "status": "bound"})
	m.seed(pathLease, row{"mac-address": "AA:BB:CC:DD:EE:02", "address": "192.168.88.11", "status": "waiting"})
	// A foreign entry on our list, and a foreign list: both must be left alone.
	m.seed(pathAddressList, row{"list": AddressList, "address": "192.168.88.99", "comment": "manual: dad's laptop"})
	m.seed(pathAddressList, row{"list": "blocked", "address": "192.168.88.10", "comment": "studyrover:" + macA})

	ref, err := w.Grant(ctx, macA, 90*time.Minute)
	if err != nil {
		t.Fatalf("Grant: %v", err)
	}
	entries := m.rows(pathAddressList)
	if len(entries) != 3 {
		t.Fatalf("address-list = %v", entries)
	}
	created := entries[2]
	if created[".id"] != ref {
		t.Fatalf("ref = %q, entry = %v", ref, created)
	}
	want := row{"list": AddressList, "address": "192.168.88.10", "timeout": "1h30m", "comment": "studyrover:" + macA}
	for k, v := range want {
		if created[k] != v {
			t.Errorf("entry %s = %q, want %q", k, created[k], v)
		}
	}

	// Re-grant replaces: the earlier entry is deleted, a new one created.
	ref2, err := w.Grant(ctx, macA, 30*time.Second)
	if err != nil {
		t.Fatalf("Grant 2: %v", err)
	}
	if ref2 == ref {
		t.Fatal("re-grant must yield a new ref")
	}
	entries = m.rows(pathAddressList)
	if len(entries) != 3 {
		t.Fatalf("after re-grant, address-list = %v", entries)
	}
	if entries[2]["timeout"] != "30s" || entries[2][".id"] != ref2 {
		t.Fatalf("replacement = %v", entries[2])
	}
	if dels := m.callsMatching("DELETE /rest/ip/firewall/address-list/" + ref); len(dels) != 1 {
		t.Fatalf("expected old entry deleted once, got %v", m.callsMatching("DELETE"))
	}
	// The "blocked" list entry with our comment was never touched.
	if entries[1]["list"] != "blocked" {
		t.Fatalf("foreign list entry disturbed: %v", entries)
	}
}

func TestGrantARPFallbackAndOffline(t *testing.T) {
	ctx := context.Background()
	m, srv := newMockRouter(t)
	w, _ := newTestWall(t, srv)
	m.seed(pathLease, row{"mac-address": "AA:BB:CC:DD:EE:01", "address": "192.168.88.10", "status": "bound", "disabled": "true"})
	m.seed(pathARP, row{"mac-address": "AA:BB:CC:DD:EE:01", "address": "192.168.88.50", "interface": "bridge"})
	m.seed(pathARP, row{"mac-address": "AA:BB:CC:DD:EE:03", "address": "192.168.88.51", "invalid": "true"})

	ref, err := w.Grant(ctx, macA, time.Hour)
	if err != nil {
		t.Fatalf("Grant: %v", err)
	}
	entries := m.rows(pathAddressList)
	if len(entries) != 1 || entries[0]["address"] != "192.168.88.50" || entries[0][".id"] != ref {
		t.Fatalf("address-list = %v", entries)
	}

	// Unknown MAC, and a MAC whose only ARP entry is invalid: offline.
	for _, mac := range []string{macB, macC} {
		_, err = w.Grant(ctx, mac, time.Hour)
		if err == nil || !strings.Contains(err.Error(), "offline") || !strings.Contains(err.Error(), mac) {
			t.Fatalf("Grant(%s) = %v, want offline error", mac, err)
		}
	}
	if puts := m.callsMatching("PUT /rest/ip/firewall/address-list"); len(puts) != 1 {
		t.Fatalf("offline grants must not PUT: %v", puts)
	}

	if _, err := w.Grant(ctx, macA, 0); err == nil {
		t.Fatal("non-positive duration must fail (would create a permanent entry)")
	}
	if _, err := w.Grant(ctx, "nope", time.Hour); err == nil {
		t.Fatal("invalid MAC must fail")
	}
}

func TestRevoke(t *testing.T) {
	ctx := context.Background()
	m, srv := newMockRouter(t)
	w, _ := newTestWall(t, srv)

	if err := w.Revoke(ctx, macA); !errors.Is(err, wall.ErrNotFound) {
		t.Fatalf("Revoke unknown = %v, want ErrNotFound", err)
	}
	id1 := m.seed(pathAddressList, row{"list": AddressList, "address": "192.168.88.10", "timeout": "10m", "comment": "studyrover:" + macA})
	id2 := m.seed(pathAddressList, row{"list": AddressList, "address": "192.168.88.10", "timeout": "20m", "comment": "studyrover:" + macA}) // duplicate leftover
	keep := m.seed(pathAddressList, row{"list": AddressList, "address": "192.168.88.11", "timeout": "20m", "comment": "studyrover:" + macB})

	if err := w.Revoke(ctx, "AA:BB:CC:DD:EE:01"); err != nil {
		t.Fatalf("Revoke: %v", err)
	}
	entries := m.rows(pathAddressList)
	if len(entries) != 1 || entries[0][".id"] != keep {
		t.Fatalf("address-list after revoke = %v", entries)
	}
	for _, id := range []string{id1, id2} {
		if dels := m.callsMatching("DELETE /rest/ip/firewall/address-list/" + id); len(dels) != 1 {
			t.Fatalf("expected DELETE of %s, calls = %v", id, m.calls)
		}
	}
	if err := w.Revoke(ctx, macA); !errors.Is(err, wall.ErrNotFound) {
		t.Fatalf("second Revoke = %v, want ErrNotFound", err)
	}
}

func TestListActive(t *testing.T) {
	ctx := context.Background()
	m, srv := newMockRouter(t)
	w, now := newTestWall(t, srv)

	idB := m.seed(pathAddressList, row{"list": AddressList, "address": "192.168.88.11", "timeout": "1h2m3s", "comment": "studyrover:" + macB})
	idA := m.seed(pathAddressList, row{"list": AddressList, "address": "192.168.88.10", "timeout": "59m30s", "comment": "studyrover:" + macA})
	idC := m.seed(pathAddressList, row{"list": AddressList, "address": "192.168.88.12", "timeout": "2d1h", "comment": "studyrover:AA-BB-CC-DD-EE-03"})
	m.seed(pathAddressList, row{"list": AddressList, "address": "192.168.88.99", "timeout": "5m", "comment": "manual"})
	m.seed(pathAddressList, row{"list": "blocked", "address": "10.0.0.1", "comment": "studyrover:" + macA})
	idP := m.seed(pathAddressList, row{"list": AddressList, "address": "192.168.88.13", "comment": "studyrover:aa:bb:cc:dd:ee:04"}) // permanent (no timeout)

	active, err := w.ListActive(ctx)
	if err != nil {
		t.Fatalf("ListActive: %v", err)
	}
	if calls := m.callsMatching("GET /rest/ip/firewall/address-list?list=studyrover-online"); len(calls) != 1 {
		t.Fatalf("calls = %v", m.calls)
	}
	want := []wall.ActiveGrant{
		{MAC: macA, IP: "192.168.88.10", ExpiresAt: now.Add(59*time.Minute + 30*time.Second), Ref: idA},
		{MAC: macB, IP: "192.168.88.11", ExpiresAt: now.Add(time.Hour + 2*time.Minute + 3*time.Second), Ref: idB},
		{MAC: macC, IP: "192.168.88.12", ExpiresAt: now.Add(49 * time.Hour), Ref: idC},
		{MAC: "aa:bb:cc:dd:ee:04", IP: "192.168.88.13", ExpiresAt: now.Add(permanentHorizon), Ref: idP},
	}
	if len(active) != len(want) {
		t.Fatalf("ListActive = %+v, want %d entries", active, len(want))
	}
	for i := range want {
		if active[i] != want[i] {
			t.Errorf("[%d] = %+v, want %+v", i, active[i], want[i])
		}
	}
	if got := active[0].Remaining(*now); got != 59*time.Minute+30*time.Second {
		t.Fatalf("Remaining = %v", got)
	}
}

func TestDiscoverUnionDedupe(t *testing.T) {
	ctx := context.Background()
	m, srv := newMockRouter(t)
	w, _ := newTestWall(t, srv)
	m.seed(pathLease, row{"mac-address": "AA:BB:CC:DD:EE:01", "address": "192.168.88.10", "active-address": "192.168.88.10", "host-name": "tablet"})
	m.seed(pathLease, row{"mac-address": "AA:BB:CC:DD:EE:02", "address": "192.168.88.11", "host-name": "phone"})
	m.seed(pathLease, row{"mac-address": "garbage", "address": "192.168.88.66"})
	m.seed(pathARP, row{"mac-address": "AA:BB:CC:DD:EE:01", "address": "192.168.88.10"}) // dup of lease
	m.seed(pathARP, row{"mac-address": "aa:bb:cc:dd:ee:03", "address": "192.168.88.5"})  // static IP, no lease
	m.seed(pathARP, row{"address": "192.168.88.200"})                                    // incomplete, no MAC

	devs, err := w.Discover(ctx)
	if err != nil {
		t.Fatalf("Discover: %v", err)
	}
	want := []wall.DiscoveredDevice{
		{MAC: macA, IP: "192.168.88.10", Hostname: "tablet"},
		{MAC: macB, IP: "192.168.88.11", Hostname: "phone"},
		{MAC: macC, IP: "192.168.88.5"},
	}
	if len(devs) != len(want) {
		t.Fatalf("Discover = %+v", devs)
	}
	for i := range want {
		if devs[i] != want[i] {
			t.Errorf("[%d] = %+v, want %+v", i, devs[i], want[i])
		}
	}
}

func TestParseDuration(t *testing.T) {
	tests := []struct {
		in   string
		want time.Duration
		bad  bool
	}{
		{"59m30s", 59*time.Minute + 30*time.Second, false},
		{"1h2m3s", time.Hour + 2*time.Minute + 3*time.Second, false},
		{"2d1h", 49 * time.Hour, false},
		{"1w", 7 * 24 * time.Hour, false},
		{"1w2d3h4m5s", 7*24*time.Hour + 2*24*time.Hour + 3*time.Hour + 4*time.Minute + 5*time.Second, false},
		{"45s", 45 * time.Second, false},
		{"500ms", 500 * time.Millisecond, false},
		{"1.5h", 90 * time.Minute, false},
		{"1d02:03:04", 26*time.Hour + 3*time.Minute + 4*time.Second, false},
		{"02:03:04", 2*time.Hour + 3*time.Minute + 4*time.Second, false},
		{"00:05:00", 5 * time.Minute, false},
		{"1w1d00:00:01", 8*24*time.Hour + time.Second, false},
		{"00:00:00.500", 500 * time.Millisecond, false},
		{" 90 ", 90 * time.Second, false},
		{"", 0, true},
		{"abc", 0, true},
		{"1h2x", 0, true},
		{"1h 2m", 0, true},
		{"5 5", 0, true},
	}
	for _, tc := range tests {
		got, err := ParseDuration(tc.in)
		if tc.bad {
			if err == nil {
				t.Errorf("ParseDuration(%q) = %v, want error", tc.in, got)
			}
			continue
		}
		if err != nil {
			t.Errorf("ParseDuration(%q): %v", tc.in, err)
			continue
		}
		if got != tc.want {
			t.Errorf("ParseDuration(%q) = %v, want %v", tc.in, got, tc.want)
		}
	}
}

func TestFormatDuration(t *testing.T) {
	tests := []struct {
		in   time.Duration
		want string
	}{
		{90 * time.Minute, "1h30m"},
		{49 * time.Hour, "2d1h"},
		{59*time.Minute + 30*time.Second, "59m30s"},
		{45 * time.Second, "45s"},
		{time.Hour + 2*time.Minute + 3*time.Second, "1h2m3s"},
		{500 * time.Millisecond, "1s"},
		{1500 * time.Millisecond, "2s"},
		{0, "1s"},
		{-time.Minute, "1s"},
		{8*24*time.Hour + time.Second, "8d1s"},
	}
	for _, tc := range tests {
		if got := FormatDuration(tc.in); got != tc.want {
			t.Errorf("FormatDuration(%v) = %q, want %q", tc.in, got, tc.want)
		}
	}
	// Round trip.
	for _, d := range []time.Duration{time.Minute, 90 * time.Minute, 49 * time.Hour, 1234 * time.Second} {
		back, err := ParseDuration(FormatDuration(d))
		if err != nil || back != d {
			t.Errorf("round trip %v → %q → %v (%v)", d, FormatDuration(d), back, err)
		}
	}
}

func TestContextCancellation(t *testing.T) {
	_, srv := newMockRouter(t)
	w, _ := newTestWall(t, srv)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := w.Ping(ctx); err == nil || !errors.Is(err, context.Canceled) {
		t.Fatalf("Ping with cancelled ctx = %v", err)
	}
}
