/**
 * Staff settings API — config edit, restart, plugin inventory.
 *
 *   GET    /api/v1/admin/settings
 *   PATCH  /api/v1/admin/settings
 *   POST   /api/v1/admin/restart
 *   GET    /api/v1/admin/plugins
 *
 * Plugin JSON: each package's resources/ tree, plus config/plugins/,
 * plus inline config.json plugins.* keys.
 */

import {
  getAllConfig,
  setConfig,
  listPlugins,
} from "@ursamu/mush";
import {
  inventoryPluginJson,
  readPluginJsonFile,
  writePluginJsonFile,
} from "./plugin-json-scan.ts";
import { listStaffNav } from "./staff-nav.ts";

const JSON_HDR = {
  "Content-Type": "application/json",
  "X-Content-Type-Options": "nosniff",
};

const CONFIG_PATH = "config/config.json";

/** Keys staff may change via the console (dot paths). */
const EDITABLE = new Set([
  "game.name",
  "game.description",
  "game.version",
  "game.playerStart",
  "game.layout.header",
  "game.layout.divider",
  "game.layout.footer",
]);

/** These apply only after soft-reboot. */
const RESTART_KEYS = new Set([
  "server.plugins",
  "game.playerStart",
]);

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HDR,
  });
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStaffFlags(raw: unknown): boolean {
  const set = new Set<string>();
  if (raw instanceof Set) {
    for (const f of raw) set.add(String(f).toLowerCase());
  } else if (Array.isArray(raw)) {
    for (const f of raw) set.add(String(f).toLowerCase());
  } else if (typeof raw === "string") {
    for (const f of raw.split(/[\s,|]+/)) {
      if (f) set.add(f.toLowerCase());
    }
  }
  return set.has("admin") || set.has("wizard") ||
    set.has("superuser");
}

async function requireStaff(
  userId: string | null,
): Promise<Response | null> {
  if (!userId) return json({ error: "Unauthorized" }, 401);
  try {
    const { dbojs } = await import("@ursamu/mush");
    const row = await dbojs.queryOne({ id: userId });
    if (!row || !isStaffFlags(row.flags)) {
      return json({ error: "Forbidden" }, 403);
    }
  } catch {
    return json({ error: "Forbidden" }, 403);
  }
  return null;
}

async function readConfigFile(): Promise<Record<string, unknown>> {
  try {
    const text = await Deno.readTextFile(CONFIG_PATH);
    const parsed = JSON.parse(text) as unknown;
    return isPlainObject(parsed) ? parsed : {};
  } catch (e: unknown) {
    if (e instanceof Deno.errors.NotFound) return {};
    throw e;
  }
}

async function writeConfigFile(
  data: Record<string, unknown>,
): Promise<void> {
  const body = JSON.stringify(data, null, 2) + "\n";
  const tmp = `${CONFIG_PATH}.${Deno.pid}.tmp`;
  await Deno.writeTextFile(tmp, body);
  await Deno.rename(tmp, CONFIG_PATH);
}

function dotGet(
  obj: Record<string, unknown>,
  key: string,
): unknown {
  const parts = key.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (!isPlainObject(cur)) return undefined;
    if (!Object.prototype.hasOwnProperty.call(cur, p)) {
      return undefined;
    }
    cur = cur[p];
  }
  return cur;
}

