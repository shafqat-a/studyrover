package core

import "math/rand/v2"

// RNG is the source of randomness for the core domain functions. Functions that
// need randomness (L04 AssembleExam, L05 ShuffleOptions, L08 SelectFromBank)
// accept an RNG parameter instead of touching the package-level math/rand
// functions, so their behaviour is deterministic for a given RNG.
//
// The method set is a subset of *math/rand/v2.Rand, which means a plain
// *rand.Rand satisfies this interface directly. Tests can supply a seeded
// implementation via NewSeededRNG for reproducible output.
type RNG interface {
	// IntN returns, as an int, a non-negative pseudo-random number in the
	// half-open interval [0,n). It panics if n <= 0.
	IntN(n int) int

	// Shuffle pseudo-randomizes the order of n elements using swap to swap
	// the elements with indexes i and j.
	Shuffle(n int, swap func(i, j int))

	// Float64 returns a pseudo-random number in the half-open interval [0.0,1.0).
	Float64() float64
}

// compile-time assertion that the standard library Rand satisfies RNG.
var _ RNG = (*rand.Rand)(nil)

// NewSeededRNG returns an RNG seeded deterministically from seed. The same seed
// always yields the same sequence, making it suitable for reproducible tests of
// the randomized core functions (L04/L05/L08).
func NewSeededRNG(seed uint64) RNG {
	// rand.NewPCG with a fixed pair of seed values gives a deterministic,
	// well-distributed source. The high word is fixed so a single uint64 seed
	// fully determines the stream.
	return rand.New(rand.NewPCG(seed, 0x9e3779b97f4a7c15))
}

// NewRNG returns a non-deterministic RNG suitable for production use. It draws
// its seed from the runtime's automatically-seeded global source.
func NewRNG() RNG {
	return rand.New(rand.NewPCG(rand.Uint64(), rand.Uint64()))
}
