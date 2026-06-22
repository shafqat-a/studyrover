# 3-A12 — Score-event intake pipeline

- **Wave:** 3-api · **Module:** api · **Lang:** Go · **Depends on:** 3-F02, 3-R05, 3-F03, 3-F06, 3-D05, 3-D06

## Goal
The core Guardian loop: consume a ScoreEvent → compute minutes → grant the student's device(s).

## Owns
- `guardian/internal/ingest/pipeline.go`

## Steps
1. For each new ScoreEvent (3-F02): load reward policy + daily usage; `reward.Decide` (3-R05); if minutes>0, find the student's device(s) and `Wall.Grant` via session manager; record grant + increment usage + mark inbox processed.

## Acceptance
- [ ] Passing exam → device granted earned minutes; cap/DR respected; idempotent. Covered by 3-T04.
> This is the seam in action: ScoreEvent in → internet time out. Entirely Guardian-side.
