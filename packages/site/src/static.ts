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

const PUBLIC_DIR = fromFileUrl(
  new URL("../public/", import.meta.url),
);

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
};

let runtime: SiteRuntime = {
  cfg: {},
  mount: "/site",
  themeRoot: null,
};

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
  runtime = {
    cfg,
    mount: normalizeMount(cfg.mount),
    themeRoot,
  };
}

export function getSiteRuntime(): SiteRuntime {
  return runtime;
}

/** Config nav + plugin registerSiteNav (config wins on id). */
export function resolvedSiteNav(): SiteNavItem[] {
  return mergeSiteNav(runtime.cfg.nav, listSiteNav());
}

/** JSON config consumed by public/js/site.js */
export async function siteConfigResponse(
  mode = "home",
  wikiPath = "",
): Promise<Response> {
  const c = runtime.cfg;
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
    skinHref: resolveSkinHref(c),
    bannerImage: c.bannerImage,
    plainBg: c.plainBg === true,
    nav,
    telnet: c.telnet,
    leftMenu,
    menuBlocks,
  };
  return Response.json(body, {
    headers: {
      "cache-control": "no-store",
    },
  });
}

async function readFile(path: string): Promise<Uint8Array | null> {
  try {
    const data = await Deno.readFile(path);
    return new Uint8Array(data);
  } catch {
    return null;
  }
}

async function serveIndexHtml(
  requestPath = "/site/",
): Promise<Response> {
  const idx = safeJoin(PUBLIC_DIR, "index.html");
  if (!idx) return new Response("Not found", { status: 404 });
  const bytes = await readFile(idx);
  if (!bytes) return new Response("Not found", { status: 404 });
  const raw = new TextDecoder().decode(bytes);
  const cfg: SitePluginConfig = {
    ...runtime.cfg,
    nav: resolvedSiteNav(),
  };
  const html = injectSiteHtml(raw, cfg, {
    path: requestPath,
  });
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
      const direct = await readFile(asFile);
      if (direct) {
        return fileResponse(asFile, direct);
      }
    }
    sub = `${sub.replace(/\/+$/, "")}/index.html`;
  }

  const filePath = safeJoinSiteStatic(root, sub);
  if (!filePath) return new Response("Not found", { status: 404 });

  const bytes = await readFile(filePath);
  if (!bytes) {
    // SPA fallback
    const idx = safeJoinSiteStatic(root, "index.html");
    if (idx) {
      const ib = await readFile(idx);
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

  const mount = runtime.mount;

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
  // (/, /login, /profile, /wiki/…) also serve the shell.
  if (path === mount || path === `${mount}/`) {
    path = "/index.html";
  } else if (path.startsWith(`${mount}/`)) {
    path = path.slice(mount.length);
  } else if (runtime.cfg.serveRoot && isPublicRootSpa(path)) {
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

  // Game themeDir → /site/theme/*
  if (
    runtime.themeRoot &&
    (path.startsWith("/theme/") || path.startsWith("theme/"))
  ) {
    const rel = path.replace(/^\/?theme\//, "");
    const filePath = safeJoin(runtime.themeRoot, rel);
    if (filePath) {
      const bytes = await readFile(filePath);
      if (bytes) return fileResponse(filePath, bytes);
    }
  }

  const filePath = safeJoin(PUBLIC_DIR, path);
  if (!filePath) {
    return new Response("Not found", { status: 404 });
  }

  const bytes = await readFile(filePath);
  if (!bytes) {
    // SPA-ish: unknown bare paths under mount → index
    if (!extOf(path) || path.endsWith(".html")) {
      return await serveIndexHtml(requestPath);
    }
    return new Response("Not found", { status: 404 });
  }

  return fileResponse(filePath, bytes);
}
