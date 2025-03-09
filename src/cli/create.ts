#!/usr/bin/env -S deno run -A

import { parse } from "https://deno.land/std@0.204.0/flags/mod.ts";
import { join, dirname, fromFileUrl } from "https://deno.land/std@0.204.0/path/mod.ts";
import { existsSync } from "https://deno.land/std@0.204.0/fs/mod.ts";

// Get the directory of the current script
const __dirname = dirname(fromFileUrl(import.meta.url));
// Get the root directory of the project

// Parse command line arguments
const args = parse(Deno.args, {
  boolean: ["help"],
  alias: {
    h: "help",
  },
});

// Show help
if (args.help || args._.length === 0) {
  console.log(`
UrsaMU Project Creator

Usage:
  ursamu create <project-name> [options]

Options:
  -h, --help          Show this help message

Examples:
  ursamu create my-game
  `);
  Deno.exit(0);
}

const projectName = args._[0].toString();
const currentDir = Deno.cwd();
const targetDir = join(currentDir, projectName);

// Check if the project directory already exists
if (existsSync(targetDir)) {
  console.error(`Error: Directory already exists at ${targetDir}`);
  Deno.exit(1);
}

// Create the project directory
console.log(`Creating new UrsaMU project: ${projectName}`);
Deno.mkdir(targetDir);

// Create the basic project structure
const directories = [
  "config",
  "data",
  "src",
  "src/plugins",
  "text",
  "help",
  "scripts",
];

for (const dir of directories) {
  Deno.mkdir(join(targetDir, dir), { recursive: true });
  console.log(`Created directory: ${dir}`);
}

// Create the main.ts file
const mainTsContent = `import { mu } from "ursamu";

// Initialize the UrsaMU engine with custom configuration
const config = {
  server: {
    telnet: 4201,
    ws: 4202,
    http: 4203,
    db: "data/ursamu.db",
    counters: "data/counters.db",
    chans: "data/chans.db",
    mail: "data/mail.db",
    bboard: "data/bboard.db"
  },
  game: {
    name: "${projectName}",
    description: "A custom UrsaMU game",
    version: "0.0.1",
    text: {
      connect: "text/default_connect.txt"
    },
    playerStart: "1"
  }
};

// Start the game engine
const game = await mu(config);

console.log(\`\${game.config.get("game.name")} main server is running!\`);
`;

await Deno.writeTextFile(join(targetDir, "src", "main.ts"), mainTsContent);
console.log("Created src/main.ts");

// Create the telnet.ts file
const telnetTsContent = `import { startTelnetServer } from "ursamu";

// Start the telnet server with the correct welcome file path
startTelnetServer({
  welcomeFile: "text/default_connect.txt"
});

console.log("Telnet server is running!");
`;

await Deno.writeTextFile(join(targetDir, "src", "telnet.ts"), telnetTsContent);
console.log("Created src/telnet.ts");

// Create the run.sh script
const runShContent = `#!/bin/bash

# Run script for ${projectName}
# This script runs both the main server and telnet server with the necessary flags
# With watch mode enabled for automatic reloading on file changes

# Change to the project root directory
cd "\$(dirname "\$0")/.." || exit

# Function to handle cleanup when the script is terminated
cleanup() {
  echo "Shutting down servers..."
  kill \$MAIN_PID \$TELNET_PID 2>/dev/null
  exit 0
}

# Set up trap to catch termination signals
trap cleanup SIGINT SIGTERM

# Run the main server with watch mode
echo "Starting main server in watch mode..."
deno run --allow-all --unstable-detect-cjs --unstable-kv --watch src/main.ts &
MAIN_PID=\$!

# Run the telnet server with watch mode
echo "Starting telnet server in watch mode..."
deno run --allow-all --unstable-detect-cjs --unstable-kv --watch src/telnet.ts &
TELNET_PID=\$!

# Wait for both processes
echo "Servers are running in watch mode. Press Ctrl+C to stop."
echo "Servers will automatically restart when files are changed."
echo "Main server and telnet server can restart independently."
wait \$MAIN_PID \$TELNET_PID

# If we get here, one of the servers has exited
echo "One of the servers has exited. Shutting down..."
cleanup
`;

await Deno.writeTextFile(join(targetDir, "scripts", "run.sh"), runShContent);
console.log("Created scripts/run.sh");

// Make the run.sh script executable
try {
  await Deno.chmod(join(targetDir, "scripts", "run.sh"), 0o755);
  console.log("Made scripts/run.sh executable");
} catch (error) {
  console.warn("Warning: Could not make scripts/run.sh executable. You may need to do this manually.");
}

