/**
 * Serve the public site under /site/ (and optionally /).
 */

import { fromFileUrl, join, normalize } from "@std/path";
import type { SitePluginConfig, SiteNavItem } from "./config.ts";
import { normalizeMount, resolveSkinHref } from "./config.ts";
import { injectSiteHtml } from "./html.ts";
import {
  DEFAULT_LEFT_MENU,
  resolvePluginMenuBlocks,
} from "./menu.ts";
import { listSiteNav, mergeSiteNav } from "./site-nav.ts";
import {
  getSiteStaticRoot,
  safeJoinSiteStatic,
} from "./site-static.ts";

/**
 * Base URL for shipped public/ assets.
 * file: when running from a path checkout; https: when loaded from JSR.
 * Never call fromFileUrl on the https form.
 */
const PUBLIC_BASE = new URL("../public/", import.meta.url);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

function extOf(path: string): string {
  const i = path.lastIndexOf(".");
  return i >= 0 ? path.slice(i).toLowerCase() : "";
}

/** Root SPA paths when plugins.site.serveRoot is true. */
function isPublicRootSpa(path: string): boolean {
  if (path === "/" || path === "") return true;
  if (path === "/login" || path.startsWith("/login/")) return true;
  if (path === "/profile" || path.startsWith("/profile/")) {
    return true;
  }
  if (path === "/wiki" || path.startsWith("/wiki/")) return true;
  if (path === "/help" || path.startsWith("/help/")) return true;
  if (path === "/chargen" || path.startsWith("/chargen/")) {
    return true;
  }
  if (path === "/play" || path.startsWith("/play/")) {
    return true;
  }
  return false;
}

function safeJoin(root: string, rel: string): string | null {
  const cleaned = rel.replace(/^\/+/, "").replace(/\\/g, "/");
  if (cleaned.includes("\0") || cleaned.split("/").includes("..")) {
    return null;
  }
  const full = normalize(join(root, cleaned));
  const rootNorm = normalize(root);
  const prefix = rootNorm.endsWith("/") ? rootNorm : `${rootNorm}/`;
  if (full !== rootNorm && !full.startsWith(prefix)) return null;
  return full;
}

export type SiteRuntime = {
  cfg: SitePluginConfig;
  mount: string;
  /** Absolute path to game themeDir, if configured */
  themeRoot: string | null;
  /**
   * Bumps on every setSiteRuntime so skinHref cache-busts even when
   * the path is unchanged (overwrite installed theme CSS in place).
   */
  gen: number;
};

/**
 * Process-wide runtime. MUST be globalThis — not a module binding.
 * `@ursamu/web` may `import("@ursamu/site")` on a different specifier
 * than the plugin that registered `siteStaticHandler` (vendor path vs
 * JSR). Separate module instances would otherwise keep two runtimes
 * and theme changes would write config but never affect the live FE.
 */
const RUNTIME_KEY = Symbol.for("ursamu.site.runtime");

type RuntimeHolder = { current: SiteRuntime };

function runtimeHolder(): RuntimeHolder {
  const g = globalThis as unknown as Record<symbol, RuntimeHolder>;
  if (!g[RUNTIME_KEY]) {
    g[RUNTIME_KEY] = {
      current: {
        cfg: {},
        mount: "/site",
        themeRoot: null,
        gen: 0,
      },
    };
  }
  return g[RUNTIME_KEY]!;
}

function runtime(): SiteRuntime {
  return runtimeHolder().current;
}

export function setSiteRuntime(cfg: SitePluginConfig): void {
  let themeRoot: string | null = null;
  const td = (cfg.themeDir ?? "").trim();
  if (td) {
    try {
      const abs = td.startsWith("/")
        ? normalize(td)
        : normalize(join(Deno.cwd(), td));
      themeRoot = abs;
    } catch {
      themeRoot = null;
    }
  }
  const prev = runtime();
  runtimeHolder().current = {
    cfg,
    mount: normalizeMount(cfg.mount),
    themeRoot,
    gen: (prev.gen || 0) + 1,
  };
}

