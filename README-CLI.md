# UrsaMU CLI

The UrsaMU CLI provides a set of commands to help you work with UrsaMU projects.

## Installation

You can install the UrsaMU CLI globally using Deno's built-in installation mechanism:

```bash
# Install the CLI globally
deno install --allow-all --name ursamu --global --force https://raw.githubusercontent.com/ursamu/ursamu/main/src/cli/ursamu.ts
```

Alternatively, if you have cloned the repository locally:

```bash
# Navigate to the ursamu directory
cd path/to/ursamu

# Install from local file
deno install --allow-all --name ursamu --global --force ./src/cli/ursamu.ts

# Or use the provided task
deno task install-cli
```

This will make the `ursamu` command available globally in your system.

## Usage

```bash
ursamu <command> [options]
```

### Available Commands

#### Create a New Project

```bash
ursamu create <project-name>
```

This command creates a new UrsaMU project with the specified name. The project will be created in a new directory with the same name.

Example:

```bash
ursamu create my-game
```

This will create a new directory called `my-game` with a basic UrsaMU project structure.

#### Help

```bash
ursamu help
```

Shows help information about the available commands.

#### Version

```bash
ursamu --version
```

Shows the version of the UrsaMU CLI.

## Project Structure

When you create a new project with `ursamu create`, the following structure is created:

```
my-game/
├── config/
├── data/
├── help/
├── src/
│   └── plugins/
│   └── main.ts
├── text/
│   └── default_connect.txt
├── .gitignore
├── deno.json
└── README.md
```

## Getting Started

After creating a new project, you can start it with:

```bash
cd my-game
deno task start
```

This will start your UrsaMU game. You can connect to it using:
- Telnet: localhost:4201
- WebSocket: localhost:4202
- HTTP: localhost:4203

For development with auto-reload:

```bash
deno task dev
``` 