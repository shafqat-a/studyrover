// Package wall defines the swappable Network Wall (tasks 3-F03,
// CONTRACTS-P3 "Network Wall adapter"). Implementations: fake (in-memory) and
// routeros (MikroTik RouterOS v7 REST). MAC is the primary key everywhere.
package wall

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"time"
)

// Kind names an implementation; mirrors contracts.WallKind.
type Kind string

const (
	KindFake     Kind = "fake"
	KindRouterOS Kind = "routeros"
)

// ErrNotFound is returned by Revoke when the MAC has no open grant on the wall.
var ErrNotFound = errors.New("wall: no active grant for mac")

// DiscoveredDevice is a host the wall can currently see on the network.
type DiscoveredDevice struct {
	MAC      string
	IP       string
	Hostname string
}

// ActiveGrant is an open internet grant as the wall sees it.
type ActiveGrant struct {
	MAC       string
	IP        string
	ExpiresAt time.Time
	// Ref is the wall's own handle for the grant (e.g. RouterOS ".id"); empty
	// for wall implementations that key purely on MAC.
	Ref string
}

// Remaining is the time left on the grant at now (never negative).
func (g ActiveGrant) Remaining(now time.Time) time.Duration {
	if d := g.ExpiresAt.Sub(now); d > 0 {
		return d
	}
	return 0
}

// Wall opens and closes internet access for specific devices. All methods must
// be safe for concurrent use. Grant on a MAC that already has an open grant
// REPLACES it (new expiry), and returns the wall's handle for it.
type Wall interface {
	// Kind reports which implementation this is.
	Kind() Kind
	// Grant opens internet for mac until now+d and returns the wall handle.
	Grant(ctx context.Context, mac string, d time.Duration) (ref string, err error)
	// Revoke closes internet for mac immediately. ErrNotFound when not open.
	Revoke(ctx context.Context, mac string) error
	// ListActive returns every grant currently open on the wall.
	ListActive(ctx context.Context) ([]ActiveGrant, error)
	// Discover lists hosts visible on the network (ARP/DHCP/hotspot hosts).
	Discover(ctx context.Context) ([]DiscoveredDevice, error)
	// Ping checks connectivity/credentials; nil when healthy.
	Ping(ctx context.Context) error
	// Gate installs (gated=true) or removes (gated=false) the per-device rule
	// that blocks mac's internet unless it holds an open grant. The household
	// is allow-by-default: only gated MACs are ever blocked (spec §11).
	// Idempotent.
	Gate(ctx context.Context, mac string, gated bool) error
}

var macRe = regexp.MustCompile(`^([0-9a-f]{2}:){5}[0-9a-f]{2}$`)

// NormalizeMAC accepts the common MAC spellings (AA-BB-CC-DD-EE-FF,
// aabb.ccdd.eeff, AABBCCDDEEFF, aa:bb:cc:dd:ee:ff) and returns the canonical
// lower-case colon form used as the primary key everywhere in the Guardian.
func NormalizeMAC(s string) (string, error) {
	hex := strings.ToLower(strings.NewReplacer(":", "", "-", "", ".", "", " ", "").Replace(strings.TrimSpace(s)))
	if len(hex) != 12 {
		return "", errors.New("wall: invalid mac address")
	}
	parts := make([]string, 0, 6)
	for i := 0; i < 12; i += 2 {
		parts = append(parts, hex[i:i+2])
	}
	out := strings.Join(parts, ":")
	if !macRe.MatchString(out) {
		return "", errors.New("wall: invalid mac address")
	}
	return out, nil
}
