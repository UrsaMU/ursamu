#!/bin/bash
# Start the UrsaMU supervisor in the background.
# Spawns telnet + main; re-spawns main on exit 75 / SIGUSR2 (@reboot).
set -e
cd "$(dirname "$0")/.."

# shellcheck source=scripts/_ports.sh
. "$(dirname "$0")/_ports.sh"
ursamu_read_ports

mkdir -p run logs

if [ -f run/supervisor.pid ] && kill -0 "$(cat run/supervisor.pid)" 2>/dev/null; then
  echo "supervisor already running (pid $(cat run/supervisor.pid))"
  echo "  use: deno task status | stop | restart"
  exit 1
fi
rm -f run/supervisor.pid

ursamu_free_ports
sleep 1

DENO_FLAGS="--allow-all --unstable-detect-cjs --unstable-kv --unstable-net"
ursamu_find_supervisor

echo "Starting UrsaMU supervisor ($ENTRY)..."
nohup deno run $DENO_FLAGS "$ENTRY" >>logs/main.log 2>&1 &
echo $! > run/supervisor.pid
SUP_PID=$(cat run/supervisor.pid)

ok=0
for i in $(seq 1 45); do
  if ! kill -0 "$SUP_PID" 2>/dev/null; then
    echo "ERROR: supervisor exited early. Last log lines:"
    tail -40 logs/main.log 2>/dev/null || true
    rm -f run/supervisor.pid
    exit 1
  fi
  if ursamu_api_ready; then
    ok=1
    break
  fi
  sleep 1
done

echo ""
echo "supervisor pid: $SUP_PID"
echo "logs:           logs/main.log"
if [ "$ok" -eq 1 ]; then
  ursamu_print_access
  echo "ready."
else
  echo "WARNING: server not ready after 45s — check logs/main.log"
  tail -30 logs/main.log 2>/dev/null || true
  exit 1
fi
echo "stop:    deno task stop"
echo "status:  deno task status"
echo "restart: deno task restart  (@reboot / no-disconnect)"
