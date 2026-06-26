#!/usr/bin/env bash
# StudyRover — build + deploy on this host (nginx @ home.cloudlabs.live/studyrover).
#
# Idempotent. Safe to re-run. Steps:
#   1. ensure env file (random SESSION_SECRET + DB password if absent)
#   2. provision Postgres role + database
#   3. build: codegen -> SPA (vite base=/studyrover/) -> Go binary (embeds SPA)
#   4. run migrations (+ optional --seed)
#   5. install/restart the systemd service (Go binary on 127.0.0.1:8080)
#   6. add the /studyrover/ location to the existing nginx site, test, reload
#   7. smoke test
#
# Requires: passwordless sudo (postgres, systemd, nginx), go, pnpm, docker not needed.
set -euo pipefail

REPO="/home/shafqat/git/studyrover"
DEPLOY="$REPO/deploy"
ENV_FILE="$DEPLOY/studyrover.env"
NGINX_SITE="/etc/nginx/sites-available/home.cloudlabs.live"
GOBIN="$HOME/go/bin"
export PATH="$PATH:$GOBIN"
SEED=0; [[ "${1:-}" == "--seed" ]] && SEED=1

echo "==> [1/7] env file"
if [[ ! -f "$ENV_FILE" ]]; then
  DB_PASS="$(openssl rand -hex 16)"
  SEC="$(openssl rand -hex 32)"
  sed -e "s#CHANGE_ME#${SEC}#" -e "s#studyrover:CHANGE_ME#studyrover:${DB_PASS}#" \
      "$DEPLOY/studyrover.env.example" > "$ENV_FILE"
  # the example has CHANGE_ME twice (db pass + session); fix db pass explicitly:
  sed -i "s#postgres://studyrover:[^@]*@#postgres://studyrover:${DB_PASS}@#" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "    created $ENV_FILE"
else
  echo "    reusing $ENV_FILE"
fi
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a
DB_PASS="$(sed -n 's#.*://studyrover:\([^@]*\)@.*#\1#p' <<<"$DATABASE_URL")"

echo "==> [2/7] provision postgres role + db"
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='studyrover') THEN
    CREATE ROLE studyrover LOGIN PASSWORD '${DB_PASS}';
  ELSE
    ALTER ROLE studyrover LOGIN PASSWORD '${DB_PASS}';
  END IF;
END \$\$;
SQL
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='studyrover'" | grep -q 1; then
  sudo -u postgres createdb -O studyrover studyrover
  echo "    created database studyrover"
else
  echo "    database studyrover exists"
fi

echo "==> [3/7] build (codegen + SPA + Go binary)"
command -v sqlc   >/dev/null || go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest
command -v migrate >/dev/null || go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest
( cd "$REPO/backend" && sqlc generate )
( cd "$REPO" && make build-spa build-backend )

echo "==> [4/7] migrate"
migrate -path "$REPO/backend/db/migrations" -database "$DATABASE_URL" up
if [[ "$SEED" == "1" ]]; then
  echo "    seeding"
  ( cd "$REPO/backend" && DATABASE_URL="$DATABASE_URL" go run ./cmd/seed )
fi

echo "==> [5/7] systemd service"
sudo cp "$DEPLOY/studyrover.service" /etc/systemd/system/studyrover.service
sudo systemctl daemon-reload
sudo systemctl enable studyrover >/dev/null 2>&1 || true
sudo systemctl restart studyrover
sleep 2
sudo systemctl --no-pager --full status studyrover | head -5 || true

echo "==> [6/7] nginx /studyrover/ location"
if sudo grep -q 'STUDYROVER-BLOCK-START' "$NGINX_SITE"; then
  echo "    location already present"
else
  TMP="$(mktemp)"
  # Insert the block immediately before the first `location / {` in the site.
  sudo awk -v blockfile="$DEPLOY/nginx-studyrover.location.conf" '
    BEGIN { while ((getline line < blockfile) > 0) blk = blk line "\n" }
    /^[[:space:]]*location \/ \{/ && !done { printf "%s", blk; done=1 }
    { print }
  ' "$NGINX_SITE" > "$TMP"
  sudo cp "$NGINX_SITE" "${NGINX_SITE}.bak.$(date +%s 2>/dev/null || echo bak)"
  sudo cp "$TMP" "$NGINX_SITE"; rm -f "$TMP"
  echo "    inserted location block (backup saved)"
fi
sudo nginx -t
sudo systemctl reload nginx

echo "==> [7/7] smoke test"
echo -n "    local  app: "; curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/healthz || echo "FAIL"
echo -n "    public app: "; curl -fsS -o /dev/null -w "%{http_code}\n" https://home.cloudlabs.live/studyrover/ || echo "(check after first build)"
echo "==> done: https://home.cloudlabs.live/studyrover/"
