# 2-A08 — POST /subjects/{id}/syllabus/apply

- **Wave:** 2-api · **Module:** api · **Lang:** Go · **Depends on:** D03, 2-L04

## Owns
- `backend/internal/http/syllabus_apply.go`

## Steps
1. Validate `ApplySyllabusRequest`; normalize (2-L04); bulk-create Topics (D03) in a tx; return created Topics.

## Acceptance
- [ ] Creates topics in order; parent-guarded. Idempotent-ish (skip dupes).
