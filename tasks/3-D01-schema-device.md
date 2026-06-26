# 3-D01 — Device schema (g0002)

- **Wave:** 3-db · **Module:** db · **Lang:** SQL · **Depends on:** 3-D07, 3-C01

## Owns
- `guardian/db/migrations/g0002_device.up.sql` / `.down.sql`
- `guardian/db/queries/device.sql`

## Steps
1. `device(id, name, mac unique, ip?, hostname?, student_id, gated bool default true, created_at)`.
2. Queries: CreateDevice, ListDevices, GetDevice, GetByMAC, UpdateDevice, DeleteDevice.

## Acceptance
- [ ] migrate up + sqlc generate; MAC unique (primary key spec §11).
