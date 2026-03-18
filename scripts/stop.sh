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

echo "Stopping UrsaMU..."
if [ -n "$MAIN_PID" ]; then
  kill "$MAIN_PID" 2>/dev/null && echo "  Stopped main server    (PID: $MAIN_PID)" || echo "  Main server already stopped."
fi
if [ -n "$TELNET_PID" ]; then
  kill "$TELNET_PID" 2>/dev/null && echo "  Stopped telnet server  (PID: $TELNET_PID)" || echo "  Telnet server already stopped."
fi

rm -f "$PID_FILE"
echo "Done."
