#!/bin/bash
# Start UrsaMU in the background with logging and PID tracking.

cd "$(dirname "$0")/.." || exit 1

PID_FILE=".ursamu.pid"
LOG_DIR="logs"
MAIN_LOG="$LOG_DIR/main.log"
TELNET_LOG="$LOG_DIR/telnet.log"

# Check if already running
if [ -f "$PID_FILE" ]; then
  # shellcheck disable=SC1090
  source "$PID_FILE"
  if kill -0 "$MAIN_PID" 2>/dev/null || kill -0 "$TELNET_PID" 2>/dev/null; then
    echo "UrsaMU is already running (main: $MAIN_PID, telnet: $TELNET_PID)"
    echo "Run 'deno task stop' first."
    exit 1
  fi
fi

mkdir -p "$LOG_DIR"

# Start telnet first — it stays up across main restarts.
nohup deno run --allow-all --unstable-detect-cjs --unstable-kv src/telnet.ts >> "$TELNET_LOG" 2>&1 &
TELNET_PID=$!

# Start main server (via start.ts restart loop).
nohup deno run --allow-all --unstable-detect-cjs --unstable-kv src/main.ts >> "$MAIN_LOG" 2>&1 &
MAIN_PID=$!

# Save PIDs
printf "MAIN_PID=%s\nTELNET_PID=%s\n" "$MAIN_PID" "$TELNET_PID" > "$PID_FILE"

# Read ports from config if available, otherwise use defaults
HTTP_PORT=${URSAMU_HTTP_PORT:-4203}
TELNET_PORT=${URSAMU_TELNET_PORT:-4201}

echo ""
echo "UrsaMU started."
echo "  Telnet  : port $TELNET_PORT  (PID: $TELNET_PID)  log: $TELNET_LOG"
echo "  HTTP/WS : port $HTTP_PORT  (PID: $MAIN_PID)  log: $MAIN_LOG"
echo ""
echo "  deno task stop    — stop all servers"
echo "  deno task restart — stop + start"
echo "  deno task status  — check running state"
echo "  deno task logs    — follow logs"
