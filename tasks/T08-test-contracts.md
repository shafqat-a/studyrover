# T08 — Contract lint + codegen-compiles

- **Wave:** 4 · **Module:** tests · **Lang:** misc · **Depends on:** C01–C11, W01

## Owns
- `contracts/tests/lint.config` (Spectral/vacuum ruleset)
- `contracts/tests/README.md` (how the gate works)

## Steps
1. Lint the assembled `openapi.yaml` (valid 3.1, no unused/undefined `$ref`, examples validate).
2. Assert `make gen` output compiles: Go `go build ./internal/contracts` + TS `tsc --noEmit` on `src/api`.
3. Assert `DeliveredQuestion` lacks `correctOptionId`; `ScoreEvent` has no reward fields.

## Acceptance
- [ ] Lint clean; generated Go + TS compile; invariants asserted. Locks the frozen contract against drift.
