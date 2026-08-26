// Package reward is the pure score→minutes policy (tasks 3-R01..R05, spec
// §7/§10). No I/O, no clocks: the pipeline loads policy + usage and calls
// Decide. STUB — implemented by the Go core agent; types/signatures frozen.
package reward

import "github.com/shafqat/studyrover/backend/internal/contracts"

// Style mirrors contracts.RewardStyle.
type Style string

const (
	StyleFlat   Style = "flat"
	StyleScaled Style = "scaled"
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
func Mapping(ev contracts.ScoreEvent, p Policy) int { return 0 }

// Diminish is 3-R02: multiplier by pass number today when enabled —
// 1st–2nd pass 100%, 3rd 75%, 4th 50%, 5th+ 25% (rounded, min 1 when base>0).
// passesToday counts passes BEFORE this one.
func Diminish(minutes, passesToday int, enabled bool) int { return minutes }

// Cap is 3-R03: clamp so usedToday+minutes ≤ capMinutes (capMinutes ≤ 0 = uncapped).
func Cap(minutes, usedToday, capMinutes int) int { return minutes }

// Decide is 3-R05: Mapping → Diminish → Cap. Pure.
func Decide(ev contracts.ScoreEvent, usage Usage, p Policy) Decision { return Decision{} }
