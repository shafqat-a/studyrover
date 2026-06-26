package core

import "github.com/shafqat/studyrover/backend/internal/contracts"

// SelectFromBank picks up to n questions from pool for an exam, implementing the
// rotating-bank behaviour of spec §6: questions that were recently used are
// avoided so that successive attempts draw fresh questions where possible.
//
// recentlyUsed maps a question id to true when that question was delivered in a
// recent attempt. The pool is partitioned into "fresh" (not recently used) and
// "stale" (recently used) buckets; each bucket is shuffled independently with
// rng, then fresh questions are taken first. If the fresh bucket holds fewer
// than n questions, stale questions are appended to make up the difference
// (reuse is allowed only when the bank is too small).
//
// The returned slice has at most min(n, len(pool)) elements. SelectFromBank is
// pure: it never mutates pool or recentlyUsed and allocates its own result.
func SelectFromBank(pool []contracts.Question, n int, recentlyUsed map[string]bool, rng RNG) []contracts.Question {
	if n <= 0 || len(pool) == 0 {
		return []contracts.Question{}
	}

	fresh := make([]contracts.Question, 0, len(pool))
	stale := make([]contracts.Question, 0, len(pool))
	for _, q := range pool {
		if recentlyUsed[q.Id] {
			stale = append(stale, q)
		} else {
			fresh = append(fresh, q)
		}
	}

	rng.Shuffle(len(fresh), func(i, j int) { fresh[i], fresh[j] = fresh[j], fresh[i] })
	rng.Shuffle(len(stale), func(i, j int) { stale[i], stale[j] = stale[j], stale[i] })

	// Prefer fresh questions; fall back to stale ones only to fill out the size.
	ordered := append(fresh, stale...)
	if n > len(ordered) {
		n = len(ordered)
	}
	out := make([]contracts.Question, n)
	copy(out, ordered[:n])
	return out
}
