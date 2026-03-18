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

# Stop main only
if [ -n "$MAIN_PID" ]; then
  kill "$MAIN_PID" 2>/dev/null && echo "Stopped main server (PID: $MAIN_PID)."
fi

# Restart main
mkdir -p "$LOG_DIR"
nohup deno run --allow-all --unstable-detect-cjs --unstable-kv src/main.ts >> "$MAIN_LOG" 2>&1 &
MAIN_PID=$!

# Update PID file — preserve TELNET_PID
printf "MAIN_PID=%s\nTELNET_PID=%s\n" "$MAIN_PID" "$TELNET_PID" > "$PID_FILE"

echo "Main server restarted (PID: $MAIN_PID). Telnet untouched."
