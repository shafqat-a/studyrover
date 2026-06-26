# 2-A05 — POST /sources (ingest, async)

- **Wave:** 2-api · **Module:** api · **Lang:** Go · **Depends on:** D02, 2-D03, 2-F06, 2-F07

## Goal
Phase-2 upgrade of source creation: store file (2-F07), create Source `processing`, enqueue an ingest Job; backend OCRs/processes; status → `ready`.

## Owns
- `backend/internal/http/sources_ingest.go`
- `backend/internal/jobs/ingest_handler.go` (the ingest job handler)

## Steps
1. Accept upload / NotebookLM link / text; persist Source(processing); enqueue ingest job.
2. Handler calls `knowledge.Ingest`; updates Source→ready/error + job progress.

## Acceptance
- [ ] Returns a Job; Source flips to ready on completion. Covered by 2-T04.
> Replaces the Phase-1 synchronous A03 create path for files; manual text still instant.
