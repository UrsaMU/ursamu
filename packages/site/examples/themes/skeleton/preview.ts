/**
 * Standalone theme preview — no monorepo checkout required.
 *
 *   deno task preview
 *   deno task preview -- --open
 *   deno run -A preview.ts --port 4173 --open
 *
 * Resolves @ursamu/site shell assets (css/js/index.html) from, in order:
 *   1. --shell <dir> / URSAMU_SITE_PUBLIC
 *   2. ./shell/          (optional vendored copy)
 *   3. ../../public/     (monorepo: packages/site/public)
 *   4. .preview-shell/   (auto-downloaded from GitHub, cached)
 *
 * Serves real site.js + fixture wiki/help/auth APIs + preview toolbar.
 */

import {
  basename,
  dirname,
  extname,
  fromFileUrl,
  join,
  normalize,
  relative,
  resolve,
} from "jsr:@std/path@^1.0.0";
import { ensureDir, existsSync, walk } from "jsr:@std/fs@^1.0.0";
import { parseArgs } from "jsr:@std/cli@^1.0.0/parse-args";

const THEME = resolve(dirname(fromFileUrl(import.meta.url)));
const DEFAULT_PORT = 4173;
const CACHE_DIR = join(THEME, ".preview-shell");
const SHELL_REF_DEFAULT = "main";
const SHELL_BASE =
  "https://raw.githubusercontent.com/UrsaMU/ursamu";

/** Minimal public files needed for home/wiki/help/login chrome. */
const SHELL_FILES = [
  "index.html",
  "css/reset.css",
  "css/tokens.css",
  "css/layout.css",
  "css/components.css",
  "css/play.css",
  "css/play-palette.css",
  "css/play-deck.css",
  "css/skins/default.css",
  "js/site.js",
  "js/play.js",
  "js/play-deck.js",
];

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
  ".gif": "image/gif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

type WikiPage = {
  path: string;
  title: string;
  body: string;
  type?: string;
  featured?: boolean;
  tags?: string[];
  draft?: boolean;
};

type HelpTopic = {
  name: string;
  path: string;
  section: string;
  sample?: string;
  num?: string;
};

type ThemeManifest = {
  id?: string;
  label?: string;
  title?: string;
  css?: string;
  bannerImage?: string;
  logoImage?: string;
  plainBg?: boolean;
};

const args = parseArgs(Deno.args, {
  string: ["port", "host", "shell", "ref"],
  boolean: ["help", "open", "refresh-shell"],
  alias: { h: "help", p: "port", H: "host", o: "open" },
  default: {
    host: "127.0.0.1",
    open: false,
    ref: SHELL_REF_DEFAULT,
  },
});

if (args.help) {
  console.log(`UrsaMU theme preview (standalone)

Usage:
  deno task preview
  deno task preview -- --open --port 4174
  deno run -A preview.ts [options]

Options:
  --port, -p         Port (default ${DEFAULT_PORT})
  --host, -H         Bind host (default 127.0.0.1)
  --open, -o         Open browser
  --shell <dir>      Path to @ursamu/site public/ (skip download)
  --ref <git-ref>    GitHub ref for shell download (default main)
  --refresh-shell    Re-download shell into .preview-shell/
  --help, -h

Shell resolution order:
  --shell → URSAMU_SITE_PUBLIC → ./shell → monorepo ../../public
  → .preview-shell (GitHub cache)
`);
  Deno.exit(0);
}

// ── shell resolution ───────────────────────────────────────────────

function looksLikePublic(dir: string): boolean {
  return existsSync(join(dir, "index.html")) &&
    existsSync(join(dir, "js", "site.js")) &&
    existsSync(join(dir, "css", "layout.css"));
}

