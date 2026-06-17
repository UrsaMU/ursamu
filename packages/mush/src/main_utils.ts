import * as dfs from "@std/fs";
import * as dpath from "@std/path";
import type { IPlugin } from "@ursamu/core";
import type { IDBOBJ } from "./world/types.ts";
import { registerPlugin } from "@ursamu/core";
import { ensurePlugins } from "@ursamu/cli";
import { dbojs } from "./world/dbobjs.ts";

// ─── Txt Files loading ─────────────────────────────────────────────────────────
export const txtFiles = new Map<string, string>();

export const loadTxtDir = async (dir: string) => {
  for await (const entry of Deno.readDir(dir)) {
    const fullPath = dpath.join(dir, entry.name);
    if (entry.isDirectory) {
      await loadTxtDir(fullPath);
    } else if (entry.isFile && (entry.name.endsWith(".txt") || entry.name.endsWith(".md"))) {
      const content = await Deno.readTextFile(fullPath);
      txtFiles.set(entry.name, content);
    }
  }
};

// ─── Flag Setter ─────────────────────────────────────────────────────────────
export const setFlags = async (obj: IDBOBJ, flagStr: string, _actor?: IDBOBJ): Promise<void> => {
  const tokens = flagStr.trim().split(/\s+/);
  let fl = obj.flags || "";
  for (const token of tokens) {
    if (token.startsWith("!")) {
      const f = token.slice(1);
      fl = fl.replace(new RegExp(`\\b${f}\\b`, "gi"), "").replace(/\s+/g, " ").trim();
    } else if (!new RegExp(`\\b${token}\\b`, "i").test(fl)) {
      fl = `${fl} ${token}`.trim();
    }
  }
  obj.flags = fl;
  await dbojs.modify({ id: obj.id }, "$set", obj);
};

// ─── Directory Loader ──────────────────────────────────────────────────────────
export async function plugins(dir: string, cacheBuster?: string) {
  const entries = dfs.walk(dir, { match: [/\.ts$/, /\.js$/], maxDepth: 3 });
  for await (const entry of entries) {
    if (entry.isFile) {
      const url = dpath.toFileUrl(entry.path).href + (cacheBuster || "");
      const module = await import(url);
      module.default?.();
    }
  }
}

// ─── Plugin Loader ─────────────────────────────────────────────────────────────
export async function loadPlugins(dir: string): Promise<IPlugin[]> {
  const loadedPlugins: IPlugin[] = [];

  // Auto-install any plugins declared in plugins.manifest.json that are absent.
  await ensurePlugins(dir);

  try {
    const dirInfo = await Deno.stat(dir);
    if (!dirInfo.isDirectory) {
      console.error(`${dir} is not a directory`);
      return loadedPlugins;
    }
    
    const entries = dfs.walk(dir, { maxDepth: 2, followSymlinks: true });
    
    for await (const entry of entries) {
      if (entry.isFile && entry.name === "index.ts") {
        try {
          const pluginDir = dpath.dirname(entry.path);
          const pluginName = dpath.basename(pluginDir);
          const module = await import(dpath.toFileUrl(entry.path).href);
          
          const candidate = module.default ?? module.plugin;
          if (candidate && typeof candidate === "object") {
            const plugin = candidate as IPlugin;

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

export async function reloadPlugins(dir: string, existingPlugins: IPlugin[]): Promise<IPlugin[]> {
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

    const entries = dfs.walk(dir, { maxDepth: 2, followSymlinks: true });
    const cacheBuster = `?t=${Date.now()}`;

    for await (const entry of entries) {
      if (entry.isFile && entry.name === "index.ts") {
        try {
          const pluginDir = dpath.dirname(entry.path);
          const pluginName = dpath.basename(pluginDir);

          const module = await import(dpath.toFileUrl(entry.path).href + cacheBuster);

          const candidate = module.default ?? module.plugin;
          if (candidate && typeof candidate === "object") {
            const plugin = candidate as IPlugin;
            if (!plugin.name) plugin.name = pluginName;
            if (!plugin.version) plugin.version = "0.0.1";

            registerPlugin(plugin);
            loadedPlugins.push(plugin);

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

/**
 * Resolve a target reference string relative to `en`.
 * Handles: "here", "me", "#dbref", name-prefix search.
 * Pass `global = true` to skip the location-proximity filter.
 */
export const target = async (
  en:     IDBOBJ,
  tar:    string,
  global?: boolean,
): Promise<IDBOBJ | undefined | false> => {
  if (!tar || ["here", "room"].includes(tar.toLowerCase())) {
    return en.location ? await dbojs.queryOne({ id: en.location }) : undefined;
  }
  if (tar.startsWith("#")) return await dbojs.queryOne({ id: tar.slice(1) });
  if (["me", "self"].includes(tar.toLowerCase())) return en;

  const namePat = new RegExp(`^${tar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
  const all = await dbojs.query({ "data.name": namePat });
  const byAlias = tar.toLowerCase();
  const candidates = all.length
    ? all
    : await dbojs.query({}).then((objs) =>
        objs.filter((o) =>
          o.id === tar ||
          (o.data?.alias as string | undefined)?.toLowerCase() === byAlias
        )
      );

  if (!candidates.length) return undefined;
  if (global) return candidates[0];

  const found = candidates.find(obj =>
    obj.location && (
      (en.location && (obj.location === en.location || obj.id === en.location)) ||
      obj.location === en.id
    ),
  );
  return found ?? undefined;
};

import type { IAttribute } from "./world/types.ts";

/**
 * Recursively fetch a named attribute from an object, walking its parent chain.
 * Returns `undefined` when not found; cycles are detected via a visited set.
 */
export const getAttribute = async (
  obj:     IDBOBJ,
  attr:    string,
  visited: Set<string> = new Set(),
): Promise<IAttribute | undefined> => {
  const attribute = obj.data?.attributes?.find(
    (a: IAttribute) => a.name.toLowerCase() === attr.toLowerCase(),
  );
  if (attribute) return attribute;

  if (obj.data?.parent) {
    const parentId = obj.data.parent as string;
    visited.add(obj.id);
    if (visited.has(parentId)) return undefined;
    const parent = await dbojs.queryOne({ id: parentId });
    if (parent) return getAttribute(parent as IDBOBJ, attr, visited);
  }
  return undefined;
};

/** Returns the matching object if the name or alias is already taken, otherwise undefined. */
export const isNameTaken = async (name: string): Promise<IDBOBJ | undefined> => {
  const rx = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
  // Query for name or alias matching rx
  const results = await dbojs.query({
    $or: [
      { "data.name": rx },
      { "data.alias": rx }
    ]
    // deno-lint-ignore no-explicit-any
  } as any);
  return results.length ? results[0] : undefined;
};


