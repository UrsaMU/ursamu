#!/usr/bin/env bash
# Full events E2E: ensure web SPA build, start mock game, run Deno tests.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
EVENTS="$ROOT/packages/events"
GAME="$ROOT/games/events-local"
WEB_UI="$ROOT/packages/web/ui"

export EVENTS_E2E_BASE="${EVENTS_E2E_BASE:-http://127.0.0.1:4393}"
export DENO_JOBS=1

echo "==> monorepo: $ROOT"
echo "==> BASE:     $EVENTS_E2E_BASE"

# 1. Admin SPA must include EventsView
if [[ ! -f "$ROOT/packages/web/dist/assets/index-"*.js ]] && \
   [[ ! -d "$ROOT/packages/web/dist/assets" ]]; then
  echo "==> building web admin SPA…"
  (cd "$WEB_UI" && npm run build:fast)
else
  # Rebuild if EventsView chunk missing
  if ! ls "$ROOT/packages/web/dist/assets"/EventsView-*.js >/dev/null 2>&1; then
    echo "==> EventsView missing from dist — building SPA…"
    (cd "$WEB_UI" && npm run build:fast)
  else
    echo "==> web dist already has EventsView"
  fi
fi

# 2. Playwright browsers
if [[ ! -d "${HOME}/Library/Caches/ms-playwright" ]] && \
   [[ ! -d "${HOME}/.cache/ms-playwright" ]]; then
  echo "==> installing Playwright Chromium…"
  (cd "$ROOT" && npx --yes playwright@1.49.1 install chromium) || \
    (cd "$EVENTS" && deno run -A npm:playwright@1.49.1 install chromium)
fi

# 3. Fresh DB for deterministic first-user superuser
echo "==> resetting events-local DB…"
(cd "$GAME" && rm -rf data/typegraph.db data/ursamu.db && mkdir -p data logs run)

# 4. Start game (daemon). Harness also starts if needed.
echo "==> starting events-local…"
(cd "$GAME" && bash ./scripts/daemon.sh)

cleanup() {
  if [[ "${EVENTS_E2E_KEEP:-}" == "1" ]]; then
    echo "==> keeping game (EVENTS_E2E_KEEP=1)"
    return
  fi
  echo "==> stopping events-local…"
  (cd "$GAME" && bash ./scripts/stop.sh) || true
}
trap cleanup EXIT

# 5. Wait ready
echo "==> waiting for API…"
ok=0
for i in $(seq 1 60); do
  if curl -sf -o /dev/null -w "%{http_code}" "$EVENTS_E2E_BASE/" 2>/dev/null | grep -qE '^(2|3|4)'; then
    ok=1
    break
  fi
  # register endpoint may 405 on GET — still proves listen
  code=$(curl -sS -o /dev/null -w "%{http_code}" -X POST "$EVENTS_E2E_BASE/api/v1/register" \
    -H 'Content-Type: application/json' -d '{}' 2>/dev/null || echo 000)
  case "$code" in
    2*|3*|4*) ok=1; break ;;
  esac
  sleep 1
done
if [[ "$ok" != "1" ]]; then
  echo "ERROR: game not ready. Last log:"
  tail -50 "$GAME/logs/main.log" 2>/dev/null || true
  exit 1
fi
echo "==> game ready"

# 6. Unit suite first (fast)
echo "==> unit tests…"
(cd "$EVENTS" && deno task test)

# 7. E2E REST + Playwright
echo "==> e2e tests…"
(cd "$EVENTS" && deno test e2e/ \
  --allow-all --unstable-kv --no-check)

echo "==> ALL GREEN"
