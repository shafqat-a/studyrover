# 3-T07 — RouterOS smoke test (optional)

- **Wave:** 3-tests · **Module:** tests · **Lang:** Go · **Depends on:** 3-F04

## Goal
The spec's optional ~15-min smoke test: confirm grant/revoke works against a **real** MikroTik (or a CHR VM). Gated behind an env flag; skipped in normal CI.

## Owns
- `guardian/internal/wall/routeros/smoke_test.go` (build tag `routeros_smoke`)

## Steps
1. Against `ROUTEROS_TEST_URL`/creds (or a CHR in QEMU): grant a test MAC 1 min, verify session, auto-revoke.

## Acceptance
- [ ] Skipped without the flag; green against a real/CHR RouterOS when enabled.
> See routeros-qemu-chr / routeros-hotspot skills for spinning up a CHR.
