#!/bin/bash
# Safe package/code update for UrsaMU games.
#
# 1. git fetch + ff-only pull (or reset if FORCE_RESET=1)
# 2. merge config.sample.json → config/config.json (plugins list + plugins.*)
# 3. deno cache --reload --minimum-dependency-age=0 (game can stay up)
# 4. optional --reboot → scripts/restart.sh (telnet stays up)
#
# Usage:
#   bash scripts/safe-update.sh              # prepare only
#   bash scripts/safe-update.sh --reboot     # prepare + soft-reboot
#   bash scripts/safe-update.sh check        # outdated pins only (no write)
set -euo pipefail
export PATH="${HOME}/.deno/bin:/usr/local/bin:/usr/bin:/bin:${PATH}"
cd "$(dirname "$0")/.." || exit 1

log() { echo "[safe-update] $*"; }

MODE="prepare"
REBOOT=0
for arg in "$@"; do
  case "$arg" in
    check|--check) MODE="check" ;;
    --reboot|-r)   REBOOT=1 ;;
    -h|--help)
      sed -n '2,20p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
  esac
done

log "HEAD: $(git log -1 --oneline 2>/dev/null || echo 'not a git repo')"

if [ "$MODE" = "check" ]; then
  deno run -A --unstable-kv --minimum-dependency-age=0 \
    jsr:@ursamu/cli update --dry-run 2>/dev/null \
    || log "tip: run 'ursamu update --dry-run' for pin check"
  exit 0
fi

# --- git -------------------------------------------------------------------
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git fetch origin 2>/dev/null || git fetch 2>/dev/null || true
  if [ "${FORCE_RESET:-0}" = "1" ]; then
    git reset --hard origin/main 2>/dev/null \
      || git reset --hard origin/master 2>/dev/null \
      || true
  else
    git pull --ff-only 2>/dev/null \
      || log "git pull skipped/failed (continue with local tree)"
  fi
  log "HEAD after: $(git log -1 --oneline 2>/dev/null || echo '?')"
fi

# --- merge live config from sample -----------------------------------------
python3 - <<'PY'
import json, sys
from pathlib import Path

def deep_merge(base, over):
    if isinstance(base, dict) and isinstance(over, dict):
        out = dict(base)
        for k, v in over.items():
            out[k] = deep_merge(out[k], v) if k in out else v
        return out
    return over

def ensure_plugins(live, sample):
    seen, out = set(), []
    for n in sample + live:
        n = str(n).strip()
        if n and n not in seen:
            seen.add(n); out.append(n)
    return out

live_p = Path("config/config.json")
sample_p = Path("config/config.sample.json")
live = json.loads(live_p.read_text()) if live_p.exists() else {}
sample = json.loads(sample_p.read_text()) if sample_p.exists() else {}
if not sample:
    print("[safe-update] no config.sample.json — skip merge")
    sys.exit(0)

srv = live.setdefault("server", {})
sp = list((sample.get("server") or {}).get("plugins") or [])
lp = list(srv.get("plugins") or [])
if sp:
    before = set(lp)
    merged = ensure_plugins(lp, sp)
    srv["plugins"] = merged
    added = [p for p in merged if p not in before]
    if added:
        print("[safe-update] plugins added:", ", ".join(added))
    else:
        print("[safe-update] server.plugins ok")

pl = live.setdefault("plugins", {})
for key, val in (sample.get("plugins") or {}).items():
    if key not in pl:
        pl[key] = val
        print(f"[safe-update] plugins.{key}: added")
    else:
        prev = json.dumps(pl[key], sort_keys=True)
        pl[key] = deep_merge(pl[key], val)
        if json.dumps(pl[key], sort_keys=True) != prev:
            print(f"[safe-update] plugins.{key}: merged")

live_p.parent.mkdir(parents=True, exist_ok=True)
live_p.write_text(json.dumps(live, indent=2) + "\n")
print("[safe-update] config written")
PY

# --- pin bump via CLI when available ---------------------------------------
if command -v deno >/dev/null 2>&1; then
  log "bumping JSR pins (ursamu update)..."
  deno run -A --unstable-kv --minimum-dependency-age=0 \
    jsr:@ursamu/cli update 2>&1 \
    || log "ursamu update finished with warnings"
fi

# --- cache reload ----------------------------------------------------------
log "caching packages..."
rm -f deno.lock
rm -rf node_modules
ENTRIES=()
for e in src/main.ts src/telnet.ts; do
  [ -f "$e" ] && ENTRIES+=("$e")
done
if [ "${#ENTRIES[@]}" -eq 0 ]; then
  log "ERROR: no entrypoints found"
  exit 1
fi
if ! deno cache --reload --minimum-dependency-age=0 "${ENTRIES[@]}"; then
  log "ERROR: deno cache failed — aborting reboot"
  exit 1
fi
log "cache ok"

# --- optional soft reboot --------------------------------------------------
if [ "$REBOOT" = "1" ]; then
  if [ -x scripts/restart.sh ]; then
    log "soft-reboot (scripts/restart.sh)"
    bash scripts/restart.sh
  elif [ -f run/supervisor.pid ]; then
    kill -USR2 "$(cat run/supervisor.pid)" 2>/dev/null || true
  else
    log "no supervisor — start with: bash scripts/daemon.sh"
  fi
  ok=0
  for i in $(seq 1 60); do
    if curl -sf -m 2 http://127.0.0.1:4203/ >/dev/null 2>&1 \
       || curl -sf -m 2 http://127.0.0.1:4203/api/v1/help >/dev/null 2>&1; then
      log "ready at ${i}s"
      ok=1
      break
    fi
    sleep 1
  done
  [ -x scripts/status.sh ] && bash scripts/status.sh || true
  if [ "$ok" != "1" ]; then
    log "WARNING: health check did not pass"
    tail -30 logs/main.log 2>/dev/null || true
    exit 2
  fi
fi

log "done"
