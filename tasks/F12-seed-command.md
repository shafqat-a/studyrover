# F12 — Seed command (cmd/seed)

- **Wave:** 0 · **Module:** foundation · **Lang:** Go · **Depends on:** F03

## Goal
A Go command that inserts the singleton Settings (spec defaults) + one demo student/subject/topic/25 questions/gate exam, so dev + E2E have data.

## Owns
- `backend/cmd/seed/main.go`
- `backend/internal/seed/fixtures.go`

## Reads
- generated types (defaults), store (W04)

## Steps
1. Upsert Settings with C09 defaults (size 20, passBar 70, cooldown 10, rate 3, cap 3).
2. Insert demo Subject → Topic → 25 Questions → one gate ExamDefinition(size 20); demo Student. Idempotent.

## Acceptance
- [ ] `make seed` populates a fresh DB; re-run is idempotent.
> May stub store calls until W04 + D-migrations exist; author against generated types first.
