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
