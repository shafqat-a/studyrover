# L02 — DidPass

- **Wave:** 2a · **Module:** core · **Lang:** Go · **Depends on:** C04, C06

## Owns
- `backend/internal/core/pass.go`

## Steps
1. `func DidPass(scorePct, passBar int) bool` → `scorePct >= passBar`.

## Acceptance
- [ ] 70 vs 70 → true; 69 → false. Covered by T01.
