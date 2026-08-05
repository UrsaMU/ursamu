/**
 * Staff settings API — config edit, restart, plugin inventory.
 *
 *   GET    /api/v1/admin/settings
 *   PATCH  /api/v1/admin/settings
 *   POST   /api/v1/admin/restart
 *   GET    /api/v1/admin/plugins
 *   GET    /api/v1/admin/site/themes
 *   POST   /api/v1/admin/site/theme   (zip upload / activate)
 *
 * Plugin JSON: each package's resources/ tree, plus config/plugins/,
 * plus inline config.json plugins.* keys.
 */

import {
  getAllConfig,
  setConfig,
  listPlugins,
  texts,
} from "@ursamu/mush";
import {
  inventoryPluginJson,
  readPluginJsonFile,
  writePluginJsonFile,
} from "./plugin-json-scan.ts";
import { listStaffNav } from "./staff-nav.ts";
import {
  handleSiteThemeRoutes,
  listThemesPayload,
} from "./site-theme-api.ts";

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
  "plugins.site.skin",
  "plugins.site.skinCss",
  "plugins.site.title",
  "plugins.site.bannerImage",
  "plugins.site.plainBg",
  "plugins.site.telnet",
  "plugins.site.nav",
  "plugins.site.themeDir",
]);

/** These apply only after soft-reboot. */
const RESTART_KEYS = new Set([
  "server.plugins",
  "game.playerStart",
]);

/** Site FE fields that hot-reload via setSiteRuntime. */
const SITE_LIVE_KEYS = new Set([
  "plugins.site.skin",
  "plugins.site.skinCss",
  "plugins.site.title",
  "plugins.site.bannerImage",
  "plugins.site.plainBg",
  "plugins.site.telnet",
  "plugins.site.nav",
  "plugins.site.themeDir",
]);

