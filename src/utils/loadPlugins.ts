import { dfs, dpath } from "../../deps.ts";
import type { IPlugin } from "../@types/IPlugin.ts";
import { registerPlugin } from "../services/Config/mod.ts";
import { ensurePlugins } from "./ensurePlugins.ts";

/**
 * Load plugins from a directory
 * @param dir The directory to load plugins from
 * @returns An array of loaded plugins
 */
export async function loadPlugins(dir: string): Promise<IPlugin[]> {
  const loadedPlugins: IPlugin[] = [];

  // Auto-install any plugins declared in plugins.manifest.json that are absent.
  await ensurePlugins(dir);

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
          
          // Import the plugin from a runtime-discovered filesystem path.
          // The file:// URL bypasses the import map entirely, so the JSR
          // "unanalyzable-dynamic-import" warning here is a false positive —
          // no import-map rewriting is needed or possible for absolute file paths.
          const module = await import(dpath.toFileUrl(entry.path).href);
          
          if (module.default && typeof module.default === "object") {
            const plugin = module.default as IPlugin;
            
            if (!plugin.name) plugin.name = pluginName;
            if (!plugin.version) plugin.version = "0.0.1";
            
            registerPlugin(plugin);
            
            loadedPlugins.push(plugin);
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