# 3-L01 — Session countdown/expiry logic

- **Wave:** 3-core · **Module:** core · **Lang:** Go · **Depends on:** 3-C03

## Owns
- `guardian/internal/core/expiry.go`

## Steps
1. `ExpiresAt(start time.Time, minutes int) time.Time`; `Remaining(expiresAt, now) time.Duration`; `IsExpired`.

## Acceptance
- [ ] Correct remaining/expiry; clock injected. Covered by 3-T02.
