
# Clear the terminal
clear

# Run script for UrsaMU
# This script runs both the UrsaMU main server and telnet server with the necessary flags
# Now with watch mode enabled for automatic reloading on file changes

# Check if data/ursamu.db exists, and if not, we'll need to run interactively for the first time
if [ ! -f "data/ursamu.db" ]; then
  echo "Database not found. Running interactive setup..."
  deno run -A --unstable-detect-cjs --unstable-kv src/main.ts
  echo "Setup complete. Restarting in watch mode..."
fi

# Change to the project root directory
cd "$(dirname "$0")/.." || exit

# Function to handle cleanup when the script is terminated
cleanup() {
  echo "Shutting down UrsaMU servers..."
  kill $MAIN_PID $TELNET_PID $WEB_PID 2>/dev/null
  exit 0
}

# Set up trap to catch termination signals
trap cleanup SIGINT SIGTERM

# Run the main server with watch mode
echo "Starting UrsaMU main server in watch mode..."
# Explicitly watch specific directories and ignore changes in the project root like config/ or data/
# We also include system/scripts as it contains dynamically loaded game commands
deno run --allow-all --unstable-detect-cjs --unstable-kv --watch=src/,system/scripts/ --watch-exclude=config/ src/main.ts &
MAIN_PID=$!

# Run the telnet server with watch mode
echo "Starting UrsaMU telnet server in watch mode..."
deno run --allow-all --unstable-detect-cjs --unstable-kv --watch=src/,system/scripts/ --watch-exclude=config/ src/telnet.ts &
TELNET_PID=$!

# Run the web client
echo "Starting UrsaMU Web Client..."
(cd src/web-client && deno task start) &
WEB_PID=$!

# Wait for both processes
echo "UrsaMU servers are running in watch mode. Press Ctrl+C to stop."
echo "Servers will automatically restart when files are changed."
wait $MAIN_PID $TELNET_PID $WEB_PID

# If we get here, one of the servers has exited
echo "One of the servers has exited. Shutting down..."
cleanup