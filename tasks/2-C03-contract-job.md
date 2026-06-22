# 2-C03 — Job contract

- **Wave:** 2-contract · **Module:** contract · **Lang:** OpenAPI YAML · **Depends on:** F06

## Owns
- `contracts/components/job.yaml`

## Steps
1. `Job{id, type(ingest|syllabus|questions), status(queued|processing|ready|error), subjectId, progress, result?, error?, timestamps}`.

## Acceptance
- [ ] Valid 3.1; `result` is an open object (typed per job type at use site).
