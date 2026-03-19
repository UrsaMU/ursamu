#!/bin/bash
# Restart only the main server — telnet stays up and reconnects automatically.

cd "$(dirname "$0")/.." || exit 1

PID_FILE=".ursamu.pid"
LOG_DIR="logs"
MAIN_LOG="$LOG_DIR/main.log"

if [ ! -f "$PID_FILE" ]; then
  echo "UrsaMU is not running (no PID file). Use 'deno task daemon' to start."
  exit 1
fi

# shellcheck disable=SC1090
source "$PID_FILE"

DENO_PID_FILE=".ursamu-deno.pid"

# Stop main loop + inner deno process
if [ -n "$MAIN_PID" ]; then
  kill "$MAIN_PID" 2>/dev/null && echo "Stopped main loop (PID: $MAIN_PID)."
  sleep 1
fi
if [ -f "$DENO_PID_FILE" ]; then
  kill "$(cat "$DENO_PID_FILE")" 2>/dev/null || true
  rm -f "$DENO_PID_FILE"
fi

# Restart via the loop script
mkdir -p "$LOG_DIR"
chmod +x "$(dirname "$0")/main-loop.sh"
MAIN_LOG="$MAIN_LOG" nohup bash "$(dirname "$0")/main-loop.sh" >> /dev/null 2>&1 &
MAIN_PID=$!

# Update PID file — preserve TELNET_PID
printf "MAIN_PID=%s\nTELNET_PID=%s\n" "$MAIN_PID" "$TELNET_PID" > "$PID_FILE"

echo "Main server restarted via loop (PID: $MAIN_PID). Telnet untouched."
