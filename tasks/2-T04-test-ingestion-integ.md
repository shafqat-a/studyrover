# 2-T04 — Ingestion job integration

- **Wave:** 2-tests · **Module:** tests · **Lang:** Go · **Depends on:** 2-A05, 2-A06

## Owns
- `backend/internal/http/ingestion_test.go`

## Steps
1. POST source (fake backend) → job queued → worker → Source ready; GET job shows progression.

## Acceptance
- [ ] End-to-end ingest lifecycle green with fake adapter + test DB.
