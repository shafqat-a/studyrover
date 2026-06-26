# StudyRover — Frozen Contracts (Phase 3: The Guardian)

> Extends `CONTRACTS.md`. The Guardian is an **optional, decoupled add-on** (Reward Engine + Network Wall). It is a **separate Go binary** (`guardian/`). The **only** thing crossing from the Study Platform is the `ScoreEvent` (C10). Detach the Guardian → the platform still works (spec §4, §14).

## The seam — how the Guardian gets scores
The platform already persists each `ScoreEvent` (C10) on submit (A15/D07). That table **is the outbox**. The Guardian subscribes by reading new ScoreEvents (cursor/inbox for idempotency). No platform code changes; the contract is the ScoreEvent row shape.

```
Platform: exam submit → persist ScoreEvent (C10)         ← already exists from Phase 1
Guardian: poll ScoreEvents → Reward Engine → minutes → Network Wall grants device → session timer → revoke
```

## Network Wall adapter — swappable, like the knowledge backend
```go
type Wall interface {
    Grant(ctx, mac string, minutes int) (SessionID, error)   // open device's internet for N min
    Revoke(ctx, mac string) error
    ListActive(ctx) ([]ActiveGrant, error)
    Discover(ctx) ([]DiscoveredDevice, error)                // scan network
}
```
Real impl = **MikroTik RouterOS v7 REST API** (hotspot IP-bindings / `session-timeout`). A **fake in-memory wall** lets all of Phase 3 (and tests) run with no hardware. MAC is the primary key (spec §11).

## Entity schemas (`contracts/components/guardian/*.yaml`)
- **3-C01 Device** — `Device{id, name, mac(primary), ip?, hostname?, studentId, gated(bool), createdAt}`; `DiscoveredDevice{mac, ip?, hostname?}`.
- **3-C02 RewardPolicy** — `RewardPolicy{rateMinPerQ(3), passBar(70), dailyCapHours(3), rewardStyle(flat|scaled), diminishingReturns(bool), cooldownMin(10)}` (Guardian-side mirror of settings, spec §10/§4.2).
- **3-C03 Session/Grant** — `Grant{id, deviceId, mac, minutes, startedAt, expiresAt, source(exam|override|manual), revokedAt?}`, `ActiveGrant{...remaining(seconds)}`.
- **3-C04 Override** — `OverrideRequest{deviceId, durationMin, reason?}` (FIDO2-authed); `OverrideLog{id, deviceId, durationMin, reason?, who, at}`.
- **3-C05 GuardianStatus** — `{active: ActiveGrant[], history: Grant[], dailyUsage: {studentId, minutesToday}[]}`.
- **3-C06 ScoreEvent intake** — consumes C10 (read-only; references the platform schema).

## API additions (Guardian binary, under `/guardian` + captive portal routes)
| Method + path | Returns | Task |
|---|---|---|
| `GET/POST /guardian/devices` · `GET/PUT/DELETE /devices/{id}` | `Device` | 3-A01, 3-A02 |
| `POST /guardian/devices/scan` | `DiscoveredDevice[]` | 3-A03 |
| `GET/PUT /guardian/reward-policy` | `RewardPolicy` | 3-A04 |
| `GET /guardian/sessions` · `POST /guardian/sessions/{id}/revoke` | `ActiveGrant[]` | 3-A05, 3-A06 |
| `POST /guardian/override` (FIDO2) | `Grant` | 3-A07 |
| `GET /guardian/override-log` | `OverrideLog[]` | 3-A08 |
| `GET /guardian/status` | `GuardianStatus` | 3-A09 |
| `POST /guardian/grant` (manual) | `Grant` | 3-A10 |
| `GET /portal/gate` · `POST /portal/login` (captive portal) | gate page / redirect | 3-A11 |
| *(internal)* score-event intake → reward → grant | — | 3-A12 |

## Reward Engine (the score → minutes policy, spec §10)
- **3-R01** flat/scaled mapping (`minutes = size*rate` on pass; scaled = `scorePct% * maxTime`).
- **3-R02** diminishing returns (Nth pass of the day pays less).
- **3-R03** daily cap (≤ `dailyCapHours`).
- **3-R05** grant decision = ScoreEvent → minutes → apply DR + cap → grant or zero. Lives **only** in the Guardian — never in the Study Platform.

## Lighting up the Phase-1 time UI
Phase-1 student pages (P11/P12/P14) render a placeholder slot `<GuardianTimeSlot/>` (a no-op component shipped dark in Phase 1). Phase 3 provides the real component (3-U06) + `useEarnedTime` (3-H06) the slot resolves to **only when the Guardian is enabled** — so no Phase-1 page files are edited. This is the agreed forward-hook.
