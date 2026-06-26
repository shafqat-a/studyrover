// Package core holds StudyRover's pure domain logic: the L01–L12 functions that
// implement scoring, exam assembly, mastery, cooldowns, settings resolution and
// the ScoreEvent seam.
//
// # The pure-function rule
//
// Everything in this package is a pure function of its inputs. That means:
//
//   - No I/O: no database access, no HTTP, no filesystem, no logging.
//   - No hidden global state: never call the package-level math/rand functions
//     or time.Now directly. Instead, accept the dependencies you need as
//     parameters — an [RNG] for randomness and a [Clock] (or a time.Time value)
//     for "now". This keeps every function deterministic and trivially testable.
//   - No mutation of inputs: treat slices and structs passed in as read-only;
//     return new values rather than editing arguments in place.
//
// Callers (the internal/http handlers and internal/store layer) own all side
// effects. They construct an [RNG] and a [Clock], read/write the database, and
// then invoke the pure functions here to compute results. Handlers contain no
// business logic; this package contains no I/O.
//
// Because randomness and time are injected, tests can pass a seeded RNG
// (see [NewSeededRNG]) and a fixed clock (see [FixedClock]) to make exam
// assembly (L04), option shuffling (L05) and bank selection (L08) fully
// reproducible.
package core