export function getSiteRuntime(): SiteRuntime {
  return runtime();
}

/** Skin href with runtime generation for hard cache bust after theme swap. */
export function liveSkinHref(cfg: SitePluginConfig = runtime().cfg): string {
  const base = resolveSkinHref(cfg);
  const gen = runtime().gen || 0;
  if (!gen) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}g=${gen}`;
}

/** Config nav + plugin registerSiteNav (config wins on id). */
export function resolvedSiteNav(): SiteNavItem[] {
  return mergeSiteNav(runtime().cfg.nav, listSiteNav());
}

/** JSON config consumed by public/js/site.js */
export async function siteConfigResponse(
  mode = "home",
  wikiPath = "",
): Promise<Response> {
  const c = runtime().cfg;
  const nav = resolvedSiteNav();
  const leftMenu = (c.leftMenu ?? DEFAULT_LEFT_MENU).trim() ||
    DEFAULT_LEFT_MENU;
  const menuBlocks = await resolvePluginMenuBlocks({
    mode,
    wikiPath,
  });

  const body = {
    title: c.title ?? "UrsaMU",
    skin: c.skin ?? "default",
    skinCss: c.skinCss,
    skinHref: liveSkinHref(c),
    bannerImage: c.bannerImage,
    logoImage: c.logoImage,
    plainBg: c.plainBg === true,
    nav,
    telnet: c.telnet,
    leftMenu,
    menuBlocks,
    /** Clients can detect theme swaps without full reload. */
    gen: runtime().gen,
  };
  return Response.json(body, {
    headers: {
      "cache-control": "no-store",
    },
  });
}

async function readDiskFile(
  path: string,
): Promise<Uint8Array | null> {
  try {
    const data = await Deno.readFile(path);
    return new Uint8Array(data);
  } catch {
    return null;
  }
}

/**
 * Read a file under package public/ (disk or JSR https fetch).
 * `rel` is path-relative (e.g. "index.html", "css/skins/default.css").
 */
async function readPublic(
  rel: string,
): Promise<Uint8Array | null> {
  const cleaned = rel.replace(/^\/+/, "").replace(/\\/g, "/");
  if (
    !cleaned ||
    cleaned.includes("\0") ||
    cleaned.split("/").includes("..")
  ) {
    return null;
  }
  try {
    const url = new URL(cleaned, PUBLIC_BASE);
    if (url.protocol === "file:") {
      return await readDiskFile(fromFileUrl(url));
    }
    // JSR / remote module graph — Deno fetch resolves package assets
    const res = await fetch(url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function serveIndexHtml(
  requestPath = "/site/",
): Promise<Response> {
  const bytes = await readPublic("index.html");
  if (!bytes) return new Response("Not found", { status: 404 });
  const raw = new TextDecoder().decode(bytes);
  const cfg: SitePluginConfig = {
    ...runtime().cfg,
    nav: resolvedSiteNav(),
  };
  // injectSiteHtml uses resolveSkinHref; swap to live (gen) bust
  let html = injectSiteHtml(raw, cfg, {
    path: requestPath,
  });
  const live = liveSkinHref(cfg);
  html = html.replace(
    /(<link\b[^>]*\bdata-site-skin\b[^>]*\bhref\s*=\s*")[^"]*(")/i,
    `$1${live.replace(/"/g, "&quot;")}$2`,
  );
  html = html.replace(
    /(<link\b[^>]*\bhref\s*=\s*")[^"]*("[^>]*\bdata-site-skin\b)/i,
    `$1${live.replace(/"/g, "&quot;")}$2`,
  );
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-cache",
    },
  });
}

