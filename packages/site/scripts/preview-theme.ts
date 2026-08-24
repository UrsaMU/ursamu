/**
 * Local theme preview — real site.js shell + fixture APIs.
 *
 *   deno task preview-theme
 *   deno task preview-theme examples/themes/skeleton --open
 *   deno task preview-theme ./my-theme --port 4174
 *
 * Serves:
 *   / and /site/*     → public shell (site.js drives chrome)
 *   /site/css|js/*    → packages/site/public
 *   /site/theme/installed/<id>/* → theme package
 *   /site/config.json → theme + fixture config
 *   /api/v1/wiki|help|me|login → fixtures under theme/fixtures/
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
} from "jsr:@std/path@^0.224.0";
import { existsSync, walk } from "jsr:@std/fs@^0.224.0";
import { parse } from "jsr:@std/flags@^0.224.0";

const SITE = resolve(dirname(fromFileUrl(import.meta.url)), "..");
const PUBLIC = join(SITE, "public");
const DEFAULT_THEME = join(SITE, "examples/themes/skeleton");
const DEFAULT_PORT = 4173;

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
  content?: string;
};

type ThemeManifest = {
  id?: string;
  label?: string;
  title?: string;
  css?: string;
  bannerImage?: string;
  logoImage?: string;
  plainBg?: boolean;
  description?: string;
};

const args = parse(Deno.args, {
  string: ["port", "host"],
  boolean: ["help", "open"],
  alias: { h: "help", p: "port", H: "host" },
  default: { host: "127.0.0.1", open: false },
});

if (args.help) {
  console.log(`preview-theme — working FE theme gallery (site.js + fixtures)

Usage:
  deno run -A scripts/preview-theme.ts [theme-dir] [options]

Options:
  --port, -p   Port (default ${DEFAULT_PORT})
  --host, -H   Bind host (default 127.0.0.1)
  --open       Open browser after listen

Fixture layout (optional under theme-dir):
  fixtures/wiki/**/*.md     wiki pages (+ home.md)
  fixtures/help/index.json  help sections/topics
  fixtures/help/*.md        help topic bodies
  fixtures/preview-bar.js   route/auth toolbar
  fixtures/preview-bar.css
`);
  Deno.exit(0);
}

const themeDir = resolve(String(args._[0] ?? DEFAULT_THEME));
const themeJsonPath = join(themeDir, "theme.json");
if (!existsSync(themeJsonPath)) {
  console.error(`Missing theme.json in ${themeDir}`);
  Deno.exit(1);
}

// Prefer the theme's standalone preview.ts when present so monorepo
// and web-template clones share one implementation.
const themePreview = join(themeDir, "preview.ts");
if (existsSync(themePreview) && !Deno.env.get("URSAMU_PREVIEW_INNER")) {
  const passthrough = Deno.args.filter((a) => {
    // drop positional theme path; preview.ts is cwd-based
    const abs = resolve(a);
    return abs !== themeDir && a !== args._[0];
  });
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", themePreview, ...passthrough],
    cwd: themeDir,
    env: { ...Deno.env.toObject(), URSAMU_PREVIEW_INNER: "1" },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const { code } = await cmd.output();
  Deno.exit(code);
}

const manifest = JSON.parse(
  await Deno.readTextFile(themeJsonPath),
) as ThemeManifest;

let themeId = basename(themeDir);
if (
  manifest.id &&
  /^[a-z][a-z0-9_-]{0,39}$/.test(manifest.id)
) {
  themeId = manifest.id;
}

const fixturesDir = join(themeDir, "fixtures");
const port = Number(args.port ?? DEFAULT_PORT) || DEFAULT_PORT;
const host = String(args.host ?? "127.0.0.1");

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

// ── load fixtures ──────────────────────────────────────────────────

async function loadWikiPages(): Promise<WikiPage[]> {
  const wikiRoot = join(fixturesDir, "wiki");
  const pages: WikiPage[] = [];
  if (!existsSync(wikiRoot)) {
    return defaultWikiPages();
  }
  for await (
    const e of walk(wikiRoot, {
      includeDirs: false,
      exts: [".md"],
    })
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
  if (!pages.some((p) => p.path === "home")) {
    pages.push(...defaultWikiPages().filter((p) => p.path === "home"));
  }
  return pages;
}

function defaultWikiPages(): WikiPage[] {
  return [{
    path: "home",
    title: "Theme preview",
    featured: false,
    body: `# Welcome

Add \`fixtures/wiki/home.md\` for a full gallery.

- [Wiki](/site/wiki/)
- [Help](/site/help/)
- [Login](/site/login)
`,
  }];
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
  return {
    sections: ["general"],
    topics: [{
      name: "+look",
      path: "look",
      section: "general",
      sample: "Examine the room.",
      num: "1.01",
    }],
    staff: false,
  };
}

async function loadHelpBody(topicPath: string): Promise<string> {
  const file = join(fixturesDir, "help", `${topicPath}.md`);
  if (!existsSync(file)) {
    return `Help topic **${topicPath}** (fixture placeholder).\n`;
  }
  const raw = await Deno.readTextFile(file);
  return parseFrontmatter(raw).body.trim() + "\n";
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
  if (!t && !existsSync(join(fixturesDir, "help", `${topicPath}.md`))) {
    return null;
  }
  const file = join(fixturesDir, "help", `${topicPath}.md`);
  let name = t?.name ?? topicPath;
  let section = t?.section ?? "general";
  let content = await loadHelpBody(topicPath);
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
  const skinCss =
    `/site/theme/installed/${themeId}/${cssName}`;
  let bannerImage = "";
  if (manifest.bannerImage) {
    bannerImage =
      `/site/theme/installed/${themeId}/` +
      manifest.bannerImage.replace(/^\/+/, "");
  }
  let logoImage = "";
  if (manifest.logoImage) {
    logoImage =
      `/site/theme/installed/${themeId}/` +
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
  const idx = join(PUBLIC, "index.html");
  let html = await Deno.readTextFile(idx);
  const cfg = siteConfigBody();
  const title = String(cfg.title);
  const skin = String(cfg.skinCss);
  const plain = cfg.plainBg ? " is-plain" : "";

  html = html.replace(
    /data-skin="[^"]*"/,
    `data-skin="${themeId}"`,
  );
  html = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${title} · theme preview</title>`,
  );
  // Point skin at theme package (multiline <link> ok)
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

  // Mark shell for plainBg early paint
  if (plain) {
    html = html.replace(
      'class="site-shell"',
      `class="site-shell${plain}"`,
    );
    html = html.replace(
      "class=\"site-shell\"",
      `class="site-shell${plain}"`,
    );
  }

  // data-site-config on <html> for site.js
  if (!/data-site-config=/.test(html)) {
    html = html.replace(
      "<html ",
      `<html data-site-config="/site/config.json" `,
    );
  }

  return html;
}

// ── request handler ────────────────────────────────────────────────

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
  // /api/v1/...
  if (path === "/api/v1/config") {
    return json(siteConfigBody());
  }

  if (path === "/api/v1/me") {
    const u = userFromAuth(req);
    if (!u) return json({ error: "unauthorized" }, 401);
    return json(u);
  }

  if (path === "/api/v1/login" || path === "/api/v1/register") {
    if (req.method !== "POST") {
      return json({ error: "method" }, 405);
    }
    let body: { username?: string } = {};
    try {
      body = await req.json();
    } catch {
      /* empty */
    }
    const name = String(body.username || "Preview").trim() ||
      "Preview";
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
    // Directory? if any child paths
    const kids = wikiListPayload().filter(
      (p) =>
        p.path.startsWith(wpath + "/") &&
        p.path.slice(wpath.length + 1).indexOf("/") === -1,
    );
    if (kids.length && !page.body.trim()) {
      return json({
        path: wpath,
        title: page.title,
        type: "directory",
        children: kids,
      });
    }
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

  // Chargen probes — 404 so site.js skips
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

  // Fixture APIs
  if (path.startsWith("/api/")) {
    const api = await handleApi(path, req);
    if (api) return api;
    return json({ error: "not found" }, 404);
  }

  // Config for site.js
  if (
    path === "/site/config.json" ||
    path === "/config.json"
  ) {
    return json(siteConfigBody());
  }

  // Theme package files
  const themePrefix = `/site/theme/installed/${themeId}/`;
  if (path.startsWith(themePrefix)) {
    const rel = path.slice(themePrefix.length);
    const res = await fileResponse(themeDir, rel);
    if (res) return res;
    return new Response("Not found", { status: 404 });
  }

  // Public assets under /site/css /site/js
  if (path.startsWith("/site/")) {
    const sub = path.slice("/site/".length);
    // SPA shell routes
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

  // Apex SPA routes (site.js publicBase "" mode)
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
console.log(`Theme preview (live shell): ${themeId}`);
console.log(`  folder:   ${relative(SITE, themeDir) || themeDir}`);
console.log(`  gallery:  ${base}/site/`);
console.log(`  skin:     ${base}/site/theme/installed/${themeId}/site.css`);
console.log(`  fixtures: ${existsSync(fixturesDir) ? "yes" : "defaults"}`);
console.log(
  "  bar: Home · Wiki · Article · Help · Login · Guest/Player/Staff",
);
console.log("Edit site.css and hard-refresh (or Reload CSS). Ctrl+C stop.");

if (args.open) {
  const openCmd = Deno.build.os === "darwin"
    ? ["open", base + "/site/"]
    : Deno.build.os === "windows"
    ? ["cmd", "/c", "start", base + "/site/"]
    : ["xdg-open", base + "/site/"];
  try {
    new Deno.Command(openCmd[0], { args: openCmd.slice(1) }).spawn();
  } catch {
    /* ignore */
  }
}

await server.finished;