// Create the default_connect.txt file with the complete content
const connectTextContent = `%ch%cc==================================%cn
%ch%cw Welcome to %cy${projectName}%cn
%ch%cc==================================%cn

A modern MUSH-like engine written in TypeScript.

%ch%cwType %cy'connect <n> <password>'%cw to connect.%cn
%ch%cwType %cy'create <n> <password>'%cw to create a new character.%cn
%ch%cwType %cy'quit'%cw to disconnect.%cn

888     888 8888888b.   .d8888b.        d8888 888b     d888 888     888 
888     888 888   Y88b d88P  Y88b      d88888 8888b   d8888 888     888 
888     888 888    888 Y88b.          d88P888 88888b.d88888 888     888 
888     888 888   d88P  "Y888b.      d88P 888 888Y88888P888 888     888 
888     888 8888888P"      "Y88b.   d88P  888 888 Y888P 888 888     888 
888     888 888 T88b         "888  d88P   888 888  Y8P  888 888     888 
Y88b. .d88P 888  T88b  Y88b  d88P d8888888888 888   "   888 Y88b. .d88P 
 "Y88888P"  888   T88b  "Y8888P" d88P     888 888       888  "Y88888P"  

>> A Next Generation MU*. https://ursamu.io

Use 'create <name> <password>' to create a new character. 
Use 'connect <name> <password>' to connect to the game.

Uae 'QUIT' to exit.`;

await Deno.writeTextFile(join(targetDir, "text", "default_connect.txt"), connectTextContent);
console.log("Created text/default_connect.txt with complete content");

// Create a deno.json file
const denoJsonContent = `{
  "nodeModulesDir": "auto",
  "tasks": {
    "start": "bash ./scripts/run.sh",
    "dev": "deno run -A --watch --unstable-detect-cjs --unstable-kv ./src/main.ts",
    "telnet": "deno run -A --watch --unstable-detect-cjs --unstable-kv ./src/telnet.ts"
  },
  "compilerOptions": {
    "lib": ["deno.window"],
    "types": ["./node_modules/@types/node/index.d.ts"]
  },
  "imports": {
    "ursamu": "npm:ursamu"
  }
}`;

await Deno.writeTextFile(join(targetDir, "deno.json"), denoJsonContent);
console.log("Created deno.json");

// Create a README.md file
const readmeContent = `# ${projectName}

A custom UrsaMU game built with the UrsaMU engine.

## Architecture

This project uses a dual-server architecture:
- **Main Server**: Handles the core game logic, database operations, and web interfaces
- **Telnet Server**: Runs as a separate process to handle telnet connections

Both servers can restart independently when their respective files change, thanks to watch mode.

## Getting Started

### Running Both Servers

To start both the main server and telnet server with watch mode:

\`\`\`bash
deno task start
# or
bash ./scripts/run.sh
\`\`\`

This will:
- Start both servers as separate processes
- Enable watch mode for automatic reloading when files change
- Allow each server to restart independently

### Running Individual Servers

For development with individual servers:

\`\`\`bash
# Main server only with watch mode
deno task dev

# Telnet server only with watch mode
deno task telnet
\`\`\`

## Connecting to the Game

Once the servers are running, you can connect using:
- **Telnet**: localhost:4201
- **WebSocket**: localhost:4202
- **HTTP**: localhost:4203

## Project Structure

- \`/src\`: Source code
  - \`main.ts\`: Main server entry point
  - \`telnet.ts\`: Telnet server entry point
  - \`/plugins\`: Custom plugins
- \`/scripts\`: Utility scripts
  - \`run.sh\`: Script to run both servers with watch mode
- \`/text\`: Text files used by the game
- \`/help\`: Help files
- \`/config\`: Configuration files
- \`/data\`: Database files

## Configuration

The game configuration is stored in the \`config/config.json\` file.

## Customizing

### Text Files

Edit text files in the \`text\` directory, including:
- \`default_connect.txt\`: The welcome screen shown to connecting players

### Adding Plugins

Create custom plugins in the \`src/plugins\` directory.
`;

await Deno.writeTextFile(join(targetDir, "README.md"), readmeContent);
console.log("Created README.md");

// Create a .gitignore file
const gitignoreContent = `# Deno
.deno/
.vscode/.deno/

# Environment
.env

# Database files
data/*.db

# Configuration
config/config.json

# Node modules
node_modules/
`;

await Deno.writeTextFile(join(targetDir, ".gitignore"), gitignoreContent);
console.log("Created .gitignore");

console.log(`
Project ${projectName} created successfully!

To get started:
  cd ${projectName}
  deno task start

This will start your UrsaMU game with both main and telnet servers in watch mode.
The servers will automatically restart when files are changed.
Connect to the game using:
  - Telnet: localhost:4201
  - WebSocket: localhost:4202
  - HTTP: localhost:4203
`); 