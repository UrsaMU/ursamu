
# Clear the terminal
clear

# UrsaMU dev runner
#
# Runs start.ts under --watch so both hot-reload and @restart work correctly:
#
#   Code change in src/ or system/  →  --watch restarts start.ts
#                                        → start.ts re-spawns main.ts + telnet
#
#   Admin types @restart in game    →  main.ts calls Deno.exit(75)
#                                        → start.ts restart loop re-spawns main.ts
#                                           (telnet stays up across @restart)
#
# This is the Deno-idiomatic approach: Deno.exit(code) + a supervising wrapper.
# The old approach of running main.ts directly with --watch didn't handle
# @restart because --watch only reacts to file changes, not exit codes.

# Change to the project root directory
cd "$(dirname "$0")/.." || exit

# First-time setup: run interactive superuser creation if DB doesn't exist yet.
# start.ts does this too, but TTY interaction works better here before backgrounding.
if [ ! -f "data/ursamu.db" ]; then
  echo "Database not found. Running interactive setup..."
  deno run -A --unstable-detect-cjs --unstable-kv --unstable-net src/main.ts
  echo "Setup complete. Starting in watch mode..."
fi

cleanup() {
  echo "Shutting down UrsaMU..."
  kill $START_PID 2>/dev/null
  exit 0
}

trap cleanup SIGINT SIGTERM

echo "Starting UrsaMU (watch mode)..."
# start.ts supervises both main.ts and telnet.ts as child processes.
# --watch on src/ and system/ triggers a full restart when source files change.
deno run --allow-all --unstable-detect-cjs --unstable-kv --unstable-net \
  --watch=src/,system/ \
  --watch-exclude=config/,data/ \
  src/cli/start.ts &
START_PID=$!

echo "Servers are running. Press Ctrl+C to stop."
echo "  Code changes  → auto-reload (full restart)"
echo "  @restart      → main.ts only restarts, telnet stays up"

wait $START_PID
cleanup
