#!/bin/bash

# Run script for UrsaMU
# This script runs both the UrsaMU main server and telnet server with the necessary flags
# Now with watch mode enabled for automatic reloading on file changes

# Change to the project root directory
cd "$(dirname "$0")/.." || exit

# Function to handle cleanup when the script is terminated
cleanup() {
  echo "Shutting down UrsaMU servers..."
  kill $MAIN_PID $TELNET_PID 2>/dev/null
  exit 0
}

# Set up trap to catch termination signals
trap cleanup SIGINT SIGTERM

# Run the main server with watch mode
echo "Starting UrsaMU main server in watch mode..."
deno run --allow-all --unstable-detect-cjs --unstable-kv --watch src/main.ts &
MAIN_PID=$!

# Run the telnet server with watch mode
echo "Starting UrsaMU telnet server in watch mode..."
deno run --allow-all --unstable-detect-cjs --unstable-kv --watch src/telnet.ts &
TELNET_PID=$!

# Wait for both processes
echo "UrsaMU servers are running in watch mode. Press Ctrl+C to stop."
echo "Servers will automatically restart when files are changed."
wait $MAIN_PID $TELNET_PID

# If we get here, one of the servers has exited
echo "One of the servers has exited. Shutting down..."
cleanup 