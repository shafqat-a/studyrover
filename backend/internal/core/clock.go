package core

import "time"

// Clock supplies the current time to core functions that need it (for example
// L06 CooldownUntil and L11 BuildScoreEvent). Core code never calls time.Now
// directly; instead it accepts a Clock so that "now" is injectable and tests are
// deterministic.
type Clock interface {
	// Now returns the current time.
	Now() time.Time
}

// ClockFunc adapts an ordinary func() time.Time into a Clock.
type ClockFunc func() time.Time

// Now calls the underlying function.
func (f ClockFunc) Now() time.Time { return f() }

// SystemClock is a Clock backed by the real wall clock (time.Now). Use it in
// production wiring; use FixedClock in tests.
var SystemClock Clock = ClockFunc(time.Now)

// FixedClock returns a Clock that always reports t. It is intended for tests
// that need a stable, reproducible notion of "now".
func FixedClock(t time.Time) Clock {
	return ClockFunc(func() time.Time { return t })
}
