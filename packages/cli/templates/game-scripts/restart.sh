#!/bin/bash
# No-disconnect restart via supervisor SIGUSR2 (@reboot).
cd "$(dirname "$0")/.." || exit

# shellcheck source=scripts/_ports.sh
. "$(dirname "$0")/_ports.sh"
ursamu_read_ports

if [ ! -f run/supervisor.pid ]; then
  echo "Supervisor not running — start with: deno task daemon"
  exit 1
fi

pid=$(cat run/supervisor.pid)
if ! kill -0 "$pid" 2>/dev/null; then
  echo "Stale supervisor pidfile (pid $pid). Run: deno task daemon"
  exit 1
fi

echo "Signaling supervisor (pid $pid) — main restarts, telnet stays up."
kill -USR2 "$pid"

if ursamu_wait_ready 30; then
  echo "Ready — http://localhost:${HTTP_PORT}/play"
  exit 0
fi
echo "WARNING: server not back yet — check logs/main.log"
exit 1
