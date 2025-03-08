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

# Create the plugin directory
mkdir -p "$PLUGIN_DIR"

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