import { dfs, dpath } from "../../deps.ts";
import type { IPlugin } from "../@types/IPlugin.ts";
import { registerPlugin } from "../services/Config/mod.ts";

/**
 * Load plugins from a directory
 * @param dir The directory to load plugins from
 * @returns An array of loaded plugins
 */
export async function loadPlugins(dir: string): Promise<IPlugin[]> {
  const loadedPlugins: IPlugin[] = [];
  
  try {
    // Check if the directory exists
    const dirInfo = await Deno.stat(dir);
    if (!dirInfo.isDirectory) {
      console.error(`${dir} is not a directory`);
      return loadedPlugins;
    }
    
    // Walk through the directory and find plugin entry points
    const entries = dfs.walk(dir, { maxDepth: 2 });
    
    for await (const entry of entries) {
      if (entry.isFile && entry.name === "index.ts") {
        try {
          // Get the plugin directory name (which is the plugin name)
          const pluginDir = dpath.dirname(entry.path);
          const pluginName = dpath.basename(pluginDir);
          
          console.log(`Loading plugin from ${entry.path}`);
          
          // Import the plugin
          const module = await import(dpath.toFileUrl(entry.path).href);
          
          if (module.default && typeof module.default === "object") {
            const plugin = module.default as IPlugin;
            
            // Validate the plugin
            if (!plugin.name) {
              console.warn(`Plugin at ${entry.path} does not have a name, using directory name: ${pluginName}`);
              plugin.name = pluginName;
            }
            
            if (!plugin.version) {
              console.warn(`Plugin ${plugin.name} does not have a version, using 0.0.1`);
              plugin.version = "0.0.1";
            }
            
            // Register the plugin with the configuration system
            registerPlugin(plugin);
            
            // Add to the loaded plugins
            loadedPlugins.push(plugin);
            
            console.log(`Plugin ${plugin.name} v${plugin.version} loaded`);
          } else {
            console.warn(`Module at ${entry.path} does not export a default plugin object`);
          }
        } catch (error) {
          console.error(`Error loading plugin from ${entry.path}:`, error);
        }
      }
    }
  } catch (error) {
    console.error(`Error loading plugins from ${dir}:`, error);
  }
  
  return loadedPlugins;
} 