# 2-F07 — File storage

- **Wave:** 2-foundation · **Module:** storage · **Lang:** Go · **Depends on:** F02

## Goal
Store uploaded source files and resolve `fileRef` (used by ingestion). Local-disk default; S3-compatible optional.

## Owns
- `backend/internal/storage/store.go` (`Put(r) (ref, error)`, `Get(ref) (reader, error)`, `Delete(ref)`)
- `backend/internal/storage/local.go` (filesystem impl)

## Steps
1. Content-addressed refs; size/type limits; safe paths.
2. Pluggable backend (local now, S3 later) behind the interface.

## Acceptance
- [ ] Put/Get/Delete round-trip; `fileRef` resolvable by the ingest job.
