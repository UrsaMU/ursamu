/**
 * Discover plugin JSON for the staff console.
 *
 * Collects JSON under each plugin's resources/ tree and under
 * config/plugins/ (game overrides).
 */

import { join, relative } from "@std/path";

const MAX_FILES = 2_000;
const MAX_DEPTH = 8;

export type PluginJsonEntry = {
  plugin: string;
  rel: string;
  /** Display path (cwd-relative when possible). */
  path: string;
  /** Absolute filesystem path for read/write. */
  abs: string;
  source: "resources" | "config-plugins";
  bytes: number;
  mtime: number | null;
};

function shortPath(absOrRel: string): string {
  try {
    const rel = relative(Deno.cwd(), absOrRel);
    if (rel && !rel.startsWith("..")) {
      return rel.replaceAll("\\", "/");
    }
  } catch {
    /* keep */
  }
  return absOrRel.replaceAll("\\", "/");
}

function norm(p: string): string {
  return p.replaceAll("\\", "/");
}

export function shortPluginId(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^jsr:/, "");
  s = s.replace(/^@ursamu\//, "");
  s = s.replace(/-plugin$/, "");
  const slash = s.lastIndexOf("/");
  if (slash >= 0) s = s.slice(slash + 1);
  return s.toLowerCase() || "unknown";
}

export function parseResourcesPath(
  path: string,
): { plugin: string; rel: string } | null {
  const n = norm(path);
  const marker = "/resources/";
  const idx = n.toLowerCase().lastIndexOf(marker);
  // Also allow "resources/" at start of a relative path
  if (idx === -1 && n.toLowerCase().startsWith("resources/")) {
    return null; // no plugin parent
  }
  if (idx === -1) return null;
  const before = n.slice(0, idx);
  const rel = n.slice(idx + marker.length);
  if (!rel.toLowerCase().endsWith(".json")) return null;
  const parts = before.split("/").filter(Boolean);
  let plugin = parts[parts.length - 1] ?? "unknown";
  if (parts[parts.length - 2] === "@ursamu") {
    plugin = parts[parts.length - 1] ?? plugin;
  }
  return { plugin: shortPluginId(plugin), rel };
}

export function parseConfigPluginPath(
  path: string,
): { plugin: string; rel: string } | null {
  const n = norm(path);
  const marker = "config/plugins/";
  const idx = n.indexOf(marker);
  if (idx === -1) return null;
  const rel = n.slice(idx + marker.length);
  if (!rel.toLowerCase().endsWith(".json") || rel.includes("..")) {
    return null;
  }
  const stem = rel.replace(/\.json$/i, "").split("/")[0] ?? "unknown";
  return { plugin: shortPluginId(stem), rel };
}

async function isDir(path: string): Promise<boolean> {
  try {
    return (await Deno.stat(path)).isDirectory;
  } catch {
    return false;
  }
}

/** Directories that may contain plugin packages (each may have resources/). */
async function pluginPackageDirs(): Promise<
  Array<{ plugin: string; root: string }>
> {
  const cwd = Deno.cwd();
  const out: Array<{ plugin: string; root: string }> = [];
  const seen = new Set<string>();

  async function addChildren(parent: string): Promise<void> {
    if (!(await isDir(parent))) return;
    try {
      for await (const ent of Deno.readDir(parent)) {
        if (!ent.isDirectory || ent.name.startsWith(".")) continue;
        const root = join(parent, ent.name);
        const key = shortPath(root);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ plugin: shortPluginId(ent.name), root });
      }
    } catch {
      /* skip */
    }
  }

  // Game tree: vendor/<plugin>, packages/<plugin>, plugins/<plugin>
  await addChildren(join(cwd, "vendor"));
  await addChildren(join(cwd, "packages"));
  await addChildren(join(cwd, "plugins"));
  await addChildren(join(cwd, "src", "plugins"));
  await addChildren(join(cwd, "node_modules", "@ursamu"));

  // Monorepo beside game (Court → ../ursamu/packages)
  await addChildren(join(cwd, "..", "ursamu", "packages"));
  // Already in monorepo
  await addChildren(join(cwd, "..", "packages"));

  return out;
}

async function walkJsonFiles(
  dir: string,
  relBase: string,
  depth: number,
  acc: Array<{ rel: string; abs: string }>,
): Promise<void> {
  if (depth > MAX_DEPTH || acc.length >= MAX_FILES) return;
  let entries: Deno.DirEntry[];
  try {
    entries = [];
    for await (const e of Deno.readDir(dir)) entries.push(e);
  } catch {
    return;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const ent of entries) {
    if (acc.length >= MAX_FILES) return;
    if (ent.name.startsWith(".")) continue;
    if (
      ent.name === "node_modules" || ent.name === "dist" ||
      ent.name === "tests" || ent.name === "test"
    ) {
      continue;
    }
    const abs = join(dir, ent.name);
    const rel = relBase ? `${relBase}/${ent.name}` : ent.name;
    if (ent.isDirectory) {
      await walkJsonFiles(abs, rel, depth + 1, acc);
      continue;
    }
    if (ent.isFile && ent.name.endsWith(".json")) {
      acc.push({ rel, abs });
    }
  }
}

