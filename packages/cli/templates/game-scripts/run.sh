#!/bin/bash
# Foreground run via the same supervisor as daemon (Ctrl+C stops all).
set -e
cd "$(dirname "$0")/.." || exit

# shellcheck source=scripts/_ports.sh
. "$(dirname "$0")/_ports.sh"
ursamu_read_ports

mkdir -p run logs
ursamu_free_ports
sleep 1

DENO_FLAGS="--allow-all --minimum-dependency-age=0 --unstable-detect-cjs --unstable-kv --unstable-net"
ursamu_find_supervisor

ursamu_print_access
echo "  supervisor: $ENTRY"
echo "  (Ctrl+C to stop)"
echo ""

exec deno run $DENO_FLAGS "$ENTRY"
