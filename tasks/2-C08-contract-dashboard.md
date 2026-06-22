# 2-C08 — Dashboard contract

- **Wave:** 2-contract · **Module:** contract · **Lang:** OpenAPI YAML · **Depends on:** F06, C06

## Owns
- `contracts/components/dashboard.yaml`

## Steps
1. `Dashboard{mastery[], masteryTimeline:[{date,topicId,mastery}], history: ExamAttempt[] ($ref), avgScore, streak, guidance: Guidance[]}`. No internet-time fields.

## Acceptance
- [ ] Valid 3.1; `$ref`s ExamAttempt/Guidance; no minutes/reward fields.