type SiteNavRow = {
  id?: string;
  label: string;
  href: string;
  order: number;
  /** Visibility: public | connected | staff | flag(name) */
  require?: string;
};

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

  const siteBlock = (() => {
    const plugs = isPlainObject(file.plugins) ? file.plugins : {};
    const livePlugs = isPlainObject(live.plugins) ? live.plugins : {};
    const fromFile = isPlainObject(plugs.site) ? plugs.site : {};
    const fromLive = isPlainObject(livePlugs.site) ? livePlugs.site : {};
    // Prefer file (source of truth for staff edits)
    return { ...fromLive, ...fromFile };
  })();

  let siteSkins: string[] = ["default"];
  let siteLoaded = false;
  let pluginNav: SiteNavRow[] = [];
  let siteThemes: Array<Record<string, unknown>> = [];
  try {
    const site = await import("@ursamu/site") as {
      listBuiltinSkins?: () => Promise<string[]>;
      listSiteNav?: () => Array<{
        id: string;
        label: string;
        href: string;
        order?: number;
        require?: string;
      }>;
    };
    siteLoaded = true;
    if (typeof site.listBuiltinSkins === "function") {
      siteSkins = await site.listBuiltinSkins();
    }
    if (typeof site.listSiteNav === "function") {
      pluginNav = site.listSiteNav().map((n, i) => ({
        id: n.id,
        label: n.label,
        href: n.href,
        order: typeof n.order === "number" ? n.order : (i + 1) * 10,
        require: n.require,
      }));
    }
  } catch {
    siteLoaded = enabled.some((p) =>
      /site/i.test(p) || p.includes("@ursamu/site")
    );
  }

  try {
    const tp = await listThemesPayload();
    if (tp.available) {
      siteLoaded = true;
      siteThemes = tp.themes.map((t) => ({
        id: t.id,
        label: t.label,
        version: t.version ?? "",
        source: t.source ?? "",
        skinCss: t.skinCss ?? "",
        bannerHref: t.bannerHref ?? "",
        title: t.title ?? "",
        description: t.description ?? "",
        active: t.id === String(siteBlock.skin ?? "default"),
      }));
      // Merge installed theme ids into skin dropdown
      for (const t of tp.themes) {
        if (t.id && !siteSkins.includes(t.id)) {
          siteSkins.push(t.id);
        }
      }
    }
  } catch {
    /* optional */
  }

  const configNav = normalizeSiteNav(siteBlock.nav);

  let loginMarkdown =
    "# Welcome\n\nSign in or create a character to play.\n";
  try {
    const entry = await texts.queryOne({ id: "welcome" });
    if (entry?.content) loginMarkdown = String(entry.content);
  } catch (e: unknown) {
    console.warn("[web] read welcome text failed:", e);
  }

  return {
    game: {
      name: String(game.name ?? ""),
      description: String(game.description ?? ""),
      version: String(game.version ?? ""),
      playerStart: String(game.playerStart ?? ""),
    },
    /** Web /play pre-auth splash (markdown or HTML). Telnet: txt. */
    loginMarkdown,
    layout: {
      header: String(layout.header ?? ""),
      divider: String(layout.divider ?? ""),
      footer: String(layout.footer ?? ""),
    },
    site: {
      available: siteLoaded,
      skins: siteSkins,
      themes: siteThemes,
      skin: String(siteBlock.skin ?? "default"),
      skinCss: String(siteBlock.skinCss ?? ""),
      title: String(siteBlock.title ?? ""),
      bannerImage: String(siteBlock.bannerImage ?? ""),
      plainBg: siteBlock.plainBg === true,
      telnet: String(siteBlock.telnet ?? ""),
      themeDir: String(siteBlock.themeDir ?? ""),
      previewUrl: "/site/",
      /** Editable top-nav (plugins.site.nav) — order = display order */
      nav: configNav,
      /** Runtime plugin contributions (read-only hint) */
      pluginNav,
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

  // Public FE (plugins.site) — skin, title, banner, nav…
  if (isPlainObject(patch.site)) {
    for (const [k, v] of Object.entries(patch.site)) {
      const path = `plugins.site.${k}`;
      if (!EDITABLE.has(path)) continue;

      if (k === "plainBg") {
        if (typeof v !== "boolean") {
          return {
            applied,
            needsRestart,
            error: `${path} must be a boolean`,
          };
        }
        dotSet(file, path, v);
        setConfig(path, v);
        applied.push(path);
        continue;
      }

      if (k === "nav") {
        if (!Array.isArray(v)) {
          return {
            applied,
            needsRestart,
            error: `${path} must be an array`,
          };
        }
        const nav = normalizeSiteNav(v);
        if (nav.length > 40) {
          return {
            applied,
            needsRestart,
            error: "plugins.site.nav: max 40 links",
          };
        }
        for (const row of nav) {
          if (!row.label.trim()) {
            return {
              applied,
              needsRestart,
              error: "plugins.site.nav: label required",
            };
          }
          if (!row.href.trim()) {
            return {
              applied,
              needsRestart,
              error: "plugins.site.nav: href required",
            };
          }
        }
        // Re-number order from array position (staff drag order)
        const ordered = nav.map((row, i) => ({
          ...(row.id ? { id: row.id } : {}),
          label: row.label.slice(0, 80),
          href: row.href.slice(0, 500),
          order: (i + 1) * 10,
        }));
        dotSet(file, path, ordered);
        setConfig(path, ordered);
        applied.push(path);
        continue;
      }

      if (typeof v !== "string") {
        return {
          applied,
          needsRestart,
          error: `${path} must be a string`,
        };
      }
      let clean = v.slice(0, 2000).trim();
      if (k === "skin") {
        clean = clean.toLowerCase().replace(/[^a-z0-9_-]/g, "");
        if (!clean) clean = "default";
      }
      if (k === "skinCss" && clean && !clean.startsWith("/") &&
        !/^https?:\/\//i.test(clean)) {
        return {
          applied,
          needsRestart,
          error: "plugins.site.skinCss must be a /path or URL",
        };
      }
      if (k === "themeDir" && clean) {
        // Relative game path only — no traversal
        if (
          clean.startsWith("/") || clean.includes("..") ||
          clean.includes("\\") || clean.includes("\0")
        ) {
          return {
            applied,
            needsRestart,
            error:
              "plugins.site.themeDir must be a relative dir " +
              "(e.g. theme)",
          };
        }
        clean = clean.replace(/\/+$/, "").slice(0, 80);
      }
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

/** Normalize plugins.site.nav from config or PATCH body. */
function normalizeSiteNav(raw: unknown): SiteNavRow[] {
  if (!Array.isArray(raw)) return [];
  const out: SiteNavRow[] = [];
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const label = String(r.label ?? "").trim();
    const href = String(r.href ?? "").trim();
    if (!label && !href) continue;
    const idRaw = typeof r.id === "string" ? r.id.trim() : "";
    const order = typeof r.order === "number" && Number.isFinite(r.order)
      ? r.order
      : (i + 1) * 10;
    const reqRaw = typeof r.require === "string"
      ? r.require.trim()
      : "";
    out.push({
      id: idRaw || undefined,
      label: label || "Link",
      href: href || "#",
      order,
      require: reqRaw || undefined,
    });
  }
  // Stable sort by order, keep equal-order array order
  return out
    .map((row, i) => ({ row, i }))
    .sort((a, b) => {
      if (a.row.order !== b.row.order) {
        return a.row.order - b.row.order;
      }
      return a.i - b.i;
    })
    .map(({ row }) => row);
}

/** Push plugins.site into live @ursamu/site runtime (no reboot). */
async function refreshSiteRuntime(
  file: Record<string, unknown>,
): Promise<boolean> {
  try {
    type SiteMod = {
      readSiteConfig?: (c: unknown) => Record<string, unknown>;
      applySkinDefaults?: (
        c: Record<string, unknown>,
      ) => Record<string, unknown>;
      setSiteRuntime?: (c: Record<string, unknown>) => void;
      getSiteRuntime?: () => {
        cfg?: { skin?: string };
      };
    };
    let site: SiteMod | null = null;
    let lastErr: unknown = null;
    try {
      site = await import("@ursamu/site") as SiteMod;
    } catch (e: unknown) {
      lastErr = e;
      try {
        site = await import(
          "jsr:@ursamu/site@^0.1.5"
        ) as SiteMod;
        lastErr = null;
      } catch (e2: unknown) {
        lastErr = e2;
        site = null;
      }
    }
    if (!site) {
      console.warn("[web] refreshSiteRuntime import:", lastErr);
      return false;
    }
    if (typeof site.readSiteConfig !== "function" ||
      typeof site.setSiteRuntime !== "function") {
      console.warn("[web] refreshSiteRuntime: incomplete site module");
      return false;
    }
    let cfg = site.readSiteConfig(file);
    if (typeof site.applySkinDefaults === "function") {
      cfg = site.applySkinDefaults(cfg);
    }
    site.setSiteRuntime(cfg);
    const live = site.getSiteRuntime?.();
    const want = String(
      (cfg as { skin?: string }).skin ?? "",
    );
    const got = String(live?.cfg?.skin ?? "");
    if (want && got && want !== got) {
      console.warn(
        "[web] site runtime mismatch after set:",
        { want, got },
      );
      return false;
    }
    console.log(
      `[web] site settings live → ${
        (cfg as { skinCss?: string; skin?: string }).skinCss ||
        want ||
        "default"
      }`,
    );
    return true;
  } catch (e: unknown) {
    console.warn("[web] refreshSiteRuntime:", e);
    return false;
  }
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

  // ── FE theme zip install / list ────────────────────────────────
  const themeRes = await handleSiteThemeRoutes(req, path, method);
  if (themeRes) return themeRes;

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
      const applied: string[] = [];
      let needsRestart = false;
      let siteLive = false;

      // Web login splash (markdown or HTML) — server.texts id=welcome
      if (typeof body.loginMarkdown === "string") {
        const splash = body.loginMarkdown;
        if (splash.length > 200_000) {
          return json({ error: "loginMarkdown too large" }, 400);
        }
        const existing = await texts.queryOne({ id: "welcome" });
        if (existing) {
          await texts.modify(
            { id: "welcome" },
            "$set",
            { content: splash },
          );
        } else {
          await texts.create({ id: "welcome", content: splash });
        }
        applied.push("loginMarkdown");
      }

      const file = await readConfigFile();
      const configBody = { ...body };
      delete configBody.loginMarkdown;
      if (
        isPlainObject(configBody.game) ||
        isPlainObject(configBody.layout) ||
        isPlainObject(configBody.site)
      ) {
        const result = applyEditablePatch(file, configBody);
        if (result.error && !applied.length) {
          return json({ error: result.error }, 400);
        }
        if (!result.error && result.applied.length) {
          await writeConfigFile(file);
          applied.push(...result.applied);
          needsRestart = result.needsRestart;
          const siteTouched = result.applied.some((k) =>
            SITE_LIVE_KEYS.has(k)
          );
          if (siteTouched) {
            siteLive = await refreshSiteRuntime(file);
          }
        }
      }

      if (!applied.length) {
        return json({ error: "Nothing to update" }, 400);
      }

      return json({
        ok: true,
        applied,
        needsRestart,
        siteLive,
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

