# L09 — SizePresets / MinutesForSize

- **Wave:** 2a · **Module:** core · **Lang:** Go · **Depends on:** C04

## Owns
- `backend/internal/core/presets.go`

## Steps
1. `var SizePresets = []int{5,10,20}`.
2. `func MinutesForSize(size, rateMinPerQ int) int` = size*rate (display-only; not reward logic).

## Acceptance
- [ ] 20 → 60 at rate 3. Covered by T03.
> Minutes shown by Student UI only when Guardian on; harmless in Phase 1.
