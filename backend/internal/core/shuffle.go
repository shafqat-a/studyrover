package core

import "github.com/shafqat/studyrover/backend/internal/contracts"

// ShuffleOptions returns a copy of q with its answer options reordered using a
// Fisher–Yates shuffle driven by rng (L05, spec §6). Randomising the option
// order on delivery is the anti-guessing measure: the position of the correct
// answer carries no information across attempts.
//
// Option ids are preserved exactly — only the slice order changes — so grading,
// which matches on Question.CorrectOptionId, is unaffected. The input q is not
// mutated: a fresh options slice is allocated and the original is left intact,
// honouring the package's no-mutation rule.
func ShuffleOptions(q contracts.Question, rng RNG) contracts.Question {
	// Copy the options into a new backing array so the caller's slice is never
	// reordered in place.
	shuffled := make([]contracts.Option, len(q.Options))
	copy(shuffled, q.Options)

	rng.Shuffle(len(shuffled), func(i, j int) {
		shuffled[i], shuffled[j] = shuffled[j], shuffled[i]
	})

	q.Options = shuffled
	return q
}
