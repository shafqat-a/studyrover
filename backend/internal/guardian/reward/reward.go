// Package reward is the pure score→minutes policy (tasks 3-R01..R05, spec
// §7/§10). No I/O, no clocks: the pipeline loads policy + usage and calls
// Decide. Everything here is deterministic and side-effect free so it can be
// table-tested exhaustively (reward_test.go) and reasoned about from the
// spec's tables alone.
package reward

import (
	"fmt"
	"math"
	"strings"

	"github.com/shafqat/studyrover/backend/internal/contracts"
)

// Style mirrors contracts.RewardStyle.
type Style string

const (
	StyleFlat   Style = "flat"
	StyleScaled Style = "scaled"
)

// Defaults applied when the corresponding Policy field is zero (spec §10:
// "3 minutes per question", "pass bar ≥ 70%").
const (
	DefaultRateMinPerQ = 3
	DefaultPassBar     = 70
)

// Policy is the effective reward policy (settings + guardian_policy merged).
type Policy struct {
	// RateMinPerQ: minutes of internet per question on a pass (default 3).
	RateMinPerQ int
	// PassBar: percent needed to pass (default 70). ScoreEvent.Passed is
	// authoritative; PassBar is only used by the scaled style's floor.
	PassBar int
	// DailyCapMinutes: total exam-earned minutes per day (0 = no cap).
	DailyCapMinutes int
	Style           Style
	// DiminishingReturns: the Nth pass of the day pays less.
	DiminishingReturns bool
}

// rate is RateMinPerQ with the spec default applied.
func (p Policy) rate() int {
	if p.RateMinPerQ <= 0 {
		return DefaultRateMinPerQ
	}
	return p.RateMinPerQ
}

// passBar is PassBar with the spec default applied.
func (p Policy) passBar() int {
	if p.PassBar <= 0 {
		return DefaultPassBar
	}
	return p.PassBar
}

// Usage is what the student has already earned today (exam grants only).
type Usage struct {
	MinutesToday int
	PassesToday  int
}

// Decision explains the outcome so it can be logged in the inbox.
type Decision struct {
	// Minutes to grant (0 = nothing).
	Minutes int
	// Base is the mapping output before diminishing returns and cap.
	Base int
	// Reason is a short human-readable trace, e.g.
	// "pass 85% × 20q × 3min = 60 → dr(3rd) 45 → cap 30".
	Reason string
}

// Mapping is 3-R01: flat = size×rate on pass; scaled = round(score%×size×rate)
// on pass; 0 on fail. Never negative.
//
// The scaled style floors the percentage at the pass bar: Passed is
// authoritative, so a passing attempt whose ScorePct somehow sits below the
// bar still earns at least PassBar% of the full time (spec §7 "once past the
// pass bar"). For consistent events this is a no-op.
func Mapping(ev contracts.ScoreEvent, p Policy) int {
	if !ev.Passed {
		return 0
	}
	full := max(ev.Size, 0) * p.rate()
	switch p.Style {
	case StyleScaled:
		pct := scaledPct(ev.ScorePct, p)
		return int(math.Round(float64(pct) / 100 * float64(full)))
	default: // flat is the v1 default, also for an unset style
		return full
	}
}

// scaledPct is the percentage the scaled style pays: the score clamped to
// [passBar, 100].
func scaledPct(scorePct int, p Policy) int {
	return min(max(scorePct, p.passBar()), 100)
}

// Diminish is 3-R02: multiplier by pass number today when enabled —
// 1st–2nd pass 100%, 3rd 75%, 4th 50%, 5th+ 25% (rounded, min 1 when base>0).
// passesToday counts passes BEFORE this one.
func Diminish(minutes, passesToday int, enabled bool) int {
	if minutes <= 0 {
		return 0
	}
	pct := diminishPct(passesToday, enabled)
	if pct == 100 {
		return minutes
	}
	out := int(math.Round(float64(minutes) * float64(pct) / 100))
	return max(out, 1)
}

// diminishPct is the percentage the (passesToday+1)th pass of the day pays.
func diminishPct(passesToday int, enabled bool) int {
	if !enabled {
		return 100
	}
	switch {
	case passesToday < 2:
		return 100
	case passesToday == 2:
		return 75
	case passesToday == 3:
		return 50
	default:
		return 25
	}
}

// Cap is 3-R03: clamp so usedToday+minutes ≤ capMinutes (capMinutes ≤ 0 = uncapped).
func Cap(minutes, usedToday, capMinutes int) int {
	minutes = max(minutes, 0)
	if capMinutes <= 0 {
		return minutes
	}
	return max(0, min(minutes, capMinutes-max(usedToday, 0)))
}

// Decide is 3-R05: Mapping → Diminish → Cap. Pure.
//
// Reason is a compact trace with every number that mattered, for example
// "pass 85% · 20q × 3min = 60 → 3rd pass ×0.75 = 45 → cap 180-150 = 30".
// A step that changed nothing (diminishing returns off, cap not reached)
// is omitted from the trace.
func Decide(ev contracts.ScoreEvent, usage Usage, p Policy) Decision {
	if !ev.Passed {
		return Decision{Reason: fmt.Sprintf("fail %d%% (no time)", ev.ScorePct)}
	}

	base := Mapping(ev, p)
	var b strings.Builder
	size := max(ev.Size, 0)
	if p.Style == StyleScaled {
		fmt.Fprintf(&b, "pass %d%% · %d%% × %dq × %dmin = %d", ev.ScorePct, scaledPct(ev.ScorePct, p), size, p.rate(), base)
	} else {
		fmt.Fprintf(&b, "pass %d%% · %dq × %dmin = %d", ev.ScorePct, size, p.rate(), base)
	}

	minutes := base
	if pct := diminishPct(usage.PassesToday, p.DiminishingReturns); pct != 100 {
		minutes = Diminish(minutes, usage.PassesToday, true)
		fmt.Fprintf(&b, " → %s pass ×%.2f = %d", ordinal(usage.PassesToday+1), float64(pct)/100, minutes)
	}
	if p.DailyCapMinutes > 0 {
		capped := Cap(minutes, usage.MinutesToday, p.DailyCapMinutes)
		if capped != minutes {
			fmt.Fprintf(&b, " → cap %d-%d = %d", p.DailyCapMinutes, usage.MinutesToday, capped)
			minutes = capped
		}
	}
	return Decision{Minutes: minutes, Base: base, Reason: b.String()}
}

// ordinal renders 1 → "1st", 2 → "2nd", 3 → "3rd", 4 → "4th", 11 → "11th".
func ordinal(n int) string {
	suffix := "th"
	switch {
	case n%100 >= 11 && n%100 <= 13:
	case n%10 == 1:
		suffix = "st"
	case n%10 == 2:
		suffix = "nd"
	case n%10 == 3:
		suffix = "rd"
	}
	return fmt.Sprintf("%d%s", n, suffix)
}
