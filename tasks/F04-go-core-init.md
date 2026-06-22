# F04 — Go internal/core package + test conventions

- **Wave:** 0 · **Module:** foundation · **Lang:** Go · **Depends on:** F02

## Goal
Establish the pure-logic package (no I/O, no DB, no HTTP) that holds all domain functions (L01–L12), plus an injectable RNG and clock for deterministic tests.

## Owns
- `backend/internal/core/doc.go` (package doc)
- `backend/internal/core/rng.go` (`RNG` interface + seeded impl)
- `backend/internal/core/clock.go` (`Now func() time.Time` injection helper)

## Steps
1. Package `core`; functions take `RNG`/clock as params (no global `rand`/`time.Now`).
2. Document the "pure function" rule for all L-tasks.

## Acceptance
- [ ] `go test ./internal/core/...` runs (no tests yet = passes).
- [ ] RNG seedable for deterministic L04/L05/L08 tests.
> Go has no barrels — exported identifiers are the API. No index file needed.
