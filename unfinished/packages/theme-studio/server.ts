/**
 * UrsaMU Theme Studio — GrapesJS + live preview + theme workspace (P2).
 *
 *   deno task start
 *   deno task dev
 *   deno run -A server.ts --theme ../web-template --open
 *
 * /              → Grapes studio UI
 * /site/         → live site.js preview (draft skin)
 * /api/*         → catalog, draft, import, export, save, assets
 * /shell/*       → @ursamu/site public (canvas)
 */

import {
  basename,
  dirname,
  extname,
  join,
  normalize,
  resolve,
} from "@std/path";
import { ensureDir, existsSync } from "@std/fs";
import { parseArgs } from "@std/cli/parse-args";
import { packageRoot, resolveShell } from "./src/shell.ts";
import {
  CANVAS_LAYOUTS,
  canvasShellHtml,
  isCanvasLayout,
  type CanvasLayout,
} from "./src/canvas-html.ts";
import {
  defaultTokenMap,
  parseRootTokens,
  stripRootBlock,
  TOKEN_CATALOG,
  tokensToCss,
  warmTokenCatalog,
} from "./src/tokens.ts";
import {
  buildSiteCss,
  packThemeZip,
  prepareExportPayload,
  type ExportPayload,
} from "./src/export-theme.ts";
import { loadSpecBundle, SPEC_VERSION } from "./src/spec-data.ts";
import {
  filterCssExtras,
  validateDraft,
} from "./src/validate.ts";
import { loadSelectorsFile } from "./src/spec-data.ts";
import { loadPresets, getPreset, applyPresetTokens } from "./src/presets.ts";
import { checkContrast } from "./src/contrast.ts";
import {
  importThemeCss,
  importThemeZip,
  loadThemeDirectory,
  saveThemeDirectory,
  type ImportedTheme,
} from "./src/import-theme.ts";
import {
  liveConfigJson,
  liveHelpIndex,
  liveHelpTopic,
  liveWikiList,
  liveWikiPage,
} from "./src/live-preview.ts";

const PKG = packageRoot();
const PUBLIC_STUDIO = join(PKG, "public");
const DRAFT_DIR = join(PKG, ".draft");
const ASSETS_DIR = join(DRAFT_DIR, "assets");
const DEFAULT_PORT = 4300;

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
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".map": "application/json",
};

const args = parseArgs(Deno.args, {
  string: ["port", "host", "shell", "ref", "theme"],
  boolean: ["help", "open", "refresh-shell"],
  alias: { h: "help", p: "port", o: "open", t: "theme" },
  default: { host: "127.0.0.1", open: false, ref: "main" },
});

if (args.help) {
  console.log(`UrsaMU Theme Studio

  deno task dev
  deno run -A server.ts [options]

Options:
  --theme, -t <dir>   Open theme package folder (theme.json + site.css)
  --port, -p          Port (default ${DEFAULT_PORT})
  --open, -o          Open browser
  --shell <dir>       @ursamu/site public/
  --refresh-shell     Re-download shell cache

  /         GrapesJS studio
  /site/    Live site.js preview
`);
  Deno.exit(0);
}

const shell = await resolveShell({
  shell: args.shell ? String(args.shell) : undefined,
  ref: String(args.ref || "main"),
  refresh: args["refresh-shell"] === true,
});

const port = Number(args.port ?? DEFAULT_PORT) || DEFAULT_PORT;
const host = String(args.host ?? "127.0.0.1");

/** When set, Save writes back to this package folder. */
let themeWorkspace: string | null = args.theme
  ? resolve(String(args.theme))
  : null;

await ensureDir(ASSETS_DIR);
await ensureDir(join(ASSETS_DIR, "fonts"));
await ensureDir(join(ASSETS_DIR, "imgs"));
await warmTokenCatalog();

// ── draft state ────────────────────────────────────────────────────

let draftCss = tokensToCss(defaultTokenMap(), "");

type DraftMeta = {
  id: string;
  label: string;
  title: string;
  plainBg: boolean;
  bannerImage?: string;
};

let draftMeta: DraftMeta = {
  id: "my-theme",
  label: "My Theme",
  title: "My Game",
  plainBg: true,
};

/** path → bytes for export */
const draftAssets = new Map<string, Uint8Array>();

/** fonts/<file> → CSS family name from last upload / @font-face */
const fontFamilies = new Map<string, string>();

const FONT_EXTS = new Set(["woff2", "woff", "ttf", "otf"]);

function isFontExt(ext: string): boolean {
  return FONT_EXTS.has(ext.toLowerCase().replace(/^\./, ""));
}

