#!/bin/bash

# Create the config directory if it doesn't exist
mkdir -p config

# Check if the config file exists
if [ ! -f config/config.json ]; then
  echo "Creating default configuration file..."
  
  # Check if the sample config file exists
  if [ -f config.sample.json ]; then
    # Copy the sample config file
    cp config.sample.json config/config.json
    echo "Default configuration file created from sample at config/config.json"
  else
    # Generate the config file using the CLI
    deno task config > config/config.json
    echo "Default configuration file created at config/config.json"
  fi
else
  echo "Configuration file already exists at config/config.json"
fi

# Prompt the user to edit the configuration
echo ""
echo "Would you like to edit the configuration file? (y/n)"
read -r response
if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
  # Try to use the user's preferred editor
  if [ -n "$EDITOR" ]; then
    $EDITOR config/config.json
  elif command -v nano &> /dev/null; then
    nano config/config.json
  elif command -v vim &> /dev/null; then
    vim config/config.json
  elif command -v vi &> /dev/null; then
    vi config/config.json
  else
    echo "No text editor found. Please edit config/config.json manually."
  fi
fi

echo ""
echo "Configuration setup complete. You can edit the configuration at any time by:"
echo "1. Editing config/config.json directly"
echo "2. Using the configuration CLI: deno task config"
echo ""
echo "Examples:"
echo "  deno task config --get server.ws"
echo "  deno task config --set server.ws 4202"
echo "  deno task config --reset"
echo "  deno task config --help" 