// Package routeros implements Wall against the MikroTik RouterOS v7 REST API
// (task 3-F04, spec §11). See doc.go for the enforcement mechanism and the
// router prerequisites.
package routeros

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/shafqat/studyrover/backend/internal/guardian/wall"
)

// Router-side names. Everything StudyRover creates on the router carries
// CommentPrefix+mac so it can be found, replaced and removed by comment
// (the RouterOS "comment-as-tag" idiom for idempotent automation).
const (
	// AddressList is the /ip/firewall/address-list that holds the IPs with an
	// open grant. The per-device gate rule matches src-address-list=!AddressList.
	AddressList = "studyrover-online"
	// CommentPrefix tags every rule/entry StudyRover owns: "studyrover:<mac>".
	CommentPrefix = "studyrover:"

	defaultTimeout = 10 * time.Second

	pathFilter      = "ip/firewall/filter"
	pathAddressList = "ip/firewall/address-list"
	pathLease       = "ip/dhcp-server/lease"
	pathARP         = "ip/arp"
	pathResource    = "system/resource"

	// permanentHorizon stands in for the expiry of an address-list entry that
	// has no timeout (which StudyRover never creates, but a human might).
	permanentHorizon = 100 * 365 * 24 * time.Hour
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
type Wall struct {
	cfg  Config
	http *http.Client
	base string           // cfg.BaseURL + "/rest"
	now  func() time.Time // clock (tests override)
}

// New validates cfg and returns a wall. It does not contact the router; use
// Ping for that.
func New(cfg Config) (*Wall, error) {
	if cfg.BaseURL == "" || cfg.User == "" {
		return nil, errors.New("routeros: BaseURL and User are required")
	}
	u, err := url.Parse(cfg.BaseURL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return nil, fmt.Errorf("routeros: BaseURL %q must be http(s)://host[:port]", cfg.BaseURL)
	}
	client := cfg.HTTPClient
	if client == nil {
		timeout := cfg.Timeout
		if timeout <= 0 {
			timeout = defaultTimeout
		}
		transport := http.DefaultTransport.(*http.Transport).Clone()
		if cfg.InsecureTLS {
			transport.TLSClientConfig = &tls.Config{InsecureSkipVerify: true} //nolint:gosec // opt-in for self-signed router certs
		}
		client = &http.Client{Timeout: timeout, Transport: transport}
	}
	return &Wall{
		cfg:  cfg,
		http: client,
		base: strings.TrimRight(cfg.BaseURL, "/") + "/rest",
		now:  time.Now,
	}, nil
}

// Error is a non-2xx answer from the router, carrying RouterOS's own
// "message"/"detail" fields when it sent JSON.
type Error struct {
	Method  string
	Path    string
	Status  int
	Message string
	Detail  string
}

func (e *Error) Error() string {
	var b strings.Builder
	fmt.Fprintf(&b, "routeros: %s %s: %d %s", e.Method, e.Path, e.Status, http.StatusText(e.Status))
	if e.Message != "" {
		fmt.Fprintf(&b, ": %s", e.Message)
	}
	if e.Detail != "" {
		fmt.Fprintf(&b, " (%s)", e.Detail)
	}
	return b.String()
}

func (w *Wall) Kind() wall.Kind { return wall.KindRouterOS }

// Grant resolves mac's current IP (DHCP lease, then ARP) and puts it on the
// online address-list with timeout=d, replacing any earlier entry for the
// same MAC. The returned ref is the entry's ".id". A device with no IP is
// offline and cannot be granted.
func (w *Wall) Grant(ctx context.Context, mac string, d time.Duration) (string, error) {
	mac, err := wall.NormalizeMAC(mac)
	if err != nil {
		return "", err
	}
	if d <= 0 {
		return "", fmt.Errorf("routeros: grant for %s: duration must be positive, got %v", mac, d)
	}
	ip, err := w.resolveIP(ctx, mac)
	if err != nil {
		return "", err
	}
	if ip == "" {
		return "", fmt.Errorf("routeros: grant for %s: no dhcp lease or arp entry — the device is offline", mac)
	}
	// Replace semantics: drop whatever entry the MAC already has.
	existing, err := w.ownedEntries(ctx, pathAddressList, mac, url.Values{"list": {AddressList}})
	if err != nil {
		return "", err
	}
	for _, e := range existing {
		if err := w.remove(ctx, pathAddressList, e.id()); err != nil {
			return "", err
		}
	}
	var created record
	body := map[string]string{
		"list":    AddressList,
		"address": ip,
		"timeout": FormatDuration(d),
		"comment": CommentPrefix + mac,
	}
	if err := w.do(ctx, http.MethodPut, pathAddressList, nil, body, &created); err != nil {
		return "", err
	}
	return created.id(), nil
}

// Revoke deletes mac's address-list entries; wall.ErrNotFound when it has none.
func (w *Wall) Revoke(ctx context.Context, mac string) error {
	mac, err := wall.NormalizeMAC(mac)
	if err != nil {
		return err
	}
	entries, err := w.ownedEntries(ctx, pathAddressList, mac, url.Values{"list": {AddressList}})
	if err != nil {
		return err
	}
	if len(entries) == 0 {
		return wall.ErrNotFound
	}
	for _, e := range entries {
		if err := w.remove(ctx, pathAddressList, e.id()); err != nil {
			return err
		}
	}
	return nil
}

// ListActive reads the online address-list. Only StudyRover-tagged entries
// are reported; the remaining "timeout" becomes ExpiresAt.
func (w *Wall) ListActive(ctx context.Context) ([]wall.ActiveGrant, error) {
	entries, err := w.list(ctx, pathAddressList, url.Values{"list": {AddressList}})
	if err != nil {
		return nil, err
	}
	now := w.now()
	out := make([]wall.ActiveGrant, 0, len(entries))
	for _, e := range entries {
		if e.get("list") != AddressList {
			continue
		}
		mac, ok := macFromComment(e.get("comment"))
		if !ok {
			continue
		}
		expires := now.Add(permanentHorizon)
		if raw := e.get("timeout"); raw != "" {
			if d, err := ParseDuration(raw); err == nil {
				expires = now.Add(d)
			}
		}
		out = append(out, wall.ActiveGrant{MAC: mac, IP: e.get("address"), ExpiresAt: expires, Ref: e.id()})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].MAC < out[j].MAC })
	return out, nil
}