function familyFromFilename(base: string): string {
  return base
    .replace(/\.(woff2?|ttf|otf)$/i, "")
    .replace(/-?webfont$/i, "")
    .replace(/-?VariableFont.*$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || "CustomFont";
}

function fontFormat(ext: string): string {
  const e = ext.toLowerCase().replace(/^\./, "");
  if (e === "woff2") return "woff2";
  if (e === "woff") return "woff";
  if (e === "ttf") return "truetype";
  if (e === "otf") return "opentype";
  return e;
}

function parseFontFacesFromCss(css: string): void {
  const re =
    /@font-face\s*\{([\s\S]*?)\}/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    const block = m[1];
    const fam = block.match(
      /font-family\s*:\s*["']?([^"';}]+)["']?/i,
    )?.[1]?.trim();
    const src = block.match(
      /url\(\s*["']?([^"')]+)["']?\s*\)/i,
    )?.[1]?.trim();
    if (!fam || !src) continue;
    const pathMatch = src.match(
      /(?:\/draft\/assets\/|\/site\/theme\/[^/]+\/)?(fonts\/[^?#]+)/i,
    );
    if (pathMatch) {
      fontFamilies.set(pathMatch[1], fam.replace(/['"]/g, ""));
    }
  }
}

function ensureFontFace(
  rel: string,
  family: string,
  ext: string,
): string {
  const draftUrl = `/draft/assets/${rel}`;
  const face = [
    "@font-face {",
    `  font-family: "${family}";`,
    `  src: url("${draftUrl}") format("${fontFormat(ext)}");`,
    "  font-weight: 100 900;",
    "  font-style: normal;",
    "  font-display: swap;",
    "}",
  ].join("\n");
  const tokens = parseRootTokens(draftCss);
  let extras = stripRootBlock(draftCss);
  const faceRe = new RegExp(
    `@font-face\\s*\\{[^}]*url\\(["']?${
      draftUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    }["']?[^}]*\\}`,
    "gi",
  );
  if (faceRe.test(extras)) {
    extras = extras.replace(faceRe, face);
  } else if (
    !new RegExp(
      `@font-face\\s*\\{[^}]*font-family:\\s*["']?${
        family.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      }["']?[^}]*url\\([^)]*${
        rel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      }`,
      "i",
    ).test(extras)
  ) {
    extras = (extras.trim() ? extras.trim() + "\n\n" : "") + face;
  }
  draftCss = tokensToCss(tokens, extras);
  return face;
}

async function walkAssetFiles(
  dir: string,
  prefix = "",
): Promise<Array<{ rel: string; abs: string }>> {
  const out: Array<{ rel: string; abs: string }> = [];
  try {
    for await (const e of Deno.readDir(dir)) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      const abs = join(dir, e.name);
      if (e.isDirectory) {
        out.push(...await walkAssetFiles(abs, rel));
      } else if (e.isFile) {
        out.push({ rel: rel.replace(/\\/g, "/"), abs });
      }
    }
  } catch { /* missing dir */ }
  return out;
}

async function clearAssetsDir(): Promise<void> {
  const files = await walkAssetFiles(ASSETS_DIR);
  for (const f of files) {
    try {
      await Deno.remove(f.abs);
    } catch { /* ignore */ }
  }
  draftAssets.clear();
  fontFamilies.clear();
}

async function loadDraftFromDisk(): Promise<void> {
  const cssPath = join(DRAFT_DIR, "site.css");
  const metaPath = join(DRAFT_DIR, "meta.json");
  try {
    if (existsSync(cssPath)) {
      draftCss = await Deno.readTextFile(cssPath);
    }
  } catch { /* ignore */ }
  try {
    if (existsSync(metaPath)) {
      const raw = JSON.parse(await Deno.readTextFile(metaPath));
      draftMeta = {
        id: String(raw.id || draftMeta.id),
        label: String(raw.label || draftMeta.label),
        title: String(raw.title || draftMeta.title),
        plainBg: raw.plainBg !== false,
        bannerImage: raw.bannerImage
          ? String(raw.bannerImage)
          : undefined,
      };
    }
  } catch { /* ignore */ }

  parseFontFacesFromCss(draftCss);
  draftAssets.clear();
  const files = await walkAssetFiles(ASSETS_DIR);
  let cssDirty = false;

  for (const f of files) {
    let rel = f.rel;
    const ext = extname(rel).toLowerCase().replace(/^\./, "");
    let bytes: Uint8Array;
    try {
      bytes = await Deno.readFile(f.abs);
    } catch {
      continue;
    }

    // Migrate font files wrongly stored under imgs/
    if (rel.startsWith("imgs/") && isFontExt(ext)) {
      const base = basename(rel);
      const newRel = `fonts/${base}`;
      const dest = safeJoin(ASSETS_DIR, newRel);
      if (dest) {
        await ensureDir(dirname(dest));
        await Deno.writeFile(dest, bytes);
        try {
          await Deno.remove(f.abs);
        } catch { /* ignore */ }
        rel = newRel;
        cssDirty = true;
      }
    }

    if (!rel.startsWith("imgs/") && !rel.startsWith("fonts/")) {
      continue;
    }

    draftAssets.set(rel, bytes);

    if (rel.startsWith("fonts/")) {
      let fam = fontFamilies.get(rel);
      if (!fam) {
        fam = familyFromFilename(basename(rel));
        fontFamilies.set(rel, fam);
        ensureFontFace(rel, fam, ext);
        cssDirty = true;
      }
    }
  }

  if (cssDirty) await persistDraftCss();
}

function listAssetsPayload() {
  // Split accidental shared family names across unrelated files
  const fontPaths = [...draftAssets.keys()]
    .filter((p) => p.startsWith("fonts/"))
    .sort();
  const famToPaths = new Map<string, string[]>();
  for (const path of fontPaths) {
    const fam = fontFamilies.get(path) ||
      familyFromFilename(basename(path));
    const k = fam.toLowerCase();
    if (!famToPaths.has(k)) famToPaths.set(k, []);
    famToPaths.get(k)!.push(path);
  }
  for (const paths of famToPaths.values()) {
    if (paths.length < 2) continue;
    const stems = new Set(
      paths.map((p) => familyFromFilename(basename(p)).toLowerCase()),
    );
    if (stems.size <= 1) continue;
    for (const p of paths) {
      const fixed = familyFromFilename(basename(p));
      fontFamilies.set(p, fixed);
    }
  }

  const assets = [...draftAssets.keys()].sort().map((path) => {
    const kind = path.startsWith("fonts/") ? "font" : "image";
    return {
      path,
      kind,
      fontFamily: kind === "font"
        ? (fontFamilies.get(path) ||
          familyFromFilename(basename(path)))
        : undefined,
    };
  });
  const fonts = assets
    .filter((a) => a.kind === "font")
    .map((a) => ({
      path: a.path,
      fontFamily: a.fontFamily || familyFromFilename(basename(a.path)),
    }));
  return {
    assets: assets.map((a) => a.path),
    items: assets,
    fonts,
    bannerImage: draftMeta.bannerImage ?? null,
  };
}

async function persistDraftCss() {
  try {
    await ensureDir(DRAFT_DIR);
    await Deno.writeTextFile(join(DRAFT_DIR, "site.css"), draftCss);
    await Deno.writeTextFile(
      join(DRAFT_DIR, "meta.json"),
      JSON.stringify(draftMeta, null, 2),
    );
  } catch { /* ignore */ }
}

await loadDraftFromDisk();
await persistDraftCss();

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

async function applyImported(imp: ImportedTheme): Promise<void> {
  draftMeta = {
    id: imp.manifest.id,
    label: imp.manifest.label,
    title: imp.manifest.title || imp.manifest.label,
    plainBg: imp.manifest.plainBg !== false,
    bannerImage: imp.manifest.bannerImage,
  };
  draftCss = imp.siteCss;
  draftAssets.clear();
  fontFamilies.clear();
  parseFontFacesFromCss(draftCss);
  await ensureDir(ASSETS_DIR);
  for (const [rel, data] of Object.entries(imp.assets)) {
    let path = rel;
    const ext = extname(path).toLowerCase().replace(/^\./, "");
    if (path.startsWith("imgs/") && isFontExt(ext)) {
      path = `fonts/${basename(path)}`;
    }
    draftAssets.set(path, data);
    if (path.startsWith("fonts/")) {
      if (!fontFamilies.has(path)) {
        const fam = familyFromFilename(basename(path));
        fontFamilies.set(path, fam);
        ensureFontFace(path, fam, ext);
      }
    }
    const out = safeJoin(ASSETS_DIR, path);
    if (out) {
      await ensureDir(dirname(out));
      await Deno.writeFile(out, data);
    }
  }
  await persistDraftCss();
}

if (themeWorkspace) {
  if (!existsSync(join(themeWorkspace, "theme.json"))) {
    console.error(`--theme missing theme.json: ${themeWorkspace}`);
    Deno.exit(1);
  }
  try {
    const imp = await loadThemeDirectory(themeWorkspace);
    await applyImported(imp);
    console.log(
      `Theme workspace: ${themeWorkspace} (${draftMeta.id})`,
    );
  } catch (e: unknown) {
    console.error("Failed to load --theme:", e);
    Deno.exit(1);
  }
}

async function fileResponse(
  root: string,
  rel: string,
): Promise<Response | null> {
  const file = safeJoin(root, rel);
  if (!file || !existsSync(file)) return null;
  try {
    const bytes = await Deno.readFile(file);
    const ext = extname(file).toLowerCase();
    return new Response(bytes.slice(), {
      headers: {
        "content-type": MIME[ext] ?? "application/octet-stream",
        "cache-control": "no-store",
        // Fonts must load inside Grapes about:blank canvas
        "access-control-allow-origin": "*",
      },
    });
  } catch {
    return null;
  }
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function b64ToU8(b64: string): Uint8Array {
  const bin = atob(b64.replace(/^data:[^;]+;base64,/, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function liveShellHtml(): Promise<string> {
  const raw = await Deno.readTextFile(join(shell.dir, "index.html"));
  let html = raw;
  const title = draftMeta.title || "Theme preview";
  const id = draftMeta.id || "draft";

  html = html.replace(/data-skin="[^"]*"/, `data-skin="${id}"`);
  html = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${title.replace(/</g, "")} · live preview</title>`,
  );
  html = html.replace(
    /href="\/site\/css\/skins\/default\.css[^"]*"/,
    'href="/api/draft.css"',
  );

  if (!/data-site-config=/.test(html)) {
    html = html.replace(
      "<html ",
      `<html data-site-config="/site/config.json" `,
    );
  }

  if (draftMeta.plainBg) {
    html = html.replace(
      'class="site-shell"',
      'class="site-shell is-plain"',
    );
  }

  const bridge = `
<script>
(function () {
  function applyCss(css) {
    var el = document.getElementById("ursamu-live-draft");
    if (!el) {
      el = document.createElement("style");
      el.id = "ursamu-live-draft";
      document.head.appendChild(el);
    }
    el.textContent = css || "";
    var skin = document.querySelector("[data-site-skin]");
    if (skin) {
      try {
        var u = new URL(skin.getAttribute("href") || "/api/draft.css",
          location.href);
        u.searchParams.set("t", String(Date.now()));
        skin.setAttribute("href", u.pathname + u.search);
      } catch (e) {}
    }
  }
  function applyMeta(meta) {
    if (!meta || typeof meta !== "object") return;
    var title = String(meta.title || "").trim();
    var label = String(meta.label || title || "").trim();
    var brandName = label || title || "UrsaMU";
    if (title) {
      try { document.title = title + " · live preview"; } catch (e) {}
    }
    var brand = document.querySelector("[data-site-brand]");
    if (brand && !brand.querySelector("img")) {
      brand.textContent = brandName;
    }
    var bannerTitle = document.querySelector("[data-site-banner-title]");
    if (bannerTitle && title) {
      bannerTitle.textContent = title;
      bannerTitle.hidden = false;
      bannerTitle.removeAttribute("hidden");
    }
    // Keep site.js config object in sync if present
    try {
      if (window.siteConfig) {
        window.siteConfig.title = title || window.siteConfig.title;
      }
    } catch (e) {}
  }
  window.addEventListener("message", function (ev) {
    var d = ev.data;
    if (!d || typeof d !== "object") return;
    if (d.type === "ursamu-theme-draft" && typeof d.css === "string") {
      applyCss(d.css);
    }
    if (d.type === "ursamu-theme-meta") {
      applyMeta(d.meta || d);
    }
  });
  try { parent.postMessage({ type: "ursamu-theme-ready" }, "*"); }
  catch (e) {}
})();
</script>`;
  html = html.replace("</body>", `${bridge}\n  </body>`);
  return html;
}

// ── API handlers ───────────────────────────────────────────────────

async function handleApi(
  path: string,
  req: Request,
): Promise<Response | null> {
  if (path === "/api/spec") {
    const bundle = await loadSpecBundle();
    const presets = await loadPresets();
    return json({ ...bundle, presets });
  }

  if (path === "/api/presets") {
    const presets = await loadPresets();
    return json(presets);
  }

  if (path === "/api/contrast" && req.method === "POST") {
    try {
      const body = await req.json() as { tokens?: Record<string, string> };
      const tokens = body.tokens ?? parseRootTokens(draftCss);
      return json({
        results: checkContrast(tokens),
        specVersion: SPEC_VERSION,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return json({ error: msg }, 400);
    }
  }

  if (path === "/api/preset" && req.method === "POST") {
    try {
      const body = await req.json() as {
        id?: string;
        /** which slot to fill: active | light | dark | both-pair */
        target?: string;
      };
      const id = String(body.id || "").trim();
      const preset = await getPreset(id);
      if (!preset) return json({ error: `Unknown preset: ${id}` }, 404);
      const base = defaultTokenMap();
      const tokens = applyPresetTokens(base, preset);
      let tokensLight: Record<string, string> | undefined;
      let tokensDark: Record<string, string> | undefined;
      if (body.target === "both-pair" && preset.pair) {
        const pair = await getPreset(preset.pair);
        if (preset.mode === "light") {
          tokensLight = tokens;
          tokensDark = pair
            ? applyPresetTokens(base, pair)
            : undefined;
        } else {
          tokensDark = tokens;
          tokensLight = pair
            ? applyPresetTokens(base, pair)
            : undefined;
        }
      } else if (preset.mode === "light") {
        tokensLight = tokens;
      } else {
        tokensDark = tokens;
      }
      draftCss = tokensToCss(tokens, "");
      await persistDraftCss();
      return json({
        ok: true,
        preset: { id: preset.id, label: preset.label, mode: preset.mode },
        tokens,
        tokensLight,
        tokensDark,
        contrast: checkContrast(tokens),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return json({ error: msg }, 400);
    }
  }

  if (path === "/api/catalog") {
    const presets = await loadPresets();
    return json({
      specVersion: SPEC_VERSION,
      tokens: TOKEN_CATALOG,
      presets: presets.presets.map((p) => ({
        id: p.id,
        label: p.label,
        description: p.description,
        mode: p.mode,
        pair: p.pair,
      })),
      meta: draftMeta,
      workspace: themeWorkspace
        ? {
          path: themeWorkspace,
          name: basename(themeWorkspace),
          writable: true,
        }
        : null,
    });
  }

  if (path === "/api/workspace") {
    return json({
      path: themeWorkspace,
      meta: draftMeta,
      writable: !!themeWorkspace,
    });
  }

  if (path === "/api/meta") {
    if (req.method === "POST") {
      const body = await req.json() as Partial<DraftMeta>;
      if (body.id) draftMeta.id = String(body.id).trim().toLowerCase();
      if (body.label != null) draftMeta.label = String(body.label);
      if (body.title != null) draftMeta.title = String(body.title);
      if (body.plainBg != null) draftMeta.plainBg = !!body.plainBg;
      if (body.bannerImage !== undefined) {
        draftMeta.bannerImage = body.bannerImage
          ? String(body.bannerImage)
          : undefined;
      }
      await persistDraftCss();
      return json({ ok: true, meta: draftMeta });
    }
    return json(draftMeta);
  }

  if (path === "/api/layouts") {
    return json({ layouts: CANVAS_LAYOUTS });
  }

  if (path === "/api/canvas-html") {
    const u = new URL(req.url);
    const title = u.searchParams.get("title") || draftMeta.title;
    const brand = u.searchParams.get("brand") || title;
    const layoutRaw = (u.searchParams.get("layout") || "home").trim();
    const layout: CanvasLayout = isCanvasLayout(layoutRaw)
      ? layoutRaw
      : "home";
    return new Response(
      canvasShellHtml({ title, brand, layout }),
      {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        },
      },
    );
  }

  if (path === "/api/draft.css") {
    if (req.method === "POST") {
      draftCss = await req.text();
      await persistDraftCss();
      return json({ ok: true, bytes: draftCss.length });
    }
    return new Response(draftCss || "/* empty */\n", {
      headers: {
        "content-type": "text/css; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  if (path === "/api/reset" && req.method === "POST") {
    draftMeta = {
      id: "my-theme",
      label: "My Theme",
      title: "My Game",
      plainBg: true,
    };
    draftCss = tokensToCss(defaultTokenMap(), "");
    await clearAssetsDir();
    await ensureDir(join(ASSETS_DIR, "fonts"));
    await ensureDir(join(ASSETS_DIR, "imgs"));
    await persistDraftCss();
    return json({
      ok: true,
      meta: draftMeta,
      tokens: defaultTokenMap(),
      cssExtras: "",
      specVersion: SPEC_VERSION,
      ...listAssetsPayload(),
    });
  }

  if (path === "/api/import" && req.method === "POST") {
    try {
      const ct = req.headers.get("content-type") || "";
      let raw: Uint8Array;
      if (ct.includes("multipart/form-data")) {
        const form = await req.formData();
        const file = form.get("file");
        if (!(file instanceof File)) {
          return json({ error: "file required" }, 400);
        }
        raw = new Uint8Array(await file.arrayBuffer());
      } else {
        raw = new Uint8Array(await req.arrayBuffer());
      }
      const imp = await importThemeZip(raw);
      await applyImported(imp);
      return json({
        ok: true,
        meta: draftMeta,
        tokens: imp.tokens,
        cssExtras: imp.cssExtras,
        assets: Object.keys(imp.assets),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return json({ error: msg }, 400);
    }
  }

  /** Import bare site.css (+ optional JSON manifest fields). */
  if (path === "/api/import-css" && req.method === "POST") {
    try {
      const ct = req.headers.get("content-type") || "";
      let cssText = "";
      let manifestPartial: Partial<ImportedTheme["manifest"]> = {
        id: draftMeta.id,
        label: draftMeta.label,
        title: draftMeta.title,
        plainBg: draftMeta.plainBg,
      };
      if (ct.includes("multipart/form-data")) {
        const form = await req.formData();
        const file = form.get("file");
        if (file instanceof File) {
          cssText = await file.text();
        } else if (typeof form.get("css") === "string") {
          cssText = String(form.get("css"));
        }
        const mj = form.get("manifest");
        if (typeof mj === "string" && mj.trim()) {
          try {
            manifestPartial = {
              ...manifestPartial,
              ...(JSON.parse(mj) as object),
            };
          } catch { /* ignore */ }
        }
      } else if (ct.includes("application/json")) {
        const body = await req.json() as {
          css?: string;
          manifest?: Partial<ImportedTheme["manifest"]>;
        };
        cssText = String(body.css ?? "");
        if (body.manifest) {
          manifestPartial = { ...manifestPartial, ...body.manifest };
        }
      } else {
        cssText = await req.text();
      }
      if (!cssText.trim()) {
        return json({ error: "css required" }, 400);
      }
      const imp = importThemeCss(cssText, {
        manifest: manifestPartial,
        fallbackId: draftMeta.id || "imported",
      });
      // keep existing assets when importing CSS only
      const keepAssets = { ...Object.fromEntries(draftAssets) };
      await applyImported({ ...imp, assets: keepAssets });
      return json({
        ok: true,
        meta: draftMeta,
        tokens: imp.tokens,
        cssExtras: imp.cssExtras,
        assets: [...draftAssets.keys()],
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return json({ error: msg }, 400);
    }
  }

  /** Save draft back to --theme package folder. */
  if (path === "/api/save-theme" && req.method === "POST") {
    if (!themeWorkspace) {
      return json({
        error: "No theme workspace. Start with --theme <dir>.",
      }, 400);
    }
    try {
      const body = await req.json().catch(() => ({})) as {
        manifest?: DraftMeta;
        tokens?: Record<string, string>;
        cssExtras?: string;
        siteCss?: string;
      };
      if (body.manifest) {
        draftMeta = {
          id: body.manifest.id || draftMeta.id,
          label: body.manifest.label || draftMeta.label,
          title: body.manifest.title || draftMeta.title,
          plainBg: body.manifest.plainBg !== false,
          bannerImage: body.manifest.bannerImage ??
            draftMeta.bannerImage,
        };
      }
      const tokens = body.tokens ?? parseRootTokens(draftCss);
      const extras = body.cssExtras ??
        draftCss.replace(/:root\s*\{[\s\S]*?\}\s*/, "");
      const assets: Record<string, Uint8Array> = {};
      for (const [k, v] of draftAssets) assets[k] = v;

      const bodyExt = body as {
        tokensLight?: Record<string, string>;
        tokensDark?: Record<string, string>;
        dual?: boolean;
      };
      const prepared = await prepareExportPayload({
        specVersion: SPEC_VERSION,
        manifest: {
          id: draftMeta.id,
          label: draftMeta.label,
          title: draftMeta.title,
          plainBg: draftMeta.plainBg,
          bannerImage: draftMeta.bannerImage,
          version: "0.1.0",
          description: "Edited with UrsaMU Theme Studio",
        },
        tokens,
        tokensLight: bodyExt.tokensLight,
        tokensDark: bodyExt.tokensDark,
        dual: bodyExt.dual === true,
        cssExtras: extras,
        siteCss: body.siteCss,
        assets,
      });
      const siteCss = buildSiteCss(prepared.payload);
      draftCss = siteCss;
      await persistDraftCss();

      await saveThemeDirectory(themeWorkspace, {
        manifest: prepared.payload.manifest,
        siteCss,
        assets,
      });
      return json({
        ok: true,
        path: themeWorkspace,
        id: draftMeta.id,
        warnings: prepared.warnings,
        contrast: checkContrast(tokens),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return json({ error: msg }, 400);
    }
  }

  /** Open another theme folder (dev / monorepo). */
  if (path === "/api/open-theme" && req.method === "POST") {
    try {
      const body = await req.json() as { path?: string };
      const dir = resolve(String(body.path ?? ""));
      if (!dir || !existsSync(join(dir, "theme.json"))) {
        return json({ error: "path must contain theme.json" }, 400);
      }
      const imp = await loadThemeDirectory(dir);
      await applyImported(imp);
      themeWorkspace = dir;
      return json({
        ok: true,
        workspace: { path: dir, name: basename(dir) },
        meta: draftMeta,
        tokens: imp.tokens,
        cssExtras: imp.cssExtras,
        assets: Object.keys(imp.assets),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return json({ error: msg }, 400);
    }
  }

  if (path === "/api/assets" && req.method === "GET") {
    return json(listAssetsPayload());
  }

  if (path === "/api/assets" && req.method === "POST") {
    try {
      const body = await req.json() as {
        path?: string;
        name?: string;
        dataBase64?: string;
        asBanner?: boolean;
        token?: string;
        /** "image" (default) | "font" — font also auto-detected by ext */
        kind?: string;
        /** CSS font-family name for @font-face */
        fontFamily?: string;
        fontWeight?: string;
        fontStyle?: string;
        /** When false, only register @font-face (no token bind) */
        bindTokens?: boolean;
      };
      const name = (body.path || body.name || "").replace(/^\/+/, "");
      if (!name || name.includes("..")) {
        return json({ error: "invalid path" }, 400);
      }
      if (!body.dataBase64) {
        return json({ error: "dataBase64 required" }, 400);
      }

      const baseName = name.includes("/")
        ? name.split("/").pop()!
        : name;
      const safeBase = baseName.replace(/[^\w.\-+]+/g, "_");
      const ext = (safeBase.match(/\.([a-z0-9]+)$/i)?.[1] || "")
        .toLowerCase();

      // Font by extension always wins (fixes image-uploader path)
      let kind = (body.kind || "image").toLowerCase();
      if (isFontExt(ext)) kind = "font";
      if (kind === "font" && !isFontExt(ext)) {
        return json({
          error: "Font must be .woff2, .woff, .ttf, or .otf",
        }, 400);
      }

      let rel: string;
      if (name.startsWith("fonts/") || name.startsWith("imgs/")) {
        rel = name.replace(/^\/+/, "");
        // Force fonts/* for font files even if client sent imgs/
        if (kind === "font" && rel.startsWith("imgs/")) {
          rel = `fonts/${basename(rel)}`;
        }
      } else if (kind === "font") {
        rel = `fonts/${safeBase}`;
      } else {
        rel = `imgs/${safeBase}`;
      }

      const pathIssue = (await import("./src/validate.ts"))
        .validateAssetPath(rel);
      if (pathIssue && pathIssue.level === "error") {
        return json({ error: pathIssue.message }, 400);
      }

      const data = b64ToU8(body.dataBase64);
      draftAssets.set(rel, data);
      const out = safeJoin(ASSETS_DIR, rel);
      if (out) {
        await ensureDir(dirname(out));
        await Deno.writeFile(out, data);
      }
      if (body.asBanner && kind !== "font") {
        draftMeta.bannerImage = rel;
      }

      let fontFamily = "";
      let fontFaceCss = "";
      const tokens = parseRootTokens(draftCss);
      let extras = stripRootBlock(draftCss);

      if (kind === "font") {
        fontFamily = String(body.fontFamily || "")
          .trim()
          .replace(/['"]/g, "");
        if (!fontFamily) {
          fontFamily = familyFromFilename(safeBase);
        }
        fontFamilies.set(rel, fontFamily);
        const weight = String(body.fontWeight || "100 900").trim();
        const style = String(body.fontStyle || "normal").trim();
        const draftUrl = `/draft/assets/${rel}`;
        fontFaceCss = [
          "@font-face {",
          `  font-family: "${fontFamily}";`,
          `  src: url("${draftUrl}") format("${fontFormat(ext)}");`,
          `  font-weight: ${weight};`,
          `  font-style: ${style};`,
          "  font-display: swap;",
          "}",
        ].join("\n");

        // Upsert by url (stable) then by family
        const urlRe = new RegExp(
          `@font-face\\s*\\{[^}]*url\\(["']?${
            draftUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
          }["']?[^}]*\\}`,
          "gi",
        );
        const faceRe = new RegExp(
          `@font-face\\s*\\{[^}]*font-family:\\s*["']?${
            fontFamily.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
          }["']?[^}]*\\}`,
          "gi",
        );
        if (urlRe.test(extras)) {
          extras = extras.replace(urlRe, fontFaceCss);
        } else if (faceRe.test(extras)) {
          extras = extras.replace(faceRe, fontFaceCss);
        } else {
          extras = (extras.trim() ? extras.trim() + "\n\n" : "") +
            fontFaceCss;
        }

        const stack =
          `"${fontFamily}", system-ui, -apple-system, sans-serif`;
        const tok = String(body.token || "").trim();
        // token "__none__" / empty with bindTokens:false = register only
        const bindTokens = tok !== "__none__" &&
          body.bindTokens !== false;
        if (tok.startsWith("--site-font")) {
          tokens[tok] = stack;
        } else if (bindTokens) {
          if (
            !tokens["--site-font-ui"] ||
            tokens["--site-font-ui"].includes("system-ui") ||
            tokens["--site-font-ui"].includes("Inter")
          ) {
            tokens["--site-font-ui"] = stack;
          }
          tokens["--site-font-display"] = stack;
        }
        draftCss = tokensToCss(tokens, extras);
      } else if (body.token && body.token.startsWith("--site-")) {
        const url = `url("/draft/assets/${rel}")`;
        tokens[body.token] = url;
        draftCss = tokensToCss(tokens, extras);
      }

      await persistDraftCss();
      return json({
        ok: true,
        path: rel,
        kind: kind === "font" ? "font" : "image",
        fontFamily: fontFamily || undefined,
        fontFaceCss: fontFaceCss || undefined,
        tokens: kind === "font" ? tokens : undefined,
        cssExtras: kind === "font" ? extras : undefined,
        ...listAssetsPayload(),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return json({ error: msg }, 400);
    }
  }

  if (path === "/api/export" && req.method === "POST") {
    try {
      const body = await req.json() as ExportPayload & {
        assetsBase64?: Record<string, string>;
      };
      const assets: Record<string, Uint8Array> = {};
      for (const [k, v] of draftAssets) assets[k] = v;
      if (body.assetsBase64) {
        for (const [k, b64] of Object.entries(body.assetsBase64)) {
          assets[k] = b64ToU8(b64);
        }
      }
      const rawPayload: ExportPayload = {
        specVersion: SPEC_VERSION,
        manifest: {
          ...body.manifest,
          bannerImage: body.manifest.bannerImage ??
            draftMeta.bannerImage,
        },
        tokens: body.tokens ?? {},
        tokensLight: body.tokensLight,
        tokensDark: body.tokensDark,
        dual: body.dual === true,
        cssExtras: body.cssExtras,
        siteCss: body.siteCss,
        assets,
      };
      const { payload, warnings } = await prepareExportPayload(
        rawPayload,
      );
      const { zip, filename } = packThemeZip(payload);
      return new Response(zip.slice(), {
        headers: {
          "content-type": "application/zip",
          "content-disposition":
            `attachment; filename="${filename}"`,
          "cache-control": "no-store",
          "x-ursamu-warnings": String(warnings.length),
        },
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return json({ error: msg }, 400);
    }
  }

  if (path === "/api/validate" && req.method === "POST") {
    try {
      const body = await req.json() as ExportPayload;
      const sel = await loadSelectorsFile();
      const filtered = filterCssExtras(body.cssExtras ?? "", sel);
      const v = await validateDraft({
        specVersion: body.specVersion ?? SPEC_VERSION,
        manifest: body.manifest,
        tokens: body.tokens ?? {},
        cssExtras: filtered.css,
        siteCss: body.siteCss,
      });
      return json({
        ok: v.ok,
        errors: v.errors,
        warnings: [
          ...v.warnings,
          ...filtered.dropped.map((d) => ({
            level: "warn",
            code: "cssExtras.filtered",
            message: `Would drop: ${d}`,
            path: "cssExtras",
          })),
        ],
        cssExtrasFiltered: filtered.css,
        specVersion: SPEC_VERSION,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return json({ ok: false, error: msg }, 400);
    }
  }

  // Live preview fixture APIs (site.js)
  if (path === "/api/v1/me") {
    return json({ error: "unauthorized" }, 401);
  }
  if (path === "/api/v1/login" || path === "/api/v1/register") {
    return json({ token: "preview-player", ok: true });
  }
  if (path === "/api/v1/wiki" || path === "/api/v1/wiki/") {
    return json(liveWikiList());
  }
  if (path.startsWith("/api/v1/wiki/")) {
    const w = decodeURIComponent(path.slice("/api/v1/wiki/".length))
      .replace(/^\/+|\/+$/g, "");
    const page = liveWikiPage(w);
    if (!page) return json({ error: "not found" }, 404);
    return json(page);
  }
  if (path === "/api/v1/help" || path === "/api/v1/help/") {
    return json(liveHelpIndex());
  }
  if (path.startsWith("/api/v1/help/")) {
    const t = decodeURIComponent(path.slice("/api/v1/help/".length))
      .replace(/^\/+|\/+$/g, "");
    const entry = liveHelpTopic(t);
    if (!entry) return json({ error: "not found" }, 404);
    return json(entry);
  }
  if (
    path.startsWith("/api/v1/dnd/") ||
    path.startsWith("/api/v1/cpr/") ||
    path.startsWith("/api/v1/cofd/")
  ) {
    return json({ error: "n/a" }, 404);
  }

  return null;
}

// ── main handler ───────────────────────────────────────────────────

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  let path = decodeURIComponent(url.pathname);

  if (path.startsWith("/api/")) {
    const api = await handleApi(path, req);
    if (api) return api;
    return json({ error: "not found" }, 404);
  }

  // Draft assets for CSS url() and banner
  if (path.startsWith("/draft/assets/")) {
    const rel = path.slice("/draft/assets/".length);
    const res = await fileResponse(ASSETS_DIR, rel);
    if (res) return res;
    // memory fallback
    const mem = draftAssets.get(rel);
    if (mem) {
      return new Response(mem.slice(), {
        headers: {
          "content-type": MIME[extname(rel).toLowerCase()] ??
            "application/octet-stream",
          "cache-control": "no-store",
          "access-control-allow-origin": "*",
        },
      });
    }
    return new Response("Not found", { status: 404 });
  }

  // Grapes canvas shell assets
  if (path.startsWith("/shell/")) {
    const rel = path.slice("/shell/".length);
    const res = await fileResponse(shell.dir, rel);
    if (res) return res;
    return new Response("Not found", { status: 404 });
  }

  // Live site.js preview under /site/
  if (path === "/site" || path.startsWith("/site/")) {
    const sub = path === "/site" ? "/" : path.slice("/site".length) || "/";

    if (sub === "/config.json") {
      return json(liveConfigJson({
        id: draftMeta.id,
        title: draftMeta.title,
        plainBg: draftMeta.plainBg,
        bannerImage: draftMeta.bannerImage,
      }));
    }

    // static from shell package
    if (
      sub.startsWith("/css/") ||
      sub.startsWith("/js/") ||
      sub.endsWith(".css") ||
      sub.endsWith(".js") ||
      sub.endsWith(".woff2")
    ) {
      const res = await fileResponse(shell.dir, sub.replace(/^\//, ""));
      if (res) return res;
    }

    // SPA shell for home/wiki/help/login
    if (
      sub === "/" ||
      sub === "/index.html" ||
      !extname(sub) ||
      sub.startsWith("/wiki") ||
      sub.startsWith("/help") ||
      sub.startsWith("/login") ||
      sub.startsWith("/profile")
    ) {
      const html = await liveShellHtml();
      return new Response(html, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }

    return new Response("Not found", { status: 404 });
  }

  // Studio UI
  if (path === "/" || path === "") path = "/index.html";
  const rel = path.replace(/^\/+/, "");
  const res = await fileResponse(PUBLIC_STUDIO, rel);
  if (res) return res;

  return new Response("Not found", { status: 404 });
}

const server = Deno.serve({ hostname: host, port }, handler);
const base = `http://${host}:${port}`;
console.log("UrsaMU Theme Studio · Phase 2");
console.log(`  studio:  ${base}/`);
console.log(`  live:    ${base}/site/`);
console.log(`  shell:   ${shell.source}`);
if (themeWorkspace) {
  console.log(`  theme:   ${themeWorkspace}`);
  console.log("  save:    enabled (writes theme.json + site.css)");
} else {
  console.log("  theme:   (none — export zip only; use --theme <dir>)");
}
console.log(
  "  features: workspace · live · Grapes · import/export · tokens",
);
console.log("Ctrl+C to stop.");

if (args.open) {
  const openCmd = Deno.build.os === "darwin"
    ? ["open", base + "/"]
    : Deno.build.os === "windows"
    ? ["cmd", "/c", "start", base + "/"]
    : ["xdg-open", base + "/"];
  try {
    new Deno.Command(openCmd[0], { args: openCmd.slice(1) }).spawn();
  } catch { /* ignore */ }
}

await server.finished;
