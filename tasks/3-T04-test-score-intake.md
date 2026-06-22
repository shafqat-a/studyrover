# 3-T04 — Score→grant integration

- **Wave:** 3-tests · **Module:** tests · **Lang:** Go · **Depends on:** 3-A12, 3-F02

## Owns
- `guardian/internal/ingest/pipeline_test.go`

## Steps
1. Insert a ScoreEvent (pass) → subscriber picks it up → reward → fake Wall grant recorded; usage incremented; idempotent on replay. Fail event → no grant.

## Acceptance
- [ ] ScoreEvent→grant loop green; exactly-once; cap respected.
