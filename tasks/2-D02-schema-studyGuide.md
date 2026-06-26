# 2-D02 — StudyGuide schema (0014)

- **Wave:** 2-db · **Module:** db · **Lang:** SQL · **Depends on:** F03, 2-C02

## Owns
- `backend/db/migrations/0014_study_guide.up.sql` / `.down.sql`
- `backend/db/queries/study_guide.sql`

## Steps
1. `study_guide(id, subject_id fk, topic_id? fk, markdown, citations jsonb, generated_at)`.
2. Queries: UpsertStudyGuide, GetStudyGuide(subject,topic).

## Acceptance
- [ ] migrate up + sqlc generate; matches 2-C02.
