# 3-F02 — ScoreEvent subscription

- **Wave:** 3-foundation · **Module:** ingest · **Lang:** Go · **Depends on:** 3-F01, 3-D06, C10

## Goal
Read new ScoreEvents from the platform (the persisted score_event table = the outbox) with a durable cursor + idempotent inbox.

## Owns
- `guardian/internal/ingest/subscriber.go` (poll platform for new ScoreEvents since cursor; dedupe via `score_event_inbox`)

## Reads
- C10 ScoreEvent shape; platform score_event source (read-only)

## Steps
1. Poll (or LISTEN/NOTIFY) for ScoreEvents > cursor; insert into inbox if unseen; hand to the reward pipeline (3-A12).

## Acceptance
- [ ] Each ScoreEvent processed exactly once; cursor survives restart. Covered by 3-T04.
> Contract = the ScoreEvent only. No other platform coupling.