async function downloadShell(ref: string): Promise<string> {
  await ensureDir(CACHE_DIR);
  const base = `${SHELL_BASE}/${ref}/packages/site/public`;
  console.log(`Downloading @ursamu/site shell (${ref})…`);
  for (const rel of SHELL_FILES) {
    const url = `${base}/${rel}`;
    const out = join(CACHE_DIR, rel);
    await ensureDir(dirname(out));
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed ${url}: HTTP ${res.status}`);
    }
    const data = new Uint8Array(await res.arrayBuffer());
    await Deno.writeFile(out, data);
    console.log(`  + ${rel} (${data.byteLength} B)`);
  }
  await Deno.writeTextFile(
    join(CACHE_DIR, ".ref"),
    `${ref}\n${new Date().toISOString()}\n`,
  );
  return CACHE_DIR;
}

async function resolveShellPublic(): Promise<{
  dir: string;
  source: string;
}> {
  const refresh = args["refresh-shell"] === true;
  const ref = String(args.ref || SHELL_REF_DEFAULT);

  const explicit = args.shell
    ? resolve(String(args.shell))
    : Deno.env.get("URSAMU_SITE_PUBLIC")?.trim()
    ? resolve(Deno.env.get("URSAMU_SITE_PUBLIC")!)
    : null;

  if (explicit) {
    if (!looksLikePublic(explicit)) {
      throw new Error(
        `Not a site public/ dir: ${explicit}`,
      );
    }
    return { dir: explicit, source: "flag/env" };
  }

  const vendored = join(THEME, "shell");
  if (looksLikePublic(vendored)) {
    return { dir: vendored, source: "shell/" };
  }

  // monorepo: packages/site/examples/themes/<id>
  //   → packages/site/public (three levels up)
  const monoCandidates = [
    resolve(THEME, "../../../public"),
    resolve(THEME, "../../public"),
  ];
  for (const mono of monoCandidates) {
    if (looksLikePublic(mono)) {
      return { dir: mono, source: "monorepo public/" };
    }
  }

  if (!refresh && looksLikePublic(CACHE_DIR)) {
    return { dir: CACHE_DIR, source: ".preview-shell (cache)" };
  }

  const dir = await downloadShell(ref);
  return { dir, source: `GitHub ursamu@${ref}` };
}

// ── theme manifest ─────────────────────────────────────────────────

const themeJsonPath = join(THEME, "theme.json");
if (!existsSync(themeJsonPath)) {
  console.error(`Missing theme.json in ${THEME}`);
  Deno.exit(1);
}

const manifest = JSON.parse(
  await Deno.readTextFile(themeJsonPath),
) as ThemeManifest;

let themeId = basename(THEME);
if (manifest.id && /^[a-z][a-z0-9_-]{0,39}$/.test(manifest.id)) {
  themeId = manifest.id;
}

const fixturesDir = join(THEME, "fixtures");
const port = Number(args.port ?? DEFAULT_PORT) || DEFAULT_PORT;
const host = String(args.host ?? "127.0.0.1");

const shell = await resolveShellPublic();
const PUBLIC = shell.dir;

// ── helpers ────────────────────────────────────────────────────────

function safeJoin(root: string, rel: string): string | null {
  const cleaned = rel.replace(/^[/\\]+/, "").replace(/\\/g, "/");
  if (!cleaned || cleaned.includes("\0")) return null;
  if (cleaned.split("/").some((p) => p === "..")) return null;
  const full = normalize(join(root, cleaned));
  const rootN = normalize(root);
  if (full !== rootN && !full.startsWith(rootN + "/")) return null;
  return full;
}

async function readBytes(path: string): Promise<Uint8Array | null> {
  try {
    return await Deno.readFile(path);
  } catch {
    return null;
  }
}

function contentType(path: string): string {
  return MIME[extname(path).toLowerCase()] ??
    "application/octet-stream";
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function parseFrontmatter(raw: string): {
  meta: Record<string, string>;
  body: string;
} {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i < 1) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    meta[k] = v;
  }
  return { meta, body: m[2] ?? "" };
}

function parseTags(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  if (s.startsWith("[") && s.endsWith("]")) {
    return s
      .slice(1, -1)
      .split(",")
      .map((t) => t.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  return s.split(/[,\s]+/).filter(Boolean);
}

function truthy(v: string | undefined): boolean {
  if (!v) return false;
  const s = v.trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

// ── fixtures ───────────────────────────────────────────────────────

async function loadWikiPages(): Promise<WikiPage[]> {
  const wikiRoot = join(fixturesDir, "wiki");
  const pages: WikiPage[] = [];
  if (!existsSync(wikiRoot)) {
    return [{
      path: "home",
      title: "Theme preview",
      body: "Add fixtures/wiki/home.md\n",
    }];
  }
  for await (
    const e of walk(wikiRoot, { includeDirs: false, exts: [".md"] })
  ) {
    const rel = relative(wikiRoot, e.path).replace(/\\/g, "/");
    const raw = await Deno.readTextFile(e.path);
    const { meta, body } = parseFrontmatter(raw);
    const pathFromFile = rel.replace(/\.md$/i, "");
    const path = (meta.path || pathFromFile).replace(/^\/+|\/+$/g, "");
    pages.push({
      path,
      title: meta.title || path.split("/").pop() || path,
      body: body.trimEnd() + "\n",
      type: meta.type || undefined,
      featured: truthy(meta.featured),
      tags: parseTags(meta.tags),
      draft: truthy(meta.draft),
    });
  }
  return pages;
}

async function loadHelpIndex(): Promise<{
  sections: string[];
  topics: HelpTopic[];
  staff: boolean;
}> {
  const idxPath = join(fixturesDir, "help", "index.json");
  if (existsSync(idxPath)) {
    try {
      const j = JSON.parse(await Deno.readTextFile(idxPath)) as {
        sections?: string[];
        topics?: HelpTopic[];
        staff?: boolean;
      };
      return {
        sections: j.sections ?? ["general"],
        topics: j.topics ?? [],
        staff: j.staff === true,
      };
    } catch {
      /* fall through */
    }
  }
  return { sections: ["general"], topics: [], staff: false };
}

async function helpEntry(
  topicPath: string,
  index: Awaited<ReturnType<typeof loadHelpIndex>>,
): Promise<Record<string, unknown> | null> {
  const t = index.topics.find(
    (x) =>
      x.path === topicPath ||
      x.name.replace(/^\+/, "") === topicPath,
  );
  const file = join(fixturesDir, "help", `${topicPath}.md`);
  if (!t && !existsSync(file)) return null;

  let name = t?.name ?? topicPath;
  let section = t?.section ?? "general";
  let content = `Help topic **${topicPath}**.\n`;
  if (existsSync(file)) {
    const raw = await Deno.readTextFile(file);
    const { meta, body } = parseFrontmatter(raw);
    if (meta.name) name = meta.name;
    if (meta.section) section = meta.section;
    content = body.trim() + "\n";
  }
  return { name, section, content, path: topicPath };
}

const wikiPages = await loadWikiPages();
const helpIndex = await loadHelpIndex();

function wikiListPayload() {
  return wikiPages
    .filter((p) => p.path !== "home")
    .map((p) => ({
      path: p.path,
      title: p.title,
      type: p.type ?? "page",
      featured: p.featured === true,
      tags: p.tags ?? [],
      draft: p.draft === true,
    }));
}

function findWiki(path: string): WikiPage | undefined {
  const clean = path.replace(/^\/+|\/+$/g, "");
  return wikiPages.find((p) => p.path === clean);
}

function siteConfigBody() {
  const cssName = (manifest.css || "site.css").replace(/^\/+/, "");
  const skinCss = `/site/theme/installed/${themeId}/${cssName}`;
  let bannerImage = "";
  if (manifest.bannerImage) {
    bannerImage = `/site/theme/installed/${themeId}/` +
      manifest.bannerImage.replace(/^\/+/, "");
  }
  let logoImage = "";
  if (manifest.logoImage) {
    logoImage = `/site/theme/installed/${themeId}/` +
      manifest.logoImage.replace(/^\/+/, "");
  }
  return {
    title: manifest.title || manifest.label || themeId,
    skin: themeId,
    skinCss,
    skinHref: skinCss,
    bannerImage: bannerImage || undefined,
    logoImage: logoImage || undefined,
    plainBg: manifest.plainBg === true,
    telnet: "preview.local:4201",
    playPreview: true,
    nav: [
      { id: "home", label: "Home", href: "/site/", order: 10 },
      { id: "wiki", label: "Wiki", href: "/site/wiki/", order: 20 },
      { id: "help", label: "Help", href: "/site/help/", order: 30 },
      {
        id: "play",
        label: "Play",
        href: "/site/play",
        order: 40,
        require: "connected",
      },
    ],
    leftMenu: `## Featured
[[featured]]

## Preview
- [Home gallery](/site/)
- [Wiki index](/site/wiki/)
- [Help](/site/help/)
- [Log in](/site/login)

## Related
[[section]]
`,
    menuBlocks: {},
    gen: Date.now(),
  };
}

function userFromAuth(req: Request): Record<string, unknown> | null {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  const tok = (m?.[1] || "").trim();
  if (!tok) return null;
  if (tok.includes("staff")) {
    return {
      id: "preview-staff",
      name: "Staffer",
      moniker: "Staffer",
      flags: ["player", "connected", "wizard", "staff"],
      location: "OOC Lounge",
      avatar: "",
    };
  }
  return {
    id: "preview-player",
    name: "Preview",
    moniker: "Preview",
    flags: ["player", "connected"],
    location: "OOC Lounge",
    avatar: "",
  };
}

// ── shell HTML ─────────────────────────────────────────────────────

async function shellHtml(): Promise<string> {
  let html = await Deno.readTextFile(join(PUBLIC, "index.html"));
  const cfg = siteConfigBody();
  const title = String(cfg.title);
  const skin = String(cfg.skinCss);

  html = html.replace(/data-skin="[^"]*"/, `data-skin="${themeId}"`);
  html = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${title} · theme preview</title>`,
  );
  html = html.replace(
    /href="\/site\/css\/skins\/default\.css[^"]*"/,
    `href="${skin}"`,
  );

  const barCss = existsSync(join(fixturesDir, "preview-bar.css"))
    ? `\n    <link rel="stylesheet" href="/site/theme/installed/${themeId}/fixtures/preview-bar.css" />`
    : "";
  const barJs = existsSync(join(fixturesDir, "preview-bar.js"))
    ? `\n    <script src="/site/theme/installed/${themeId}/fixtures/preview-bar.js" defer></script>`
    : "";
  const playPrev =
    `\n    <script>window.__SITE_PLAY_PREVIEW__=true;</script>`;
  html = html.replace(
    "</head>",
    `${playPrev}${barCss}${barJs}\n  </head>`,
  );

  if (cfg.plainBg) {
    html = html.replace(
      'class="site-shell"',
      'class="site-shell is-plain"',
    );
  }

  if (!/data-site-config=/.test(html)) {
    html = html.replace(
      "<html ",
      `<html data-site-config="/site/config.json" `,
    );
  }
  return html;
}

