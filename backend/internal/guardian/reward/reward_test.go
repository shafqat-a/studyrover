package reward

import (
	"strings"
	"testing"

	"github.com/shafqat/studyrover/backend/internal/contracts"
)

func ev(size, pct int, passed bool) contracts.ScoreEvent {
	return contracts.ScoreEvent{Size: size, ScorePct: pct, Passed: passed}
}

// TestMapping covers 3-R01: the spec §7 table, scaled, fail and defaults.
func TestMapping(t *testing.T) {
	tests := []struct {
		name string
		ev   contracts.ScoreEvent
		p    Policy
		want int
	}{
		// spec §7 table (flat, 3 min/q)
		{"flat 5q → 15", ev(5, 80, true), Policy{RateMinPerQ: 3, Style: StyleFlat}, 15},
		{"flat 10q → 30", ev(10, 80, true), Policy{RateMinPerQ: 3, Style: StyleFlat}, 30},
		{"flat 20q → 60", ev(20, 70, true), Policy{RateMinPerQ: 3, Style: StyleFlat}, 60},
		{"flat 100% still full time", ev(20, 100, true), Policy{RateMinPerQ: 3, Style: StyleFlat}, 60},
		{"flat custom rate", ev(10, 90, true), Policy{RateMinPerQ: 5, Style: StyleFlat}, 50},
		// zero-policy defaults: rate 3, flat
		{"zero policy defaults to flat 3/q", ev(20, 85, true), Policy{}, 60},
		// scaled = round(score% × size × rate)
		{"scaled 85% of 60 → 51", ev(20, 85, true), Policy{Style: StyleScaled}, 51},
		{"scaled 100% → full", ev(20, 100, true), Policy{Style: StyleScaled}, 60},
		{"scaled 70% of 15 → 10.5 rounds to 11", ev(5, 70, true), Policy{Style: StyleScaled}, 11},
		{"scaled 75% of 30 → 22.5 rounds to 23", ev(10, 75, true), Policy{Style: StyleScaled}, 23},
		{"scaled floors at pass bar when Passed", ev(20, 50, true), Policy{Style: StyleScaled, PassBar: 70}, 42},
		{"scaled clamps >100", ev(20, 120, true), Policy{Style: StyleScaled}, 60},
		// fail → 0 regardless of style
		{"fail flat → 0", ev(20, 55, false), Policy{Style: StyleFlat}, 0},
		{"fail scaled → 0", ev(20, 55, false), Policy{Style: StyleScaled}, 0},
		// never negative
		{"negative size → 0", ev(-5, 80, true), Policy{}, 0},
		{"zero size → 0", ev(0, 80, true), Policy{}, 0},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := Mapping(tc.ev, tc.p); got != tc.want {
				t.Fatalf("Mapping = %d, want %d", got, tc.want)
			}
		})
	}
}

// TestDiminish covers 3-R02: the DR sequence for a 60-minute base.
func TestDiminish(t *testing.T) {
	tests := []struct {
		name        string
		minutes     int
		passesToday int
		enabled     bool
		want        int
	}{
		{"1st pass 100%", 60, 0, true, 60},
		{"2nd pass 100%", 60, 1, true, 60},
		{"3rd pass 75%", 60, 2, true, 45},
		{"4th pass 50%", 60, 3, true, 30},
		{"5th pass 25%", 60, 4, true, 15},
		{"6th pass 25%", 60, 5, true, 15},
		{"10th pass 25%", 60, 9, true, 15},
		{"disabled → unchanged", 60, 4, false, 60},
		{"rounds to nearest (15 × 0.75 = 11.25 → 11)", 15, 2, true, 11},
		{"rounds half up (30 × 0.75 = 22.5 → 23)", 30, 2, true, 23},
		{"min 1 when base > 0", 1, 4, true, 1},
		{"min 1 for tiny base", 2, 4, true, 1},
		{"zero base stays 0", 0, 4, true, 0},
		{"negative base → 0", -5, 0, true, 0},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := Diminish(tc.minutes, tc.passesToday, tc.enabled); got != tc.want {
				t.Fatalf("Diminish = %d, want %d", got, tc.want)
			}
		})
	}
}

// TestCap covers 3-R03: cap boundaries.
func TestCap(t *testing.T) {
	tests := []struct {
		name                   string
		minutes, used, capMins int
		want                   int
	}{
		{"uncapped when cap 0", 60, 500, 0, 60},
		{"uncapped when cap negative", 60, 500, -1, 60},
		{"under cap → unchanged", 60, 60, 180, 60},
		{"exactly reaches cap", 60, 120, 180, 60},
		{"partially clamped", 60, 150, 180, 30},
		{"at cap → 0", 60, 180, 180, 0},
		{"over cap → 0 (never negative)", 60, 200, 180, 0},
		{"negative minutes → 0", -10, 0, 180, 0},
		{"negative used treated as 0", 60, -30, 180, 60},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := Cap(tc.minutes, tc.used, tc.capMins); got != tc.want {
				t.Fatalf("Cap = %d, want %d", got, tc.want)
			}
		})
	}
}