async function fileMeta(
  abs: string,
): Promise<{ bytes: number; mtime: number | null } | null> {
  try {
    const st = await Deno.stat(abs);
    return {
      bytes: st.size,
      mtime: st.mtime?.getTime() ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Inventory plugin JSON from known package roots + config/plugins.
 */
export async function inventoryPluginJson(
  _enabledSpecs: string[] = [],
): Promise<{
  files: PluginJsonEntry[];
  roots: Array<{ plugin: string; root: string; hasResources: boolean }>;
  convention: string;
}> {
  const files: PluginJsonEntry[] = [];
  // Dedupe key: plugin + rel + source (prefer game-local relative paths)
  const best = new Map<string, PluginJsonEntry>();

  function consider(entry: PluginJsonEntry): void {
    const key = `${entry.plugin}\0${entry.rel}\0${entry.source}`;
    const prev = best.get(key);
    if (!prev) {
      best.set(key, entry);
      return;
    }
    // Prefer shorter / relative path over absolute
    if (
      !entry.path.startsWith("/") && prev.path.startsWith("/")
    ) {
      best.set(key, entry);
    }
  }

  const rootsMeta: Array<{
    plugin: string;
    root: string;
    hasResources: boolean;
  }> = [];

  try {
    const pkgs = await pluginPackageDirs();
    for (const { plugin, root } of pkgs) {
      const resDir = join(root, "resources");
      const hasRes = await isDir(resDir);
      rootsMeta.push({
        plugin,
        root: shortPath(root),
        hasResources: hasRes,
      });
      if (!hasRes) continue;

      const found: Array<{ rel: string; abs: string }> = [];
      await walkJsonFiles(resDir, "", 0, found);
      for (const f of found) {
        const meta = await fileMeta(f.abs);
        if (!meta) continue;
        consider({
          plugin,
          rel: f.rel,
          path: shortPath(f.abs),
          abs: f.abs,
          source: "resources",
          bytes: meta.bytes,
          mtime: meta.mtime,
        });
      }
    }
  } catch (e: unknown) {
    console.warn("[web] plugin resources scan failed:", e);
  }

  // Game overrides
  try {
    const cfgDir = join(Deno.cwd(), "config", "plugins");
    if (await isDir(cfgDir)) {
      const found: Array<{ rel: string; abs: string }> = [];
      await walkJsonFiles(cfgDir, "", 0, found);
      for (const f of found) {
        const parsed = parseConfigPluginPath(
          "config/plugins/" + f.rel,
        );
        const plugin = parsed?.plugin ??
          shortPluginId(f.rel.replace(/\.json$/i, ""));
        const meta = await fileMeta(f.abs);
        if (!meta) continue;
        consider({
          plugin,
          rel: f.rel,
          path: shortPath(f.abs),
          abs: f.abs,
          source: "config-plugins",
          bytes: meta.bytes,
          mtime: meta.mtime,
        });
      }
    }
  } catch (e: unknown) {
    console.warn("[web] config/plugins scan failed:", e);
  }

  files.push(...best.values());
  files.sort((a, b) =>
    a.plugin.localeCompare(b.plugin) ||
    a.source.localeCompare(b.source) ||
    a.rel.localeCompare(b.rel)
  );

  rootsMeta.sort((a, b) => a.plugin.localeCompare(b.plugin));

  return {
    files,
    roots: rootsMeta,
    convention:
      "Package data lives in each plugin's resources/ folder. " +
      "Game overrides go in config/plugins/.",
  };
}

const MAX_EDIT_BYTES = 512 * 1024;

/**
 * Resolve a client-supplied path to an inventory entry only
 * (no arbitrary filesystem access).
 */
export async function resolveInventoryFile(
  requested: string,
): Promise<PluginJsonEntry | null> {
  const want = norm(requested).replace(/^\.\//, "");
  if (!want || want.includes("..") || !want.endsWith(".json")) {
    return null;
  }
  const inv = await inventoryPluginJson();
  for (const f of inv.files) {
    const p = norm(f.path);
    const a = norm(f.abs);
    if (p === want || a === want || p.endsWith("/" + want)) {
      return f;
    }
  }
  return null;
}

export async function readPluginJsonFile(
  requested: string,
): Promise<
  | { ok: true; entry: PluginJsonEntry; text: string; data: unknown }
  | { ok: false; error: string; status: number }
> {
  const entry = await resolveInventoryFile(requested);
  if (!entry) {
    return { ok: false, error: "File not in inventory", status: 404 };
  }
  try {
    const st = await Deno.stat(entry.abs);
    if (st.size > MAX_EDIT_BYTES) {
      return {
        ok: false,
        error: `File too large (max ${MAX_EDIT_BYTES} bytes)`,
        status: 413,
      };
    }
    const text = await Deno.readTextFile(entry.abs);
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return {
        ok: false,
        error: "File is not valid JSON",
        status: 422,
      };
    }
    return { ok: true, entry, text, data };
  } catch (e: unknown) {
    return { ok: false, error: String(e), status: 500 };
  }
}

export async function writePluginJsonFile(
  requested: string,
  body: unknown,
): Promise<
  | { ok: true; entry: PluginJsonEntry; bytes: number }
  | { ok: false; error: string; status: number }
> {
  const entry = await resolveInventoryFile(requested);
  if (!entry) {
    return { ok: false, error: "File not in inventory", status: 404 };
  }
  // Must be plain JSON value
  let text: string;
  try {
    text = JSON.stringify(body, null, 2) + "\n";
  } catch {
    return { ok: false, error: "Value is not JSON-serializable", status: 400 };
  }
  if (text.length > MAX_EDIT_BYTES) {
    return {
      ok: false,
      error: `Payload too large (max ${MAX_EDIT_BYTES} bytes)`,
      status: 413,
    };
  }
  // Validate round-trip parse
  try {
    JSON.parse(text);
  } catch {
    return { ok: false, error: "Invalid JSON", status: 400 };
  }

  try {
    const tmp = `${entry.abs}.${Deno.pid}.tmp`;
    await Deno.writeTextFile(tmp, text);
    await Deno.rename(tmp, entry.abs);
    return { ok: true, entry, bytes: text.length };
  } catch (e: unknown) {
    return { ok: false, error: String(e), status: 500 };
  }
}
