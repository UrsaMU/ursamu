#!/bin/bash
# Simplified config setup for UrsaMU
mkdir -p config
if [ ! -f config/config.json ]; then
  echo '{"server": {"telnet": 4201, "http": 4203}}' > config/config.json
  echo "Default config created at config/config.json"
fi