import * as dfs from "@std/fs";
import * as dpath from "@std/path";
import type { IPlugin } from "@ursamu/core";
import type { IDBOBJ } from "./world/types.ts";
import { registerPlugin } from "@ursamu/core";
import { dbojs } from "./world/dbobjs.ts";
import { pickNameMatch } from "./world/name-match.ts";

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
  try {
    const cliPackage = "@ursamu/cli";
    const { ensurePlugins } = await import(cliPackage);
    await ensurePlugins(dir);
  } catch (err) {
    console.error("Failed to load ensurePlugins from @ursamu/cli:", err);
  }

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
 * Handles: "here", "me", "#dbref", name prefix, data.alias, and
 * TinyMUX exit aliases (`Primary;sl`).
 * Pass `global = true` to skip the location-proximity filter.
 */
export const target = async (
  en:     IDBOBJ,
  tar:    string,
  global?: boolean,
): Promise<IDBOBJ | undefined | false> => {
  let name = (tar ?? "").trim();
  let g = !!global;
  // TinyMUX *Name — force global name lookup.
  if (name.startsWith("*")) {
    name = name.slice(1).trim();
    g = true;
  }
  if (!name || ["here", "room"].includes(name.toLowerCase())) {
    return en.location ? await dbojs.queryOne({ id: en.location }) : undefined;
  }
  if (name.startsWith("#")) {
    return await dbojs.queryOne({ id: name.slice(1) });
  }
  if (["me", "self"].includes(name.toLowerCase())) return en;

  const all = await dbojs.query({});
  if (g) return pickNameMatch(all, name);

  const nearby = all.filter((obj) =>
    obj.location && (
      (en.location &&
        (obj.location === en.location || obj.id === en.location)) ||
      obj.location === en.id
    )
  );
  return pickNameMatch(nearby, name);
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

/** First ;-separated segment (login / primary name). */
export function primaryName(name: string): string {
  return String(name ?? "").split(";")[0].trim();
}

const escapeRx = (s: string) =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Returns the matching object if the name or alias is already taken. */
export const isNameTaken = async (
  name: string,
): Promise<IDBOBJ | undefined> => {
  const primary = primaryName(name);
  if (!primary) return undefined;
  const rx = new RegExp(`^${escapeRx(primary)}$`, "i");
  const results = await dbojs.query({
    $or: [
      { "data.name": rx },
      { "data.alias": rx },
    ],
    // deno-lint-ignore no-explicit-any
  } as any);
  return results.length ? results[0] : undefined;
};

/**
 * True collision for player login names.
 * Matches another player whose primary data.name or data.alias equals
 * `name`'s primary segment (case-insensitive). Ignores `exceptId`.
 */
export const isPlayerNameTaken = async (
  name: string,
  exceptId?: string,
): Promise<IDBOBJ | undefined> => {
  const primary = primaryName(name);
  if (!primary) return undefined;
  const esc = escapeRx(primary);
  // Exact name, or Name;alias… form, or alias field.
  const nameRx = new RegExp(`^${esc}(?:;.*)?$`, "i");
  const exactRx = new RegExp(`^${esc}$`, "i");
  const results = await dbojs.query({
    $or: [
      { "data.name": nameRx },
      { "data.alias": exactRx },
    ],
    // deno-lint-ignore no-explicit-any
  } as any);

  for (const o of results) {
    if (!/\bplayer\b/i.test(String(o.flags ?? ""))) continue;
    if (exceptId && o.id === exceptId) continue;
    const n = primaryName(String(o.data?.name ?? ""));
    const a = String(o.data?.alias ?? "").trim();
    if (
      n.toLowerCase() === primary.toLowerCase() ||
      a.toLowerCase() === primary.toLowerCase()
    ) {
      return o;
    }
  }
  return undefined;
};