// Discover unions the DHCP leases and the ARP table, keyed by MAC (lease
// wins; ARP fills in hosts with static IPs).
func (w *Wall) Discover(ctx context.Context) ([]wall.DiscoveredDevice, error) {
	leases, err := w.list(ctx, pathLease, nil)
	if err != nil {
		return nil, err
	}
	arps, err := w.list(ctx, pathARP, nil)
	if err != nil {
		return nil, err
	}
	byMAC := map[string]wall.DiscoveredDevice{}
	for _, l := range leases {
		mac, err := wall.NormalizeMAC(l.get("mac-address"))
		if err != nil {
			continue
		}
		d := byMAC[mac]
		d.MAC = mac
		if ip := leaseIP(l); ip != "" && d.IP == "" {
			d.IP = ip
		}
		if h := l.get("host-name"); h != "" && d.Hostname == "" {
			d.Hostname = h
		}
		byMAC[mac] = d
	}
	for _, a := range arps {
		mac, err := wall.NormalizeMAC(a.get("mac-address"))
		if err != nil {
			continue
		}
		d := byMAC[mac]
		d.MAC = mac
		if ip := a.get("address"); ip != "" && d.IP == "" {
			d.IP = ip
		}
		byMAC[mac] = d
	}
	out := make([]wall.DiscoveredDevice, 0, len(byMAC))
	for _, d := range byMAC {
		out = append(out, d)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].MAC < out[j].MAC })
	return out, nil
}

// Ping fetches /system/resource; any transport, auth or HTTP failure is the error.
func (w *Wall) Ping(ctx context.Context) error {
	var res record
	if err := w.do(ctx, http.MethodGet, pathResource, nil, nil, &res); err != nil {
		return err
	}
	return nil
}

// Gate installs (true) or removes (false) the per-device forward-chain drop
// rule "src-mac-address=<mac> src-address-list=!studyrover-online". The rule
// is inserted at the top of the forward chain so it also cuts established
// flows the moment a grant expires. Idempotent by comment lookup.
func (w *Wall) Gate(ctx context.Context, mac string, gated bool) error {
	mac, err := wall.NormalizeMAC(mac)
	if err != nil {
		return err
	}
	rules, err := w.ownedEntries(ctx, pathFilter, mac, nil)
	if err != nil {
		return err
	}
	if !gated {
		for _, r := range rules {
			if err := w.remove(ctx, pathFilter, r.id()); err != nil {
				return err
			}
		}
		return nil
	}
	if len(rules) > 0 {
		return nil
	}
	body := map[string]string{
		"chain":            "forward",
		"src-mac-address":  strings.ToUpper(mac),
		"src-address-list": "!" + AddressList,
		"action":           "drop",
		"comment":          CommentPrefix + mac,
	}
	if first, err := w.firstForwardRuleID(ctx); err != nil {
		return err
	} else if first != "" {
		// PUT appends; place-before puts the gate ahead of the household's
		// accept rules (there is no "move" over REST).
		body["place-before"] = first
	}
	return w.do(ctx, http.MethodPut, pathFilter, nil, body, nil)
}

