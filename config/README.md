# UrsaMU Configuration Directory

This directory contains the configuration files for UrsaMU. The main
configuration file is `config.json`, which is created automatically when the
server starts if it doesn't exist.

## Configuration File

The `config.json` file contains the configuration for the server and plugins. It
is a JSON file with the following structure:

```json
{
  "server": {
    "telnet": 4201,
    "ws": 4202,
    "http": 4203,
    "db": "data/ursamu.db",
    "counters": "counters",
    "chans": "chans",
    "mail": "mail",
    "bboard": "bboard"
  },
  "game": {
    "name": "Ursamu",
    "description": "A Modern MUSH-Like engine written in Typescript.",
    "version": "0.0.1",
    "text": {
      "connect": "../text/default_connect.txt"
    },
    "playerStart": "1"
  },
  "plugins": {
    "example": {
      "enabled": true,
      "greeting": "Hello from the example plugin!",
      "features": {
        "feature1": true,
        "feature2": false,
        "feature3": {
          "enabled": true,
          "options": {
            "option1": "value1",
            "option2": 42
          }
        }
      }
    }
  }
}
```

## Managing Configuration

You can manage the configuration using the provided CLI tool:

```bash
# Show the entire configuration
deno task config

# Get a specific configuration value
deno task config --get server.ws

# Set a configuration value
deno task config --set server.ws 4202

# Reset the configuration to default values
deno task config --reset

# Show help (includes the configuration directory path)
deno task config --help
```

You can also edit the `config.json` file directly using a text editor.

## Setting Up Configuration

The easiest way to set up your configuration is to use the provided setup
script:

```bash
# Run the setup script
deno task setup-config
```

This script will:

1. Create the `/config` directory if it doesn't exist
2. Create a default configuration file if it doesn't exist (using the sample
   configuration file if available)
3. Prompt you to edit the configuration file using your preferred text editor
