#!/bin/bash

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
URSAMU_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"

# Check if a command was provided
if [ $# -eq 0 ]; then
  echo "Usage: ursamu <command> [options]"
  echo ""
  echo "Available commands:"
  echo "  create <project-name>  Create a new UrsaMU project"
  echo "  help                   Show this help message"
  exit 1
fi

COMMAND=$1
shift

case $COMMAND in
  create)
    # Check if a project name was provided
    if [ $# -eq 0 ]; then
      echo "Usage: ursamu create <project-name>"
      echo "Example: ursamu create my-game"
      exit 1
    fi
    
    # Run the create CLI script
    deno run -A "$URSAMU_DIR/src/cli/create.ts" "$@"
    ;;
    
  help)
    echo "UrsaMU CLI"
    echo ""
    echo "Usage: ursamu <command> [options]"
    echo ""
    echo "Available commands:"
    echo "  create <project-name>  Create a new UrsaMU project"
    echo "  help                   Show this help message"
    ;;
    
  *)
    echo "Unknown command: $COMMAND"
    echo "Run 'ursamu help' for usage information"
    exit 1
    ;;
esac 