package core

// DidPass reports whether a percentage score meets or exceeds the pass bar.
//
// Both values are integer percentages in the range 0–100. A score exactly equal
// to passBar is a pass. DidPass is pure: it performs no I/O and has no side
// effects.
func DidPass(scorePct, passBar int) bool {
	return scorePct >= passBar
}