// firstForwardRuleID is the ".id" of the first static forward-chain rule, or
// "" when the chain is empty (then a plain append is already the top).
func (w *Wall) firstForwardRuleID(ctx context.Context) (string, error) {
	rules, err := w.list(ctx, pathFilter, url.Values{"chain": {"forward"}, ".proplist": {".id,chain,dynamic"}})
	if err != nil {
		return "", err
	}
	for _, r := range rules {
		if r.get("chain") == "forward" && r.get("dynamic") != "true" && r.id() != "" {
			return r.id(), nil
		}
	}
	return "", nil
}

// resolveIP finds mac's current IPv4: an active DHCP lease first, then ARP.
// "" means the router cannot see the device.
func (w *Wall) resolveIP(ctx context.Context, mac string) (string, error) {
	leases, err := w.list(ctx, pathLease, nil)
	if err != nil {
		return "", err
	}
	for _, l := range leases {
		if got, err := wall.NormalizeMAC(l.get("mac-address")); err != nil || got != mac {
			continue
		}
		if l.get("disabled") == "true" {
			continue
		}
		if ip := leaseIP(l); ip != "" {
			return ip, nil
		}
	}
	arps, err := w.list(ctx, pathARP, nil)
	if err != nil {
		return "", err
	}
	for _, a := range arps {
		if got, err := wall.NormalizeMAC(a.get("mac-address")); err != nil || got != mac {
			continue
		}
		if a.get("invalid") == "true" {
			continue
		}
		if ip := a.get("address"); ip != "" {
			return ip, nil
		}
	}
	return "", nil
}

// leaseIP prefers the lease's active-address (what the client really holds)
// over the configured address.
func leaseIP(l record) string {
	if ip := l.get("active-address"); ip != "" {
		return ip
	}
	return l.get("address")
}

// ownedEntries lists the rows at path tagged with mac's comment. The comment
// is sent as a query filter and re-checked client-side, so the result is
// exact even if the router ignores the filter.
func (w *Wall) ownedEntries(ctx context.Context, path, mac string, extra url.Values) ([]record, error) {
	comment := CommentPrefix + mac
	q := url.Values{"comment": {comment}}
	for k, v := range extra {
		q[k] = v
	}
	rows, err := w.list(ctx, path, q)
	if err != nil {
		return nil, err
	}
	out := rows[:0]
	for _, r := range rows {
		if r.get("comment") == comment {
			out = append(out, r)
		}
	}
	return out, nil
}

// macFromComment extracts the normalized MAC from a "studyrover:<mac>" tag.
func macFromComment(comment string) (string, bool) {
	if !strings.HasPrefix(comment, CommentPrefix) {
		return "", false
	}
	mac, err := wall.NormalizeMAC(strings.TrimPrefix(comment, CommentPrefix))
	if err != nil {
		return "", false
	}
	return mac, true
}

// record is one RouterOS object. REST renders every value as a string, but
// the accessor tolerates numbers/bools in case a firmware serialises them.
type record map[string]any

func (r record) get(key string) string {
	switch v := r[key].(type) {
	case nil:
		return ""
	case string:
		return v
	case bool:
		return strconv.FormatBool(v)
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	default:
		return fmt.Sprint(v)
	}
}

func (r record) id() string { return r.get(".id") }

// list GETs a table with optional ?field=value filters.
func (w *Wall) list(ctx context.Context, path string, q url.Values) ([]record, error) {
	var rows []record
	if err := w.do(ctx, http.MethodGet, path, q, nil, &rows); err != nil {
		return nil, err
	}
	return rows, nil
}

var idRe = regexp.MustCompile(`^\*[0-9A-Fa-f]+$`)

// remove DELETEs one object by ".id".
func (w *Wall) remove(ctx context.Context, path, id string) error {
	if !idRe.MatchString(id) {
		return fmt.Errorf("routeros: refusing to delete %s with malformed id %q", path, id)
	}
	return w.do(ctx, http.MethodDelete, path+"/"+id, nil, nil, nil)
}

