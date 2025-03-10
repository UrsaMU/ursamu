#!/bin/bash

# Check if a plugin name was provided
if [ -z "$1" ]; then
  echo "Usage: $0 <plugin-name>"
  echo "Example: $0 my-plugin"
  exit 1
fi

PLUGIN_NAME=$1
PLUGIN_DIR="src/plugins/$PLUGIN_NAME"

# Check if the plugin directory already exists
if [ -d "$PLUGIN_DIR" ]; then
  echo "Error: Plugin directory already exists at $PLUGIN_DIR"
  exit 1
fi

# Create the plugin directory and scripts directory
mkdir -p "$PLUGIN_DIR"
mkdir -p "$PLUGIN_DIR/scripts"
mkdir -p "$PLUGIN_DIR/src"

# Create the plugin index.ts file
cat > "$PLUGIN_DIR/index.ts" << EOF
import { IPlugin } from "../../@types/IPlugin.ts";
import { getConfig } from "../../services/Config/mod.ts";

// Define a custom configuration interface for the plugin
interface ${PLUGIN_NAME^}PluginConfig {
  enabled: boolean;
  // Add your plugin-specific configuration properties here
}

/**
 * ${PLUGIN_NAME^} plugin
 */
const ${PLUGIN_NAME}Plugin: IPlugin = {
  name: "${PLUGIN_NAME}",
  version: "1.0.0",
  description: "${PLUGIN_NAME^} plugin",
  
  // Plugin configuration
  config: {
    plugins: {
      ${PLUGIN_NAME}: {
        enabled: true,
        // Add your plugin-specific configuration here
      }
    }
  },
  
  // Plugin initialization
  init: async () => {
    console.log("Initializing ${PLUGIN_NAME} plugin...");
    
    // Access the plugin's configuration
    const enabled = getConfig<boolean>("plugins.${PLUGIN_NAME}.enabled");
    
    if (enabled) {
      console.log("${PLUGIN_NAME^} plugin is enabled");
      
      // Add your plugin initialization code here
      
    } else {
      console.log("${PLUGIN_NAME^} plugin is disabled");
    }
    
    return true;
  }
};

export default ${PLUGIN_NAME}Plugin;
EOF

# Create the main.ts file
cat > "$PLUGIN_DIR/src/main.ts" << EOF
// Main server for ${PLUGIN_NAME} plugin
console.log("Starting ${PLUGIN_NAME} main server...");

// Add your main server code here

EOF

# Create the telnet.ts file
cat > "$PLUGIN_DIR/src/telnet.ts" << EOF
// Telnet server for ${PLUGIN_NAME} plugin
console.log("Starting ${PLUGIN_NAME} telnet server...");

// Add your telnet server code here

EOF

# Create the run.sh script
cat > "$PLUGIN_DIR/scripts/run.sh" << EOF
#!/bin/bash

# Run script for ${PLUGIN_NAME^} Plugin
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
EOF

# Make the run.sh script executable
chmod +x "$PLUGIN_DIR/scripts/run.sh"

echo "Plugin created at $PLUGIN_DIR"
echo ""
echo "To use this plugin, you need to:"
echo "1. Import it in your main.ts file or load it using the loadPlugins function"
echo "2. Configure it in your config/config.json file"
echo ""
echo "Example configuration in config/config.json:"
echo "{
  \"plugins\": {
    \"${PLUGIN_NAME}\": {
      \"enabled\": true,
      // Add your plugin-specific configuration here
    }
  }
}"
echo ""
echo "To run the plugin servers with watch mode:"
echo "cd $PLUGIN_DIR && ./scripts/run.sh" 