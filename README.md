# UrsaMU

### The Modern MUSH-Like Server

![ursamu header](ursamu_github_banner.png)

## What is UrsaMU?

UrsaMU is a MUSH-like server written in Typescript. It is designed to be a modern, and extensible MUSH-like server.

## What is a MUSH?

A MUSH is a text-based, multi-user, real-time virtual environment. It is a descendant of MUDs, which were the precursors to modern MMORPGs. MUSHes are designed to be highly extensible, and are often used for role-playing games, or social environments.

## What is a MUSH-like?

A MUSH-like is a server that is similar to a MUSH, but is not a MUSH. UrsaMU is a MUSH-like because it is not a MUSH, but it is similar to a MUSH.

## Using UrsaMU

UrsaMU can be used in two ways:

1. **As a standalone server**: You can run UrsaMU as a standalone server and connect to it via telnet or a web client.
2. **As a library**: You can use UrsaMU as a library to build your own custom MU* game with minimal effort.

For information on using UrsaMU as a library, see [README-LIB.md](README-LIB.md).

## Starting the server

To start the server in 'production' mode, make sure you have node installed, I suggest NVM, and then from the `ursamu` folder run:

```bash
git clone https://github.com/ursamu/ursamu.git
cd ursamu
./pup
```

To start the Ursamu server, you can use the following command:

```bash
./pup
```

To stop the Ursamu server, you can use the following command:

```bash
./pup terminate
```

## Configuration

UrsaMU comes with a user-friendly configuration system that allows you to customize the server settings. The configuration is stored in a JSON file in the `/config` directory at the project root.

### Setting Up Configuration

The easiest way to set up your configuration is to use the provided setup script:

```bash
# Run the setup script
deno task setup-config
```

This script will:
1. Create the `/config` directory if it doesn't exist
2. Create a default configuration file if it doesn't exist (using the sample configuration file if available)
3. Prompt you to edit the configuration file using your preferred text editor

A sample configuration file (`config.sample.json`) is provided as a template. You can copy this file to `config/config.json` and modify it to suit your needs.

### Using the Configuration CLI

UrsaMU provides a command-line interface for managing the configuration:

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

### Configuration File

The configuration is stored in a JSON file (`config/config.json`) that can be edited directly. The file is created automatically when the server starts if it doesn't exist.

### Plugin Configuration

Plugins can register their own configuration sections. These are stored in the `plugins` section of the configuration file.

## Plugins

UrsaMU supports a modular plugin system that allows you to extend the functionality of the server. Plugins can register their own configuration sections and are loaded automatically when the server starts.

### Creating a Plugin

The easiest way to create a new plugin is to use the provided script:

```bash
# Create a new plugin
deno task create-plugin my-plugin
```

This will create a new plugin directory with a basic plugin structure, including configuration support.

### Plugin Structure

A plugin is a directory in the `src/plugins` directory with an `index.ts` file that exports a default object implementing the `IPlugin` interface:

```typescript
import { IPlugin } from "../../@types/IPlugin.ts";
import { getConfig } from "../../services/Config/mod.ts";

const myPlugin: IPlugin = {
  name: "my-plugin",
  version: "1.0.0",
  description: "My awesome plugin",
  
  // Plugin configuration
  config: {
    plugins: {
      "my-plugin": {
        enabled: true,
        // Plugin-specific configuration
      }
    }
  },
  
  // Plugin initialization
  init: async () => {
    // Plugin initialization code
    return true;
  }
};

export default myPlugin;
```

### Plugin Configuration

Plugins can register their own configuration sections. These are stored in the `plugins` section of the configuration file:

```json
{
  "plugins": {
    "my-plugin": {
      "enabled": true,
      // Plugin-specific configuration
    }
  }
}
```

Plugins can access their configuration using the `getConfig` function:

```typescript
import { getConfig } from "../../services/Config/mod.ts";

// Get a configuration value
const enabled = getConfig<boolean>("plugins.my-plugin.enabled");
```

## Docker

It is easy to run the game under docker:

```bash
git clone https://github.com/ursamu/ursamu.git
cd ursamu
sudo docker-compose up -d
```

The game database will be exported to the `data/` directory on the host filesystem, for easy backups. The configuration will be stored in the `config/` directory.

## Development on ARM macOS

Deno on ARM can be finicky right now. Here's a workaround:

```bash
git clone https://github.com/LukeChannings/deno-arm64.git deno-arm
cd deno-arm
sudo docker build -t deno-arm
cd ..
git clone https://github.com/ursamu/ursamu.git
cd ursamu
echo "BASE=deno-arm" > .env
sudo docker-compose up -d
```

## Telnet Server

UrsaMU provides a simple telnet server facade that can be used in child projects. This facade handles all the complex telnet logic internally, making it easy to add telnet support to your game.

To use the telnet server in a child project:

```typescript
import { startTelnetServer } from "ursamu";

// Start the telnet server with default options
startTelnetServer();

// Or with custom options
startTelnetServer({
  port: 4201,                    // Custom port
  wsPort: 4202,                  // WebSocket port to connect to
  welcomeFile: "text/welcome.txt" // Custom welcome file
});
```

The telnet server will automatically try to find the welcome file in several locations:
1. As an absolute path (if it starts with '/')
2. Relative to the project root
3. In the text directory of the project
4. Using a default welcome message if no file is found

## License

Ursamu is licensed under the MIT License.

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.
