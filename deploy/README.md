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

## Lessons / Enrich
Class lessons (one per topic) are written by the active knowledge backend on
demand ("Generate") and can be topped up with external resources via
"Enrich", an async `enrich` job that searches YouTube and Wikipedia for the
lesson's topic and attaches the best matches (deduplicated by URL; poll the
returned Job, its `result` is `{lessonId, added, youtube, wikipedia, warnings}`).
Only hits about the topic are attached: the topic is split into its concepts
("Number: Integers, powers and roots" → integers / powers / roots), Wikipedia is
searched per concept in the subject's field ("Integers mathematics"), and a hit
is kept only when its title names a concept (Wikipedia titles may add at most two
words, and a bracketed qualifier must fit the field). If nothing on-topic is
found, nothing is attached (`added: 0`).
Parents can also paste a YouTube / Wikipedia / any URL by hand; the title and
thumbnail are fetched best-effort (YouTube oEmbed, Wikipedia page summary — no
key needed).

Env (see `studyrover.env.example`; both optional):

| Var | Meaning |
|---|---|
| `YOUTUBE_API_KEY` | YouTube Data API v3 key. Unset → the Enrich job skips YouTube and reports `"YouTube skipped: YOUTUBE_API_KEY not configured"` in `warnings`; Wikipedia still runs. Create it in Google Cloud Console (enable "YouTube Data API v3", then Credentials → API key). Each search spends 100 of the free 10,000 daily quota units, so a lesson enrich costs ~1% of the daily budget; a `quotaExceeded` error shows up as a warning, not a failed job. |
| `WIKIPEDIA_LANG` | Wikipedia edition to search (default `en`). Also the edition used for pasted `wikipedia.org/wiki/…` links without a language subdomain. |

Outbound calls go to `www.googleapis.com`, `www.youtube.com` (oEmbed) and
`*.wikipedia.org` with a 10s timeout and the User-Agent
`StudyRover/1.0 (home study app; contact via repo)` (Wikimedia rejects
anonymous UAs). Nothing is cached server-side; re-running Enrich only adds
resources that are not already attached.

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

## Codex (bring your own ChatGPT/Codex subscription)
The `codex` knowledge backend uses the parent's own ChatGPT/Codex plan instead
of a metered API key. It runs the OpenAI Codex CLI on the server, one
`codex exec` per AI call (question/exam generation, lessons, study guides,
syllabus, tutor), in a read-only sandbox inside an empty temp directory.

1. Install the Codex CLI for the user the service runs as (`studyrover.service`
   `User=`), and sign it in once as that user:
   `codex login` (or `codex login --device-auth` on a headless box).
   Check with `codex login status` → `Logged in using ChatGPT`.
2. Set `CODEX_BIN` in `studyrover.env` to the CLI's absolute path (systemd's
   PATH does not include `~/.local/bin`). `CODEX_HOME` (default `~/.codex`) and
   `CODEX_MODEL` (default: the plan's default model) are optional.
3. Pick **Codex** under Settings → Knowledge backend, then
   `sudo systemctl restart studyrover` (the engine is chosen at startup).

Notes: calls count against the plan's usage limits. The tutor answer arrives in
one piece (the CLI does not stream tokens). Like Ollama and z.ai, Codex does
not ingest documents; use Gemini/NotebookLM for uploads. A missing or expired
login fails the call with "not signed in (run `codex login` …)".
