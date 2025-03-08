#!/bin/bash

# Run script for UrsaMU
# This script runs both the UrsaMU main server and telnet server with the necessary flags

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

# Run the main server
echo "Starting UrsaMU main server..."
deno run --allow-all --unstable-detect-cjs --unstable-kv src/main.ts &
MAIN_PID=$!

# Run the telnet server
echo "Starting UrsaMU telnet server..."
deno run --allow-all --unstable-detect-cjs --unstable-kv src/telnet.ts &
TELNET_PID=$!

# Wait for both processes
echo "UrsaMU servers are running. Press Ctrl+C to stop."
wait $MAIN_PID $TELNET_PID

# If we get here, one of the servers has exited
echo "One of the servers has exited. Shutting down..."
cleanup 