async function servePluginStatic(
  pluginId: string,
  rel: string,
): Promise<Response | null> {
  const root = getSiteStaticRoot(pluginId);
  if (!root) return null;

  let sub = rel.replace(/^\/+/, "");
  if (!sub || sub.endsWith("/")) sub += "index.html";
  if (!extOf(sub)) {
    // try as file first, else index under dir
    const asFile = safeJoinSiteStatic(root, sub);
    if (asFile) {
      const direct = await readDiskFile(asFile);
      if (direct) {
        return fileResponse(asFile, direct);
      }
    }
    sub = `${sub.replace(/\/+$/, "")}/index.html`;
  }

  const filePath = safeJoinSiteStatic(root, sub);
  if (!filePath) return new Response("Not found", { status: 404 });

  const bytes = await readDiskFile(filePath);
  if (!bytes) {
    // SPA fallback
    const idx = safeJoinSiteStatic(root, "index.html");
    if (idx) {
      const ib = await readDiskFile(idx);
      if (ib) return fileResponse(idx, ib);
    }
    return new Response("Not found", { status: 404 });
  }
  return fileResponse(filePath, bytes);
}

function fileResponse(
  filePath: string,
  bytes: Uint8Array,
): Response {
  const ext = extOf(filePath);
  const type = MIME[ext] ?? "application/octet-stream";
  const immutable = ext === ".woff2" || ext === ".woff" ||
    ext === ".png" || ext === ".jpg" || ext === ".svg";
  return new Response(bytes.buffer as ArrayBuffer, {
    headers: {
      "content-type": type,
      "cache-control": immutable
        ? "public, max-age=86400"
        : "no-cache",
    },
  });
}

/**
 * Map request URL path → file under public/ (or themeDir / plugin).
 * Handles /site, /site/, /site/css/… and optional /.
 */
export async function siteStaticHandler(
  req: Request,
  _userId: string | null = null,
): Promise<Response> {
  const url = new URL(req.url);
  let path = url.pathname;
  const requestPath = url.pathname;

  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rt = runtime();
  const mount = rt.mount;

  // Config endpoint
  if (
    path === `${mount}/config.json` ||
    path === "/site/config.json"
  ) {
    const mode = url.searchParams.get("mode") ?? "home";
    const wikiPath = url.searchParams.get("wikiPath") ?? "";
    return await siteConfigResponse(mode, wikiPath);
  }

  // Strip mount prefix; with serveRoot, public SPA paths at /
  // (/, /login, /profile, /wiki/, /help/…) also serve the shell.
  if (path === mount || path === `${mount}/`) {
    path = "/index.html";
  } else if (path.startsWith(`${mount}/`)) {
    path = path.slice(mount.length);
  } else if (rt.cfg.serveRoot && isPublicRootSpa(path)) {
    path = "/index.html";
  } else if (path.startsWith("/site/")) {
    path = path.slice("/site".length) || "/index.html";
  } else {
    return new Response("Not found", { status: 404 });
  }

  if (path.endsWith("/")) path += "index.html";
  if (path === "") path = "/index.html";

  // Plugin static: /p/<id>/…
  const pMatch = path.match(
    /^\/p\/([a-z][a-z0-9_-]*)(?:\/(.*))?$/i,
  );
  if (pMatch) {
    const id = pMatch[1]!.toLowerCase();
    const rel = pMatch[2] ?? "index.html";
    const res = await servePluginStatic(id, rel);
    if (res) return res;
    return new Response("Not found", { status: 404 });
  }

  // Injected HTML shell
  if (path === "/index.html" || path === "index.html") {
    return await serveIndexHtml(requestPath);
  }

  // Game themeDir → /site/theme/* (always on-disk under game cwd)
  if (
    rt.themeRoot &&
    (path.startsWith("/theme/") || path.startsWith("theme/"))
  ) {
    const rel = path.replace(/^\/?theme\//, "");
    const filePath = safeJoin(rt.themeRoot, rel);
    if (filePath) {
      const bytes = await readDiskFile(filePath);
      if (bytes) return fileResponse(filePath, bytes);
    }
  }

  // Package public/ — disk (path checkout) or fetch (JSR https)
  const rel = path.replace(/^\/+/, "");
  const bytes = await readPublic(rel);
  if (!bytes) {
    // SPA-ish: unknown bare paths under mount → index
    if (!extOf(path) || path.endsWith(".html")) {
      return await serveIndexHtml(requestPath);
    }
    return new Response("Not found", { status: 404 });
  }

  return fileResponse(rel, bytes);
}