function dotSet(
  obj: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  const parts = key.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    if (!isPlainObject(cur[p])) cur[p] = {};
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

function pluginKeysFromConfig(
  cfg: Record<string, unknown>,
): string[] {
  const block = cfg.plugins;
  if (!isPlainObject(block)) return [];
  return Object.keys(block).filter((k) => k && !k.startsWith("_"))
    .sort();
}

async function buildSettingsPayload(): Promise<Record<string, unknown>> {
  const live = getAllConfig() as Record<string, unknown>;
  const file = await readConfigFile();
  const game = isPlainObject(live.game) ? live.game : {};
  const layout = isPlainObject(game.layout) ? game.layout : {};
  const server = isPlainObject(live.server) ? live.server : {};

  let loaded: Array<{
    name: string;
    version: string;
    description: string;
  }> = [];
  try {
    loaded = listPlugins().map((p) => ({
      name: p.name,
      version: p.version,
      description: p.description ?? "",
    }));
  } catch (e: unknown) {
    console.warn("[web] listPlugins failed:", e);
  }

  const enabled = Array.isArray(server.plugins)
    ? server.plugins.map(String)
    : [];

  let inv = {
    files: [] as Awaited<
      ReturnType<typeof inventoryPluginJson>
    >["files"],
    roots: [] as Awaited<
      ReturnType<typeof inventoryPluginJson>
    >["roots"],
    convention:
      "Package data lives in each plugin's resources/ folder. " +
      "Game overrides go in config/plugins/.",
  };
  try {
    inv = await inventoryPluginJson(enabled);
  } catch (e: unknown) {
    console.warn("[web] plugin JSON inventory failed:", e);
  }

  const inlineKeys = pluginKeysFromConfig(file);

  return {
    game: {
      name: String(game.name ?? ""),
      description: String(game.description ?? ""),
      version: String(game.version ?? ""),
      playerStart: String(game.playerStart ?? ""),
    },
    layout: {
      header: String(layout.header ?? ""),
      divider: String(layout.divider ?? ""),
      footer: String(layout.footer ?? ""),
    },
    server: {
      telnet: server.telnet ?? server.telnetPort ?? null,
      wsPort: server.wsPort ?? server.ws ?? null,
      apiPort: server.apiPort ?? server.port ?? server.http ?? null,
      plugins: enabled,
    },
    plugins: {
      inline: inlineKeys,
      // Never expose absolute paths to the client
      files: inv.files.map((f) => ({
        plugin: f.plugin,
        rel: f.rel,
        path: f.path,
        source: f.source,
        bytes: f.bytes,
        mtime: f.mtime,
      })),
      roots: inv.roots,
      loaded,
      convention: inv.convention,
    },
    editable: [...EDITABLE],
    restartKeys: [...RESTART_KEYS],
  };
}

function applyEditablePatch(
  file: Record<string, unknown>,
  patch: Record<string, unknown>,
): { applied: string[]; needsRestart: boolean; error?: string } {
  const applied: string[] = [];
  let needsRestart = false;

  // Flat game fields
  if (isPlainObject(patch.game)) {
    for (const [k, v] of Object.entries(patch.game)) {
      const path = `game.${k}`;
      if (!EDITABLE.has(path)) continue;
      if (typeof v !== "string") {
        return {
          applied,
          needsRestart,
          error: `${path} must be a string`,
        };
      }
      const clean = v.slice(0, 4000);
      dotSet(file, path, clean);
      setConfig(path, clean);
      applied.push(path);
      if (RESTART_KEYS.has(path)) needsRestart = true;
    }
  }

  if (isPlainObject(patch.layout)) {
    for (const [k, v] of Object.entries(patch.layout)) {
      const path = `game.layout.${k}`;
      if (!EDITABLE.has(path)) continue;
      if (typeof v !== "string") {
        return {
          applied,
          needsRestart,
          error: `${path} must be a string`,
        };
      }
      const clean = v.slice(0, 8000);
      dotSet(file, path, clean);
      setConfig(path, clean);
      applied.push(path);
    }
  }

  // server.plugins list (enable order) — restart required
  if (Array.isArray(patch.serverPlugins)) {
    const list = patch.serverPlugins.map(String).filter(Boolean)
      .slice(0, 200);
    if (!isPlainObject(file.server)) file.server = {};
    (file.server as Record<string, unknown>).plugins = list;
    setConfig("server.plugins", list);
    applied.push("server.plugins");
    needsRestart = true;
  }

  return { applied, needsRestart };
}

function scheduleSoftReboot(): void {
  // Exit 75 = soft-reboot (Court/daemon loop restarts main; sessions stay).
  setTimeout(async () => {
    try {
      const { DBO } = await import("@ursamu/mush");
      await DBO.close();
    } catch {
      /* best-effort flush */
    }
    Deno.exit(75);
  }, 600);
}

export async function adminSettingsHandler(
  req: Request,
  userId: string | null,
): Promise<Response> {
  const denied = await requireStaff(userId);
  if (denied) return denied;

  const url = new URL(req.url);
  const path = url.pathname.replace(/\/$/, "");
  const method = req.method.toUpperCase();

  // ── GET /api/v1/admin/nav ──────────────────────────────────────
  if (
    (path === "/api/v1/admin/nav" ||
      path.endsWith("/admin/nav")) &&
    method === "GET"
  ) {
    return json({ items: listStaffNav() });
  }

  // ── GET /api/v1/admin/settings ─────────────────────────────────
  if (
    (path === "/api/v1/admin/settings" ||
      path.endsWith("/admin/settings")) &&
    method === "GET"
  ) {
    try {
      return json(await buildSettingsPayload());
    } catch (e: unknown) {
      return json({ error: String(e) }, 500);
    }
  }

  // ── PATCH /api/v1/admin/settings ───────────────────────────────
  if (
    (path === "/api/v1/admin/settings" ||
      path.endsWith("/admin/settings")) &&
    method === "PATCH"
  ) {
    let body: Record<string, unknown>;
    try {
      body = await req.json() as Record<string, unknown>;
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    try {
      const file = await readConfigFile();
      const result = applyEditablePatch(file, body);
      if (result.error) {
        return json({ error: result.error }, 400);
      }
      if (!result.applied.length) {
        return json({ error: "Nothing to update" }, 400);
      }
      await writeConfigFile(file);
      return json({
        ok: true,
        applied: result.applied,
        needsRestart: result.needsRestart,
        settings: await buildSettingsPayload(),
      });
    } catch (e: unknown) {
      return json({ error: String(e) }, 500);
    }
  }

  // ── GET/PUT /api/v1/admin/plugins/file?path= ───────────────────
  if (
    (path === "/api/v1/admin/plugins/file" ||
      path.endsWith("/admin/plugins/file")) &&
    (method === "GET" || method === "PUT")
  ) {
    const filePath = url.searchParams.get("path")?.trim() ?? "";
    if (!filePath) {
      return json({ error: "path query required" }, 400);
    }

    if (method === "GET") {
      const result = await readPluginJsonFile(filePath);
      if (!result.ok) {
        return json({ error: result.error }, result.status);
      }
      return json({
        path: result.entry.path,
        plugin: result.entry.plugin,
        rel: result.entry.rel,
        source: result.entry.source,
        text: result.text,
        data: result.data,
      });
    }

    // PUT
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    // Allow { data: ... } or raw JSON value
    const payload = isPlainObject(body) && "data" in body
      ? (body as { data: unknown }).data
      : body;

    const result = await writePluginJsonFile(filePath, payload);
    if (!result.ok) {
      return json({ error: result.error }, result.status);
    }
    return json({
      ok: true,
      path: result.entry.path,
      plugin: result.entry.plugin,
      rel: result.entry.rel,
      bytes: result.bytes,
      needsRestart: true,
    });
  }

  // ── GET /api/v1/admin/plugins ──────────────────────────────────
  if (
    (path === "/api/v1/admin/plugins" ||
      path.endsWith("/admin/plugins")) &&
    method === "GET"
  ) {
    try {
      const file = await readConfigFile();
      const live = getAllConfig() as Record<string, unknown>;
      const server = isPlainObject(live.server) ? live.server : {};
      const enabled = Array.isArray(server.plugins)
        ? server.plugins.map(String)
        : [];
      let inv;
      try {
        inv = await inventoryPluginJson(enabled);
      } catch (e: unknown) {
        console.warn("[web] plugin JSON inventory failed:", e);
        inv = {
          files: [],
          roots: [],
          convention:
            "Package data lives in each plugin's resources/ folder. " +
            "Game overrides go in config/plugins/.",
        };
      }
      let loaded: Array<{
        name: string;
        version: string;
        description: string;
      }> = [];
      try {
        loaded = listPlugins().map((p) => ({
          name: p.name,
          version: p.version,
          description: p.description ?? "",
        }));
      } catch {
        /* ignore */
      }
      return json({
        loaded,
        enabled,
        inline: pluginKeysFromConfig(file),
        files: inv.files.map((f) => ({
          plugin: f.plugin,
          rel: f.rel,
          path: f.path,
          source: f.source,
          bytes: f.bytes,
          mtime: f.mtime,
        })),
        roots: inv.roots,
        convention: inv.convention,
      });
    } catch (e: unknown) {
      return json({ error: String(e) }, 500);
    }
  }

  // ── POST /api/v1/admin/restart ─────────────────────────────────
  if (
    (path === "/api/v1/admin/restart" ||
      path.endsWith("/admin/restart")) &&
    method === "POST"
  ) {
    let body: Record<string, unknown> = {};
    try {
      body = await req.json() as Record<string, unknown>;
    } catch {
      /* empty body ok */
    }
    const mode = String(body.mode ?? "soft").toLowerCase();
    if (mode !== "soft") {
      return json({
        error: "Only mode:\"soft\" is supported (exit 75).",
      }, 400);
    }

    // Confirm token optional but recommended from UI
    const confirm = String(body.confirm ?? "");
    if (confirm !== "restart") {
      return json({
        error: 'Send { "mode":"soft", "confirm":"restart" }',
      }, 400);
    }

    scheduleSoftReboot();
    return json({
      ok: true,
      message: "Soft-reboot scheduled (exit 75).",
      inMs: 600,
    });
  }

  return json({ error: "Not Found" }, 404);
}

