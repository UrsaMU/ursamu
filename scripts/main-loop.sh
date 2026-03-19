#!/bin/bash
# Restart loop for the UrsaMU main server.
#
# Exit codes the server can produce:
#   75  — @reboot / @update signal → restart with backoff
#   0   — @shutdown / SIGINT clean stop → do not restart
#   *   — unexpected crash → do not restart (investigate logs)
#
# Rapid-restart protection: if the server exits with 75 within FAST_EXIT_SECS
# seconds of starting, the delay doubles (up to MAX_DELAY seconds). A clean
# long-running restart resets the delay back to 1 second.
#
# This script is called by daemon.sh and should not be run directly.

cd "$(dirname "$0")/.." || exit 1

LOG_DIR="logs"
MAIN_LOG="${MAIN_LOG:-$LOG_DIR/main.log}"
DENO_PID_FILE=".ursamu-deno.pid"
DENO_ARGS=(--allow-all --unstable-detect-cjs --unstable-kv)

RESTART_DELAY=1      # seconds to wait before next restart
MAX_DELAY=60         # cap on exponential backoff
FAST_EXIT_SECS=5     # exits faster than this are considered "rapid"

mkdir -p "$LOG_DIR"

# On SIGTERM (sent by stop.sh when it kills our PID), forward to the running
# deno child so it gets a clean shutdown signal, then exit the loop.
_deno_pid=""
cleanup() {
  if [ -n "$_deno_pid" ]; then
    kill "$_deno_pid" 2>/dev/null
    wait "$_deno_pid" 2>/dev/null
  fi
  rm -f "$DENO_PID_FILE"
  exit 0
}
trap cleanup SIGTERM SIGINT

while true; do
  START_TS=$(date +%s)
  deno run "${DENO_ARGS[@]}" src/main.ts >> "$MAIN_LOG" 2>&1 &
  _deno_pid=$!
  echo "$_deno_pid" > "$DENO_PID_FILE"

  wait "$_deno_pid"
  EXIT_CODE=$?
  _deno_pid=""
  rm -f "$DENO_PID_FILE"

  END_TS=$(date +%s)
  RUN_SECS=$(( END_TS - START_TS ))
  TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S')"

  if [ $EXIT_CODE -eq 75 ]; then
    # Exponential backoff for rapid restarts; reset delay after a stable run.
    if [ $RUN_SECS -lt $FAST_EXIT_SECS ]; then
      RESTART_DELAY=$(( RESTART_DELAY * 2 ))
      [ $RESTART_DELAY -gt $MAX_DELAY ] && RESTART_DELAY=$MAX_DELAY
      echo "[$TIMESTAMP] Rapid reboot (ran ${RUN_SECS}s) — backing off ${RESTART_DELAY}s..." >> "$MAIN_LOG"
    else
      RESTART_DELAY=1
      echo "[$TIMESTAMP] Reboot signal (75) — restarting in ${RESTART_DELAY}s..." >> "$MAIN_LOG"
    fi
    sleep $RESTART_DELAY
    continue
  elif [ $EXIT_CODE -eq 0 ]; then
    echo "[$TIMESTAMP] Clean shutdown (0) — loop stopped." >> "$MAIN_LOG"
    break
  else
    echo "[$TIMESTAMP] Unexpected exit ($EXIT_CODE) — loop stopped. Check logs." >> "$MAIN_LOG"
    break
  fi
done
