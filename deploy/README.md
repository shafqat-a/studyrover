# StudyRover — Deployment (home.cloudlabs.live/studyrover)

Single Go binary (API + embedded SPA) behind the existing nginx site, served at
the **/studyrover/** subpath over the existing Let's Encrypt TLS.

```
Browser ──https──> nginx (home.cloudlabs.live)
                     location /studyrover/  ──strip prefix──> 127.0.0.1:8080 (Go binary)
                     location /             ──> :5050 (existing ai-dev-conductor, untouched)
```

## Architecture of the subpath
nginx `proxy_pass http://127.0.0.1:8080/;` (trailing slash) strips `/studyrover/`,
so the Go app serves at root. The SPA is built so every URL carries the prefix:
- `vite.config.ts` → `base: '/studyrover/'`  (asset URLs)
- React Router → `basename="/studyrover"`     (client routes)
- API client → `baseUrl: '/studyrover/api'`   (fetch URLs)

So `/studyrover/assets/x.js` → nginx → `/assets/x.js` → Go (embedded), and
`/studyrover/api/...` → `/api/...` → Go API. Deep links fall back to index.html.

## Files
| File | Purpose |
|---|---|
| `studyrover.service` | systemd unit (runs the binary as `shafqat`, env from `studyrover.env`) |
| `studyrover.env.example` | runtime config template (PORT, DATABASE_URL, SESSION_SECRET, RP_ID, RP_ORIGIN) |
| `nginx-studyrover.location.conf` | the `location /studyrover/` block inserted into the live site |
| `deploy.sh` | idempotent build + DB provision + migrate + service + nginx + smoke test |

## One-shot deploy
```bash
./deploy/deploy.sh          # build + deploy
./deploy/deploy.sh --seed   # same, plus seed demo data
```
Requires passwordless sudo (postgres/systemd/nginx), `go`, `pnpm`. Re-runnable.

## What deploy.sh does
1. Generates `studyrover.env` (random `SESSION_SECRET` + DB password) if absent.
2. Provisions Postgres `studyrover` role + database on the local instance (127.0.0.1:5432).
3. `make build` — codegen → `vite build` (subpath) → Go binary embedding the SPA.
4. `migrate up` (+ `--seed`).
5. Installs + restarts `studyrover.service` (binary on :8080).
6. Inserts the nginx location (idempotent, with a `.bak`), `nginx -t`, reloads.
7. Smoke-tests `/healthz` locally and `/studyrover/` publicly.

## Operate
```bash
sudo systemctl status studyrover
sudo journalctl -u studyrover -f
sudo systemctl restart studyrover
```

## Notes
- The existing `location /` (ai-dev-conductor on :5050) is untouched; nginx
  longest-prefix matching sends `/studyrover/*` to StudyRover.
- WebAuthn RP is the bare domain (`home.cloudlabs.live`) — path-agnostic, so the
  subpath does not affect parent FIDO2 login.
- TLS is the site's existing certbot cert; nothing to renew here.

## Guardian (Phase 3)
The Guardian is the optional reward engine + network wall: a passed exam opens
internet time on the student's registered devices, a timer counts it down, and
the wall closes it again (spec §4/§10/§11). It is compiled into the same binary
but **off by default** — with `GUARDIAN_ENABLED` unset no Guardian code runs and
the `/api/guardian/*` endpoints answer "disabled" (status / earned-time return
`enabled:false`; everything else 409).

How it works when enabled:
1. Exam submit appends a `score_event` row (the Phase-1 outbox). The Guardian's
   subscriber reads forward from `guardian_score_inbox` (its cursor) and runs
   each event through the reward policy (rate × size, diminishing returns,
   daily cap) — the parent's `/guardian/policy`.
2. Minutes > 0 → one grant per **gated** device of the student; the session
   manager opens it on the wall and sweeps expired grants every 15s (and
   reconciles wall ↔ DB on boot).
3. Parents manage devices (`/guardian/devices`, scan via the wall), pause the
   whole thing (`policy.enabled=false`), grant manual overrides (logged), and
   revoke sessions from the Guardian pages. Students see their remaining time
   on the Phase-1 pages.

Env (see `studyrover.env.example`; all optional unless noted):

| Var | Meaning |
|---|---|
| `GUARDIAN_ENABLED` | `true`/`1` enables the Guardian (default off). |
| `GUARDIAN_WALL` | `fake` (default; in-memory wall, no hardware — lets you try the whole flow) or `routeros`. |
| `GUARDIAN_FAKE_DEVICES` | Comma-separated `mac=hostname` seeds the fake wall reports on "Scan". |
| `ROUTEROS_URL` | RouterOS v7 REST base URL, e.g. `https://192.168.88.1` (**required** for `routeros`). |
| `ROUTEROS_USER` / `ROUTEROS_PASSWORD` | Router API credentials (**required** for `routeros`). |
| `ROUTEROS_INSECURE_TLS` | `true` to accept the router's self-signed cert. |
| `ROUTEROS_HOTSPOT_SERVER` | `/ip/hotspot` server name gating the student devices (empty = first/only). |

Startup logs `guardian: enabled wall=<fake|routeros>` when on; a `routeros`
wall with missing URL/user/password fails config validation at startup.

RouterOS mechanism (summary — details in
`backend/internal/guardian/wall/routeros/doc.go`): the household is
allow-by-default. Registering a gated device installs a per-device
`/ip/firewall/filter` **forward drop** rule keyed on its MAC, guarded by "not
in address-list `studyrover-online`". A grant adds the device to the
`studyrover-online` address-list with a **timeout** equal to the granted
minutes, so the router itself enforces expiry even if StudyRover is down;
revoke removes the list entry; "Scan" lists `/ip/dhcp-server/lease` +
`/ip/arp` hosts. Deleting a device removes its drop rule. Use a dedicated
router user with write access to `/ip/firewall` and read access to DHCP/ARP
(and `/ip/hotspot` when a hotspot server is configured).

Trying it without a router: `GUARDIAN_ENABLED=true GUARDIAN_WALL=fake` with a
couple of `GUARDIAN_FAKE_DEVICES`, register a device from the Scan dialog, pass
an exam as the student and watch `/guardian/status` and the student's time slot.
