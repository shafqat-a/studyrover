package core

import "time"

// CooldownUntil returns the instant at which a new attempt becomes allowed after
// a failed attempt: now plus cooldownMin minutes. A non-positive cooldownMin
// yields now (no cooldown). CooldownUntil is pure.
func CooldownUntil(now time.Time, cooldownMin int) time.Time {
	if cooldownMin <= 0 {
		return now
	}
	return now.Add(time.Duration(cooldownMin) * time.Minute)
}

// IsInCooldown reports whether now falls strictly before until, i.e. whether a
// cooldown that ends at until is still in effect. At the exact boundary
// (now == until) the cooldown has elapsed and this returns false. IsInCooldown
// is pure.
func IsInCooldown(until, now time.Time) bool {
	return now.Before(until)
}