// TestDecide covers 3-R05: composition and the reason trace.
func TestDecide(t *testing.T) {
	std := Policy{RateMinPerQ: 3, PassBar: 70, DailyCapMinutes: 180, Style: StyleFlat, DiminishingReturns: true}

	tests := []struct {
		name       string
		ev         contracts.ScoreEvent
		usage      Usage
		p          Policy
		want       Decision
		reasonHas  []string
		reasonLack []string
	}{
		{
			name:  "fail earns nothing",
			ev:    ev(20, 55, false),
			usage: Usage{MinutesToday: 0, PassesToday: 0},
			p:     std,
			want:  Decision{Minutes: 0, Base: 0, Reason: "fail 55% (no time)"},
		},
		{
			name:      "first pass full time",
			ev:        ev(20, 85, true),
			usage:     Usage{},
			p:         std,
			want:      Decision{Minutes: 60, Base: 60, Reason: "pass 85% · 20q × 3min = 60"},
			reasonHas: []string{"85%", "20q", "3min", "60"},
		},
		{
			name:      "third pass diminished",
			ev:        ev(20, 85, true),
			usage:     Usage{MinutesToday: 120, PassesToday: 2},
			p:         std,
			want:      Decision{Minutes: 45, Base: 60, Reason: "pass 85% · 20q × 3min = 60 → 3rd pass ×0.75 = 45"},
			reasonHas: []string{"3rd", "0.75", "45"},
		},
		{
			name:      "third pass diminished then capped",
			ev:        ev(20, 85, true),
			usage:     Usage{MinutesToday: 150, PassesToday: 2},
			p:         std,
			want:      Decision{Minutes: 30, Base: 60, Reason: "pass 85% · 20q × 3min = 60 → 3rd pass ×0.75 = 45 → cap 180-150 = 30"},
			reasonHas: []string{"cap 180-150", "30"},
		},
		{
			name:      "cap exhausted → 0 minutes but still a pass",
			ev:        ev(5, 100, true),
			usage:     Usage{MinutesToday: 180, PassesToday: 1},
			p:         std,
			want:      Decision{Minutes: 0, Base: 15, Reason: "pass 100% · 5q × 3min = 15 → cap 180-180 = 0"},
			reasonHas: []string{"cap 180-180 = 0"},
		},
		{
			name:       "diminishing off leaves trace untouched",
			ev:         ev(20, 85, true),
			usage:      Usage{MinutesToday: 0, PassesToday: 6},
			p:          Policy{RateMinPerQ: 3, DailyCapMinutes: 180},
			want:       Decision{Minutes: 60, Base: 60, Reason: "pass 85% · 20q × 3min = 60"},
			reasonLack: []string{"pass ×"},
		},
		{
			name:      "scaled style shows the percentage",
			ev:        ev(20, 85, true),
			usage:     Usage{},
			p:         Policy{Style: StyleScaled},
			want:      Decision{Minutes: 51, Base: 51, Reason: "pass 85% · 85% × 20q × 3min = 51"},
			reasonHas: []string{"85% × 20q"},
		},
		{
			name:  "zero policy: defaults, uncapped, no DR",
			ev:    ev(10, 70, true),
			usage: Usage{MinutesToday: 1000, PassesToday: 9},
			p:     Policy{},
			want:  Decision{Minutes: 30, Base: 30, Reason: "pass 70% · 10q × 3min = 30"},
		},
		{
			name:  "fifth pass with cap: DR before cap",
			ev:    ev(20, 90, true),
			usage: Usage{MinutesToday: 170, PassesToday: 4},
			p:     std,
			want:  Decision{Minutes: 10, Base: 60, Reason: "pass 90% · 20q × 3min = 60 → 5th pass ×0.25 = 15 → cap 180-170 = 10"},
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := Decide(tc.ev, tc.usage, tc.p)
			if got != tc.want {
				t.Fatalf("Decide = %+v, want %+v", got, tc.want)
			}
			for _, s := range tc.reasonHas {
				if !strings.Contains(got.Reason, s) {
					t.Errorf("Reason %q lacks %q", got.Reason, s)
				}
			}
			for _, s := range tc.reasonLack {
				if strings.Contains(got.Reason, s) {
					t.Errorf("Reason %q should not contain %q", got.Reason, s)
				}
			}
		})
	}
}

// TestDRSequence walks a whole day of 20-question passes through Decide,
// accumulating usage the way the ingest pipeline would.
func TestDRSequence(t *testing.T) {
	p := Policy{RateMinPerQ: 3, PassBar: 70, DailyCapMinutes: 0, Style: StyleFlat, DiminishingReturns: true}
	want := []int{60, 60, 45, 30, 15, 15}
	var u Usage
	for i, w := range want {
		d := Decide(ev(20, 80, true), u, p)
		if d.Minutes != w {
			t.Fatalf("pass #%d: got %d minutes, want %d (reason %q)", i+1, d.Minutes, w, d.Reason)
		}
		u.MinutesToday += d.Minutes
		u.PassesToday++
	}
	if u.MinutesToday != 225 {
		t.Fatalf("day total = %d, want 225", u.MinutesToday)
	}
}

func TestOrdinal(t *testing.T) {
	cases := map[int]string{1: "1st", 2: "2nd", 3: "3rd", 4: "4th", 11: "11th", 12: "12th", 13: "13th", 21: "21st", 22: "22nd", 23: "23rd", 101: "101st", 111: "111th"}
	for n, want := range cases {
		if got := ordinal(n); got != want {
			t.Errorf("ordinal(%d) = %q, want %q", n, got, want)
		}
	}
}
