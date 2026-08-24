#!/bin/bash
# Supervisor + port status (ports from config/config.json).
cd "$(dirname "$0")/.." || exit

# shellcheck source=scripts/_ports.sh
. "$(dirname "$0")/_ports.sh"
ursamu_read_ports

echo "$GAME_NAME"
pidfile="run/supervisor.pid"
if [ ! -f "$pidfile" ]; then
  echo "  supervisor  not running"
else
  pid=$(cat "$pidfile")
  if kill -0 "$pid" 2>/dev/null; then
    echo "  supervisor  running (pid $pid)"
  else
    echo "  supervisor  stale pidfile (pid $pid)"
  fi
fi

printf "  %-8s " "telnet"
bound=$(lsof -ti ":$TELNET_PORT" 2>/dev/null || true)
if [ -n "$bound" ]; then echo "bound on :$TELNET_PORT (pid $bound)"; else echo ":$TELNET_PORT free"; fi

printf "  %-8s " "ws"
bound=$(lsof -ti ":$WS_PORT" 2>/dev/null || true)
if [ -n "$bound" ]; then echo "bound on :$WS_PORT (pid $bound)"; else echo ":$WS_PORT free"; fi

printf "  %-8s " "http"
bound=$(lsof -ti ":$HTTP_PORT" 2>/dev/null || true)
if [ -n "$bound" ]; then echo "bound on :$HTTP_PORT (pid $bound)"; else echo ":$HTTP_PORT free"; fi

if [ "$API_PORT" != "$HTTP_PORT" ]; then
  printf "  %-8s " "api"
  bound=$(lsof -ti ":$API_PORT" 2>/dev/null || true)
  if [ -n "$bound" ]; then echo "bound on :$API_PORT (pid $bound)"; else echo ":$API_PORT free"; fi
fi

if ursamu_api_ready; then
  site_port="$HTTP_PORT"
  if [ "$HTTP_PORT" = "$WS_PORT" ]; then
    site_port="$API_PORT"
  fi
  echo "  API       ok"
  echo "  Play      http://localhost:${site_port}/play"
else
  echo "  API       not responding"
fi
