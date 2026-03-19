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

/**
 * Reload all plugins from a directory (hot-reload, no disconnect).
 * Calls remove() on existing plugins, then re-imports with cache-busting.
 * @param dir The plugins directory
 * @param existingPlugins The currently loaded plugins to call remove() on
 * @returns Array of freshly loaded plugins
 */
export async function reloadPlugins(dir: string, existingPlugins: IPlugin[]): Promise<IPlugin[]> {
  // Call remove() on existing plugins
  for (const plugin of existingPlugins) {
    try {
      if (plugin.remove) {
        await plugin.remove();
        console.log(`[reload] Plugin ${plugin.name} removed.`);
      }
    } catch (e) {
      console.error(`[reload] Error removing plugin ${plugin.name}:`, e);
    }
  }

  const loadedPlugins: IPlugin[] = [];

  try {
    const dirInfo = await Deno.stat(dir);
    if (!dirInfo.isDirectory) return loadedPlugins;

    const entries = dfs.walk(dir, { maxDepth: 2 });
    const cacheBuster = `?t=${Date.now()}`;

    for await (const entry of entries) {
      if (entry.isFile && entry.name === "index.ts") {
        try {
          const pluginDir = dpath.dirname(entry.path);
          const pluginName = dpath.basename(pluginDir);

          console.log(`[reload] Reloading plugin from ${entry.path}`);

          // Cache-busting import to force Deno to load fresh module
          const module = await import(dpath.toFileUrl(entry.path).href + cacheBuster);

          if (module.default && typeof module.default === "object") {
            const plugin = module.default as IPlugin;
            if (!plugin.name) plugin.name = pluginName;
            if (!plugin.version) plugin.version = "0.0.1";

            registerPlugin(plugin);
            loadedPlugins.push(plugin);

            // Call init() on the fresh plugin
            if (plugin.init) {
              await plugin.init();
            }

            console.log(`[reload] Plugin ${plugin.name} v${plugin.version} reloaded.`);
          }
        } catch (error) {
          console.error(`[reload] Error reloading plugin from ${entry.path}:`, error);
        }
      }
    }
  } catch (error) {
    console.error(`[reload] Error reloading plugins from ${dir}:`, error);
  }

  return loadedPlugins;
}