async function fileResponse(
  root: string,
  rel: string,
): Promise<Response | null> {
  const file = safeJoin(root, rel);
  if (!file || !existsSync(file)) return null;
  const bytes = await readBytes(file);
  if (!bytes) return null;
  const immutable = /\.(woff2?|png|jpe?g|svg)$/i.test(file);
  return new Response(bytes.slice(), {
    headers: {
      "content-type": contentType(file),
      "cache-control": immutable
        ? "public, max-age=3600"
        : "no-store",
    },
  });
}

async function handleApi(
  path: string,
  req: Request,
): Promise<Response | null> {
  if (path === "/api/v1/config") {
    return json(siteConfigBody());
  }

  if (path === "/api/v1/me") {
    const u = userFromAuth(req);
    if (!u) return json({ error: "unauthorized" }, 401);
    return json(u);
  }

  if (path === "/api/v1/login" || path === "/api/v1/register") {
    if (req.method !== "POST") return json({ error: "method" }, 405);
    let body: { username?: string } = {};
    try {
      body = await req.json();
    } catch { /* empty */ }
    const name = String(body.username || "Preview").trim() || "Preview";
    const staff = /staff|wiz|admin/i.test(name);
    return json({
      token: staff ? "preview-staff" : "preview-player",
      ok: true,
    });
  }

  if (path === "/api/v1/wiki" || path === "/api/v1/wiki/") {
    return json(wikiListPayload());
  }

  if (path.startsWith("/api/v1/wiki/")) {
    const wpath = decodeURIComponent(
      path.slice("/api/v1/wiki/".length),
    ).replace(/^\/+|\/+$/g, "");
    const page = findWiki(wpath);
    if (!page) return json({ error: "not found" }, 404);
    return json({
      path: page.path,
      title: page.title,
      body: page.body,
      type: page.type ?? "page",
      featured: page.featured === true,
      tags: page.tags ?? [],
    });
  }

  if (path === "/api/v1/help" || path === "/api/v1/help/") {
    return json({
      sections: helpIndex.sections,
      topics: helpIndex.topics,
      staff: helpIndex.staff,
    });
  }

  if (path.startsWith("/api/v1/help/")) {
    const tpath = decodeURIComponent(
      path.slice("/api/v1/help/".length),
    ).replace(/^\/+|\/+$/g, "");
    const entry = await helpEntry(tpath, helpIndex);
    if (!entry) return json({ error: "not found" }, 404);
    return json({ entry });
  }

  if (
    path.startsWith("/api/v1/dnd/") ||
    path.startsWith("/api/v1/cpr/") ||
    path.startsWith("/api/v1/cofd/")
  ) {
    return json({ error: "not in preview" }, 404);
  }

  return null;
}

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  let path = decodeURIComponent(url.pathname);

  if (path.startsWith("/api/")) {
    const api = await handleApi(path, req);
    if (api) return api;
    return json({ error: "not found" }, 404);
  }

  if (path === "/site/config.json" || path === "/config.json") {
    return json(siteConfigBody());
  }

  const themePrefix = `/site/theme/installed/${themeId}/`;
  if (path.startsWith(themePrefix)) {
    const rel = path.slice(themePrefix.length);
    const res = await fileResponse(THEME, rel);
    if (res) return res;
    return new Response("Not found", { status: 404 });
  }

  if (path.startsWith("/site/")) {
    const sub = path.slice("/site/".length);
    if (
      !sub ||
      sub.endsWith("/") ||
      sub === "index.html" ||
      !extname(sub) ||
      sub.startsWith("wiki") ||
      sub.startsWith("help") ||
      sub === "play" ||
      sub.startsWith("play/") ||
      sub === "login" ||
      sub === "profile" ||
      sub.startsWith("login/") ||
      sub.startsWith("profile/")
    ) {
      const html = await shellHtml();
      return new Response(html, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }
    const res = await fileResponse(PUBLIC, sub);
    if (res) return res;
    return new Response("Not found", { status: 404 });
  }

  if (
    path === "/" ||
    path.startsWith("/wiki") ||
    path.startsWith("/help") ||
    path === "/play" ||
    path.startsWith("/play/") ||
    path === "/login" ||
    path === "/profile" ||
    path.startsWith("/login") ||
    path.startsWith("/profile")
  ) {
    const html = await shellHtml();
    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  return new Response("Not found: " + path, { status: 404 });
}

const server = Deno.serve({ hostname: host, port }, handler);
const base = `http://${host}:${port}`;
console.log(`Theme preview: ${themeId}`);
console.log(`  theme:  ${THEME}`);
console.log(`  shell:  ${shell.source}`);
console.log(`          ${PUBLIC}`);
console.log(`  open:   ${base}/site/`);
console.log(
  "  bar:    Home · Wiki · Article · Help · Login · Guest/Player/Staff",
);
console.log("Edit site.css → Reload CSS. Ctrl+C to stop.");

if (args.open) {
  const openCmd = Deno.build.os === "darwin"
    ? ["open", base + "/site/"]
    : Deno.build.os === "windows"
    ? ["cmd", "/c", "start", base + "/site/"]
    : ["xdg-open", base + "/site/"];
  try {
    new Deno.Command(openCmd[0], { args: openCmd.slice(1) }).spawn();
  } catch { /* ignore */ }
}

await server.finished;
