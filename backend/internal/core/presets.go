package core

// SizePresets are the exam sizes offered as quick choices in the authoring and
// start-exam UIs (spec §6). They are suggestions only; any size >= 1 is valid.
var SizePresets = []int{5, 10, 20}

// MinutesForSize returns the display-only earned-time estimate for an exam of
// the given size at rateMinPerQ minutes per question: size*rateMinPerQ.
//
// This is purely informational (shown by the Student UI when the Guardian is on)
// and is NOT the reward calculation — that logic lives in the Phase 3 Guardian.
// Negative inputs are treated as zero. MinutesForSize is pure.
func MinutesForSize(size, rateMinPerQ int) int {
	if size < 0 || rateMinPerQ < 0 {
		return 0
	}
	return size * rateMinPerQ
}
