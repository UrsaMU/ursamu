#!/bin/bash
# Shared port helpers for UrsaMU game scripts.
# Source from game root (after cd to project root):
#   # shellcheck source=scripts/_ports.sh
#   . "$(dirname "$0")/_ports.sh"
#
# Exports:
#   TELNET_PORT  WS_PORT  HTTP_PORT  API_PORT
#   GAME_NAME    ALL_PORTS (space-separated unique ports)

ursamu_read_ports() {
  # Prefer python3; fall back to defaults
  if command -v python3 >/dev/null 2>&1; then
    eval "$(python3 - <<'PY'
import json
from pathlib import Path

def load():
    for rel in ("config/config.json", "config/config.sample.json"):
        p = Path(rel)
        if p.is_file():
            try:
                return json.loads(p.read_text(encoding="utf-8"))
            except Exception:
                pass
    return {}

cfg = load()
s = cfg.get("server") or {}
g = cfg.get("game") or {}
telnet = int(s.get("telnet") or s.get("telnetPort") or 4201)
ws = int(s.get("ws") or s.get("wsPort") or 0)
http = int(s.get("http") or 0)
api = int(s.get("apiPort") or 0)
# Fallbacks when fields omitted
if not ws:
    ws = http or 4202
if not http:
    http = ws or 4202
if not api:
    api = http if http != ws else (http + 1 if http else 4203)
name = str(g.get("name") or "UrsaMU").replace("'", "")
print(f"TELNET_PORT={telnet}")
print(f"WS_PORT={ws}")
print(f"HTTP_PORT={http}")
print(f"API_PORT={api}")
print(f"GAME_NAME='{name}'")
ports = sorted({p for p in (telnet, ws, http, api) if p})
print(f"ALL_PORTS='{' '.join(str(p) for p in ports)}'")
PY
)"
  else
    TELNET_PORT=${URSAMU_TELNET_PORT:-4201}
    WS_PORT=${URSAMU_WS_PORT:-4202}
    HTTP_PORT=${URSAMU_HTTP_PORT:-4202}
    API_PORT=${URSAMU_API_PORT:-4203}
    GAME_NAME=${URSAMU_GAME_NAME:-UrsaMU}
    ALL_PORTS="$TELNET_PORT $WS_PORT $HTTP_PORT $API_PORT"
  fi
  # Deduplicate ALL_PORTS
  ALL_PORTS=$(echo "$ALL_PORTS" | tr ' ' '\n' | awk 'NF && !seen[$0]++' | tr '\n' ' ' | sed 's/[[:space:]]*$//')
}

ursamu_free_ports() {
  local extra="${1:-}"
  local ports="$ALL_PORTS $extra"
  local port pids
  for port in $ports; do
    [ -n "$port" ] || continue
    pids=$(lsof -ti ":$port" 2>/dev/null || true)
    if [ -n "$pids" ]; then
      echo "Freeing :$port (PIDs: $pids)"
      # shellcheck disable=SC2086
      echo "$pids" | xargs kill -9 2>/dev/null || true
    fi
  done
  rm -f data/typegraph.db/postmaster.pid 2>/dev/null || true
}

ursamu_find_supervisor() {
  # Sets ENTRY to local start.ts or JSR
  ENTRY="jsr:@ursamu/cli/start"
  local probe
  probe="$(pwd)"
  while [ "$probe" != "/" ]; do
    if [ -f "$probe/mod.ts" ] && \
       [ -f "$probe/packages/cli/src/start.ts" ]; then
      ENTRY="$probe/packages/cli/src/start.ts"
      break
    fi
    probe="$(dirname "$probe")"
  done
}

ursamu_api_ready() {
  # True when REST answers on API_PORT (or HTTP_PORT fallback)
  local base
  for base in \
    "http://127.0.0.1:${API_PORT}" \
    "http://127.0.0.1:${HTTP_PORT}"; do
    if curl -sf "$base/api/v1/cpr/meta" >/dev/null 2>&1; then
      return 0
    fi
    if curl -sf "$base/" >/dev/null 2>&1; then
      return 0
    fi
    # Generic liveness — any 2xx/3xx/401 on root or /api
    code=$(curl -sS -o /dev/null -w "%{http_code}" "$base/" 2>/dev/null || echo 000)
    case "$code" in
      2*|3*|401|403|404) return 0 ;;
    esac
  done
  return 1
}

ursamu_wait_ready() {
  local secs="${1:-45}"
  local i
  for i in $(seq 1 "$secs"); do
    if ursamu_api_ready; then
      return 0
    fi
    sleep 1
  done
  return 1
}

ursamu_print_access() {
  # When http==ws the HTTP field is the WS hub (426 in a browser).
  # Site / play / admin are served on the HTTP transport (apiPort).
  local site_port="$HTTP_PORT"
  if [ "$HTTP_PORT" = "$WS_PORT" ]; then
    site_port="$API_PORT"
  fi
  echo ""
  echo "  ${GAME_NAME}"
  echo "  ─────────────────────────────────────"
  echo "  Site    http://localhost:${site_port}/"
  echo "  Play    http://localhost:${site_port}/play"
  echo "  Admin   http://localhost:${site_port}/admin/"
  if [ "$site_port" != "$API_PORT" ]; then
    echo "  API     http://localhost:${API_PORT}/"
  fi
  echo "  WS      ws://localhost:${WS_PORT}/"
  echo "  Telnet  localhost ${TELNET_PORT}"
  echo "  ─────────────────────────────────────"
  if [ "$WS_PORT" = "$HTTP_PORT" ]; then
    echo "  Note: :${WS_PORT} is WS-only — open :${site_port}."
  fi
  echo ""
}
