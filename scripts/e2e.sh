#!/usr/bin/env bash
# StudyRover — run the Playwright E2E suite against a REAL Go backend on an
# isolated database. Never touches the live `studyrover` DB or the deployed
# service on :8080.
#
#   1. create the `studyrover_e2e` database if absent (local postgres)
#   2. migrate + seed it (demo student / subject / questions / exam)
#   3. start the Go API on $E2E_BACKEND_PORT (default 8082)
#   4. run `playwright test` with Vite on $E2E_PORT (default 5174) proxying to it
#   5. stop the backend
#
# Overrides: E2E_DATABASE_URL, E2E_BACKEND_PORT, E2E_PORT, E2E_GUARDIAN_ENABLED
# (default true: the Guardian runs with the in-memory fake wall). Extra args are passed
# to `playwright test` (e.g. `scripts/e2e.sh --headed`, `--ui`, a spec path).
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
E2E_BACKEND_PORT="${E2E_BACKEND_PORT:-8082}"
E2E_PORT="${E2E_PORT:-5174}"
DB_NAME="studyrover_e2e"
E2E_DATABASE_URL="${E2E_DATABASE_URL:-postgres://studyrover:studyrover@127.0.0.1:5432/${DB_NAME}?sslmode=disable}"
PNPM="${PNPM:-pnpm}"
command -v "$PNPM" >/dev/null || PNPM="corepack pnpm"

echo "==> [1/5] database ${DB_NAME}"
if ! sudo -n -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  sudo -n -u postgres createdb -O studyrover "$DB_NAME"
  echo "    created"
else
  echo "    exists"
fi

echo "==> [2/5] migrate + seed"
command -v migrate >/dev/null || export PATH="$PATH:$HOME/go/bin"
migrate -path "$REPO/backend/db/migrations" -database "$E2E_DATABASE_URL" up
( cd "$REPO/backend" && DATABASE_URL="$E2E_DATABASE_URL" go run ./cmd/seed )
# Guardian fixtures: one gated device for the demo student, and a clean slate
# for today's usage so the earned-time assertions are deterministic. Older
# score_events are marked consumed so the subscriber only grants the new one.
psql "$E2E_DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
INSERT INTO guardian_device (student_id, name, mac)
VALUES ('44444444-4444-4444-4444-444444444444', 'Demo laptop', 'aa:bb:cc:dd:ee:01')
ON CONFLICT (mac) DO NOTHING;
DELETE FROM guardian_grant;
DELETE FROM guardian_daily_usage;
INSERT INTO guardian_score_inbox (score_event_id, minutes, note)
SELECT id, 0, 'e2e reset' FROM score_event
WHERE id NOT IN (SELECT score_event_id FROM guardian_score_inbox);
SQL

echo "==> [3/5] backend on :${E2E_BACKEND_PORT}"
STORAGE_DIR="$(mktemp -d)"
# setsid: own process group, so cleanup can kill `go run` + the compiled child
# without taking down this script.
( cd "$REPO/backend" && exec setsid env \
  PORT="$E2E_BACKEND_PORT" \
  DATABASE_URL="$E2E_DATABASE_URL" \
  SESSION_SECRET="e2e-only-not-secret-$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')" \
  RP_ID=localhost \
  RP_ORIGIN="http://localhost:${E2E_PORT}" \
  STORAGE_DIR="$STORAGE_DIR" \
  GUARDIAN_ENABLED="${E2E_GUARDIAN_ENABLED:-true}" \
  GUARDIAN_WALL=fake \
  GUARDIAN_FAKE_DEVICES="aa:bb:cc:dd:ee:01=demo-laptop,aa:bb:cc:dd:ee:02=demo-phone" \
  go run ./cmd/server ) &
BACKEND_PID=$!
cleanup() {
  echo "==> [5/5] stopping backend"
  kill -- -"$BACKEND_PID" 2>/dev/null || kill "$BACKEND_PID" 2>/dev/null || true
  rm -rf "$STORAGE_DIR"
}
trap cleanup EXIT
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null "http://127.0.0.1:${E2E_BACKEND_PORT}/healthz" 2>/dev/null; then break; fi
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then echo "backend exited early" >&2; exit 1; fi
  sleep 1
done
curl -fsS -o /dev/null "http://127.0.0.1:${E2E_BACKEND_PORT}/healthz" || { echo "backend never became healthy" >&2; exit 1; }

echo "==> [4/5] playwright (vite :${E2E_PORT} -> backend :${E2E_BACKEND_PORT})"
cd "$REPO/frontend"
VITE_BACKEND_URL="http://localhost:${E2E_BACKEND_PORT}" E2E_PORT="$E2E_PORT" \
  $PNPM exec playwright test "$@"
