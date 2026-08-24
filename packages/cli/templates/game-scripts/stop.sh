#!/bin/bash
# Stop supervisor (main + telnet). Disconnects everyone.
cd "$(dirname "$0")/.." || exit

# shellcheck source=scripts/_ports.sh
. "$(dirname "$0")/_ports.sh"
ursamu_read_ports

pidfile="run/supervisor.pid"
if [ -f "$pidfile" ]; then
  pid=$(cat "$pidfile")
  if kill -0 "$pid" 2>/dev/null; then
    echo "Stopping supervisor (pid $pid)..."
    kill "$pid" 2>/dev/null || true
    for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.4
    done
    if kill -0 "$pid" 2>/dev/null; then
      echo "Force kill supervisor..."
      kill -9 "$pid" 2>/dev/null || true
    fi
  else
    echo "Stale supervisor pidfile (pid $pid)."
  fi
  rm -f "$pidfile"
else
  echo "No supervisor.pid — sweeping ports."
fi

ursamu_free_ports
echo "Stopped."