// do performs one REST call: Basic auth, JSON in/out, RouterOS error mapping.
func (w *Wall) do(ctx context.Context, method, path string, q url.Values, body, out any) error {
	u := w.base + "/" + path
	if len(q) > 0 {
		u += "?" + q.Encode()
	}
	var payload io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("routeros: encode %s %s: %w", method, path, err)
		}
		payload = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, u, payload)
	if err != nil {
		return fmt.Errorf("routeros: %s %s: %w", method, path, err)
	}
	req.SetBasicAuth(w.cfg.User, w.cfg.Password)
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := w.http.Do(req)
	if err != nil {
		return fmt.Errorf("routeros: %s %s: %w", method, path, err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return fmt.Errorf("routeros: %s %s: read body: %w", method, path, err)
	}
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		e := &Error{Method: method, Path: path, Status: resp.StatusCode}
		var detail struct {
			Message string `json:"message"`
			Detail  string `json:"detail"`
		}
		if json.Unmarshal(raw, &detail) == nil {
			e.Message, e.Detail = detail.Message, detail.Detail
		} else if s := strings.TrimSpace(string(raw)); s != "" && len(s) < 200 {
			e.Message = s
		}
		return e
	}
	if out == nil || len(bytes.TrimSpace(raw)) == 0 {
		return nil
	}
	if err := json.Unmarshal(raw, out); err != nil {
		return fmt.Errorf("routeros: %s %s: decode response: %w", method, path, err)
	}
	return nil
}

// FormatDuration renders d the way RouterOS reads time values ("2d1h",
// "1h30m", "59m30s", "45s"). Sub-second remainders round up; the result is
// never shorter than 1s because a missing/zero timeout would make the
// address-list entry permanent.
func FormatDuration(d time.Duration) string {
	secs := int64((d + time.Second - 1) / time.Second)
	if secs < 1 {
		secs = 1
	}
	var b strings.Builder
	for _, u := range []struct {
		name string
		secs int64
	}{{"d", 86400}, {"h", 3600}, {"m", 60}, {"s", 1}} {
		if n := secs / u.secs; n > 0 {
			fmt.Fprintf(&b, "%d%s", n, u.name)
			secs -= n * u.secs
		}
	}
	return b.String()
}

var (
	unitsRe = regexp.MustCompile(`^(\d+(?:\.\d+)?)(ms|us|w|d|h|m|s)?`)
	clockRe = regexp.MustCompile(`^(?:(\d+)w)?(?:(\d+)d)?(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?$`)
)

// ParseDuration reads the time formats RouterOS prints: unit form
// ("59m30s", "1h2m3s", "2d1h", "1w"), clock form ("1d02:03:04", "00:05:00")
// and a bare number of seconds.
func ParseDuration(s string) (time.Duration, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, errors.New("routeros: empty duration")
	}
	if m := clockRe.FindStringSubmatch(s); m != nil {
		var d time.Duration
		for i, unit := range []time.Duration{7 * 24 * time.Hour, 24 * time.Hour, time.Hour, time.Minute, time.Second} {
			if m[i+1] == "" {
				continue
			}
			n, err := strconv.Atoi(m[i+1])
			if err != nil {
				return 0, fmt.Errorf("routeros: bad duration %q", s)
			}
			d += time.Duration(n) * unit
		}
		if m[6] != "" {
			frac, err := strconv.ParseFloat("0."+m[6], 64)
			if err != nil {
				return 0, fmt.Errorf("routeros: bad duration %q", s)
			}
			d += time.Duration(frac * float64(time.Second))
		}
		return d, nil
	}
	units := map[string]time.Duration{
		"w": 7 * 24 * time.Hour, "d": 24 * time.Hour, "h": time.Hour,
		"m": time.Minute, "s": time.Second, "ms": time.Millisecond, "us": time.Microsecond,
	}
	rest := s
	var d time.Duration
	for rest != "" {
		m := unitsRe.FindStringSubmatch(rest)
		if m == nil {
			return 0, fmt.Errorf("routeros: bad duration %q", s)
		}
		n, err := strconv.ParseFloat(m[1], 64)
		if err != nil {
			return 0, fmt.Errorf("routeros: bad duration %q", s)
		}
		unit := time.Second // bare number = seconds
		if m[2] != "" {
			unit = units[m[2]]
		} else if rest != s || len(m[0]) != len(rest) {
			// a unit-less number is only valid when it is the whole string
			return 0, fmt.Errorf("routeros: bad duration %q", s)
		}
		d += time.Duration(n * float64(unit))
		rest = rest[len(m[0]):]
	}
	return d, nil
}

var _ wall.Wall = (*Wall)(nil)
