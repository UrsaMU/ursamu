import { IPlugin } from "../../@types/IPlugin.ts";
import { getConfig } from "../../services/Config/mod.ts";

// Define a custom configuration interface for the plugin
interface ExamplePluginConfig {
  enabled: boolean;
  greeting: string;
  features: {
    feature1: boolean;
    feature2: boolean;
    feature3: {
      enabled: boolean;
      options: {
        option1: string;
        option2: number;
      };
    };
  };
}

/**
 * Example plugin that demonstrates how to use the configuration system
 */
const examplePlugin: IPlugin = {
  name: "example",
  version: "1.0.0",
  description: "An example plugin that demonstrates how to use the configuration system",
  
  // Plugin configuration
  config: {
    plugins: {
      example: {
        enabled: true,
        greeting: "Hello from the example plugin!",
        features: {
          feature1: true,
          feature2: false,
          feature3: {
            enabled: true,
            options: {
              option1: "value1",
              option2: 42
            }
          }
        }
      }
    }
  },
  
  // Plugin initialization
  init: () => {
    console.log("Initializing example plugin...");
    
    // Access the plugin's configuration
    const enabled = getConfig<boolean>("plugins.example.enabled");
    const greeting = getConfig<string>("plugins.example.greeting");
    
    if (enabled) {
      console.log(greeting);
      
      // Access nested configuration
      const feature1Enabled = getConfig<boolean>("plugins.example.features.feature1");
      const feature2Enabled = getConfig<boolean>("plugins.example.features.feature2");
      
      console.log(`Feature 1 is ${feature1Enabled ? "enabled" : "disabled"}`);
      console.log(`Feature 2 is ${feature2Enabled ? "enabled" : "disabled"}`);
      
      // Access deeply nested configuration
      const feature3Enabled = getConfig<boolean>("plugins.example.features.feature3.enabled");
      const option1 = getConfig<string>("plugins.example.features.feature3.options.option1");
      const option2 = getConfig<number>("plugins.example.features.feature3.options.option2");
      
      if (feature3Enabled) {
        console.log(`Feature 3 is enabled with options: ${option1}, ${option2}`);
      }
    } else {
      console.log("Example plugin is disabled");
    }
    
    return true;
  }
};

export default examplePlugin; 