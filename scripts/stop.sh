#!/bin/bash
# Stop background UrsaMU processes.

cd "$(dirname "$0")/.." || exit 1

PID_FILE=".ursamu.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "UrsaMU is not running (no PID file found)."
  exit 0
fi

# shellcheck disable=SC1090
source "$PID_FILE"

DENO_PID_FILE=".ursamu-deno.pid"

echo "Stopping UrsaMU..."
if [ -n "$MAIN_PID" ]; then
  # Killing the loop sends SIGTERM → main-loop.sh forwards it to the deno child.
  kill "$MAIN_PID" 2>/dev/null && echo "  Stopped main loop      (PID: $MAIN_PID)" || echo "  Main loop already stopped."
fi
# Belt-and-suspenders: also kill the deno process directly if the pid file exists.
if [ -f "$DENO_PID_FILE" ]; then
  DENO_PID="$(cat "$DENO_PID_FILE")"
  kill "$DENO_PID" 2>/dev/null && echo "  Stopped deno server    (PID: $DENO_PID)" || true
  rm -f "$DENO_PID_FILE"
fi
if [ -n "$TELNET_PID" ]; then
  kill "$TELNET_PID" 2>/dev/null && echo "  Stopped telnet server  (PID: $TELNET_PID)" || echo "  Telnet server already stopped."
fi

rm -f "$PID_FILE"
echo "Done."
