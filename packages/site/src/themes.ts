/**
 * FE theme registry + install from zip (Court-style packages).
 *
 * Zip layout (Court is the reference):
 *
 *   my-theme/
 *     theme.json       required
 *     site.css         required (or css field in manifest)
 *     imgs/…           optional art
 *     fonts/…          optional
 *
 * theme.json:
 *   {
 *     "id": "court",
 *     "label": "Court of Miracles",
 *     "version": "1.0.0",
 *     "css": "site.css",
 *     "bannerImage": "imgs/header.png",
 *     "title": "Court of Miracles",
 *     "plainBg": false
 *   }
 *
 * Installed under game `theme/installed/<id>/` and served via
 * plugins.site.themeDir → /site/theme/installed/<id>/…
 */

import {
  basename,
  dirname,
  fromFileUrl,
  join,
  normalize,
  relative,
} from "@std/path";
import { unzipSync } from "npm:fflate@0.8.2";

export type SiteThemeManifest = {
  id: string;
  label: string;
  version?: string;
  /** Relative path to main CSS inside the package */
  css?: string;
  /** Relative path to banner image */
  bannerImage?: string;
  /** Relative path to nav logo image */
  logoImage?: string;
  title?: string;
  plainBg?: boolean;
  description?: string;
  /** Builtin | installed | registered */
  source?: "builtin" | "installed" | "registered";
  /** Resolved CSS href for the browser */
  skinCss?: string;
  /** Resolved banner href */
  bannerHref?: string;
  /** Resolved logo href */
  logoHref?: string;
};

const ID_RE = /^[a-z][a-z0-9_-]{0,39}$/;
const ALLOWED_EXT = new Set([
  ".css",
  ".json",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".svg",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".md",
  ".txt",
]);

const MAX_ZIP_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 250;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

const _registered = new Map<string, SiteThemeManifest>();

function isNonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function isThemeId(id: string): boolean {
  return ID_RE.test(id.trim().toLowerCase());
}

/** Runtime register (plugins) — does not write disk. */
export function registerSiteTheme(
  theme: SiteThemeManifest,
): boolean {
  if (!isNonEmpty(theme.id) || !isThemeId(theme.id)) return false;
  if (!isNonEmpty(theme.label)) return false;
  const id = theme.id.trim().toLowerCase();
  const css = (theme.css ?? theme.skinCss ?? "").trim();
  if (!css && theme.source !== "builtin") {
    // registered themes should point at a CSS URL
    if (!isNonEmpty(theme.skinCss)) return false;
  }
  _registered.set(id, {
    ...theme,
    id,
    label: theme.label.trim(),
    source: theme.source ?? "registered",
    skinCss: theme.skinCss?.trim() || undefined,
    bannerHref: theme.bannerHref?.trim() ||
      theme.bannerImage?.trim() ||
      undefined,
    logoHref: theme.logoHref?.trim() ||
      theme.logoImage?.trim() ||
      undefined,
  });
  return true;
}

export function unregisterSiteTheme(id: string): void {
  _registered.delete(id.trim().toLowerCase());
}

export function clearRegisteredThemes(): void {
  _registered.clear();
}

export function listRegisteredThemes(): SiteThemeManifest[] {
  return [..._registered.values()].sort((a, b) =>
    a.id.localeCompare(b.id)
  );
}

export function installedThemesRoot(cwd: string = Deno.cwd()): string {
  return join(cwd, "theme", "installed");
}

function safeRelPath(name: string): string | null {
  const n = name.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!n || n.includes("\0")) return null;
  if (n.endsWith("/")) return null; // directory entry
  if (n.split("/").some((p) => p === ".." || p === "." || !p)) {
    return null;
  }
  const base = basename(n);
  if (base.startsWith(".")) return null;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return null;
  const ext = base.slice(dot).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) return null;
  return n;
}

function stripZipRoot(
  files: Record<string, Uint8Array>,
): Record<string, Uint8Array> {
  const keys = Object.keys(files).filter((k) => !k.endsWith("/"));
  if (!keys.length) return files;
  const first = keys[0]!.split("/")[0]!;
  const allPrefixed = keys.every((k) =>
    k === first || k.startsWith(first + "/")
  );
  // Only strip if root folder and theme.json is inside it
  const hasManifest = keys.some((k) =>
    k === `${first}/theme.json` || k.endsWith("/theme.json") ||
    k === "theme.json"
  );
  if (
    allPrefixed && hasManifest && keys.some((k) =>
      k.startsWith(first + "/")
    )
  ) {
    const out: Record<string, Uint8Array> = {};
    for (const [k, v] of Object.entries(files)) {
      if (k === first || k === first + "/") continue;
      if (k.startsWith(first + "/")) {
        out[k.slice(first.length + 1)] = v;
      }
    }
    return out;
  }
  return files;
}

function parseManifest(raw: Uint8Array): SiteThemeManifest {
  const text = new TextDecoder().decode(raw);
  const j = JSON.parse(text) as Record<string, unknown>;
  const id = String(j.id ?? "").trim().toLowerCase();
  if (!isThemeId(id)) {
    throw new Error(
      "theme.json: id required (letter start, a-z0-9_-)",
    );
  }
  const label = String(j.label ?? id).trim() || id;
  const css = String(j.css ?? "site.css").trim() || "site.css";
  return {
    id,
    label,
    version: typeof j.version === "string" ? j.version.trim() : "1.0.0",
    css,
    bannerImage: typeof j.bannerImage === "string"
      ? j.bannerImage.trim()
      : undefined,
    logoImage: typeof j.logoImage === "string"
      ? j.logoImage.trim()
      : undefined,
    title: typeof j.title === "string" ? j.title.trim() : undefined,
    plainBg: j.plainBg === true,
    description: typeof j.description === "string"
      ? j.description.trim()
      : undefined,
    source: "installed",
  };
}

export type InstallThemeResult = {
  ok: true;
  theme: SiteThemeManifest;
  path: string;
} | {
  ok: false;
  error: string;
};

/**
 * Make relative url(...) in theme CSS absolute under
 * /site/theme/installed/<id>/. Needed because vars like
 * --site-bg-image-top are consumed from layout.css
 * (/site/css/), and browsers resolve relative urls at use
 * time against that sheet — not the theme file.
 */
export function rewriteThemeCssUrls(
  css: string,
  themeId: string,
  cssRelPath: string,
): string {
  const id = themeId.trim().toLowerCase();
  if (!isThemeId(id)) return css;
  const dir = cssRelPath.includes("/")
    ? cssRelPath.replace(/\/[^/]+$/, "/")
    : "";
  const base = `/site/theme/installed/${id}/${dir}`;
  return css.replace(
    /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi,
    (full, quote: string, raw: string) => {
      const u = String(raw).trim();
      if (
        !u ||
        u.startsWith("data:") ||
        u.startsWith("http://") ||
        u.startsWith("https://") ||
        u.startsWith("//") ||
        u.startsWith("/") ||
        u.startsWith("var(")
      ) {
        return full;
      }
      // Drop ./ and collapse simple segments (no ..)
      const cleaned = u.replace(/^\.\//, "");
      if (
        cleaned.includes("..") || cleaned.includes("\\") ||
        cleaned.includes("\0")
      ) {
        return full;
      }
      const q = quote || '"';
      return `url(${q}${base}${cleaned}${q})`;
    },
  );
}

/**
 * Install a Court-style theme zip into theme/installed/<id>/.
 */
export async function installThemeZip(
  zipBytes: Uint8Array,
  opts: { cwd?: string; activate?: boolean } = {},
): Promise<InstallThemeResult> {
  if (zipBytes.byteLength > MAX_ZIP_BYTES) {
    return { ok: false, error: "Zip too large (max 20MB)" };
  }
  if (zipBytes.byteLength < 22) {
    return { ok: false, error: "Not a valid zip" };
  }

  let unpacked: Record<string, Uint8Array>;
  try {
    unpacked = unzipSync(zipBytes) as Record<string, Uint8Array>;
  } catch (e: unknown) {
    return {
      ok: false,
      error: `Invalid zip: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  unpacked = stripZipRoot(unpacked);
  const entries = Object.entries(unpacked).filter(([k]) =>
    !k.endsWith("/")
  );
  if (entries.length > MAX_FILES) {
    return { ok: false, error: `Too many files (max ${MAX_FILES})` };
  }

  const safeFiles: Record<string, Uint8Array> = {};
  for (const [name, data] of entries) {
    const rel = safeRelPath(name);
    if (!rel) {
      return {
        ok: false,
        error: `Disallowed path or type: ${name}`,
      };
    }
    if (data.byteLength > MAX_FILE_BYTES) {
      return { ok: false, error: `File too large: ${rel}` };
    }
    safeFiles[rel] = data;
  }

  const manBytes = safeFiles["theme.json"];
  if (!manBytes) {
    return {
      ok: false,
      error: "theme.json missing (see Court theme package format)",
    };
  }

  let manifest: SiteThemeManifest;
  try {
    manifest = parseManifest(manBytes);
  } catch (e: unknown) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const cssName = (manifest.css ?? "site.css").replace(/^\/+/, "");
  if (!safeFiles[cssName]) {
    return {
      ok: false,
      error: `CSS file missing: ${cssName}`,
    };
  }

  const cwd = opts.cwd ?? Deno.cwd();
  const dest = join(installedThemesRoot(cwd), manifest.id);

  // Wipe previous install of same id
  try {
    await Deno.remove(dest, { recursive: true });
  } catch {
    /* none */
  }
  await Deno.mkdir(dest, { recursive: true });

  for (const [rel, data] of Object.entries(safeFiles)) {
    const out = join(dest, ...rel.split("/"));
    await Deno.mkdir(dirname(out), { recursive: true });
    // CSS custom-property url() resolves against the *using*
    // sheet (layout.css under /site/css/). Rewrite relative
    // asset urls to absolute /site/theme/installed/<id>/…
    if (rel.toLowerCase().endsWith(".css")) {
      const text = new TextDecoder().decode(data);
      const fixed = rewriteThemeCssUrls(text, manifest.id, rel);
      await Deno.writeTextFile(out, fixed);
    } else {
      await Deno.writeFile(out, data);
    }
  }

  const skinCss = `/site/theme/installed/${manifest.id}/${cssName}`;
  let bannerHref: string | undefined;
  if (manifest.bannerImage) {
    const b = manifest.bannerImage.replace(/^\/+/, "");
    if (safeFiles[b]) {
      bannerHref = `/site/theme/installed/${manifest.id}/${b}`;
    }
  }
  let logoHref: string | undefined;
  if (manifest.logoImage) {
    const l = manifest.logoImage.replace(/^\/+/, "");
    if (safeFiles[l]) {
      logoHref = `/site/theme/installed/${manifest.id}/${l}`;
    }
  }

  const installed: SiteThemeManifest = {
    ...manifest,
    source: "installed",
    skinCss,
    bannerHref,
    logoHref,
    css: cssName,
  };
  registerSiteTheme(installed);

  return { ok: true, theme: installed, path: dest };
}

/** Scan theme/installed/* for theme.json packages. */
export async function scanInstalledThemes(
  cwd: string = Deno.cwd(),
): Promise<SiteThemeManifest[]> {
  const root = installedThemesRoot(cwd);
  const out: SiteThemeManifest[] = [];
  try {
    for await (const e of Deno.readDir(root)) {
      if (!e.isDirectory || !isThemeId(e.name)) continue;
      const manPath = join(root, e.name, "theme.json");
      try {
        const raw = await Deno.readFile(manPath);
        const m = parseManifest(raw);
        const cssName = (m.css ?? "site.css").replace(/^\/+/, "");
        const skinCss =
          `/site/theme/installed/${m.id}/${cssName}`;
        let bannerHref: string | undefined;
        if (m.bannerImage) {
          const b = m.bannerImage.replace(/^\/+/, "");
          bannerHref =
            `/site/theme/installed/${m.id}/${b}`;
        }
        let logoHref: string | undefined;
        if (m.logoImage) {
          const l = m.logoImage.replace(/^\/+/, "");
          logoHref =
            `/site/theme/installed/${m.id}/${l}`;
        }
        const full: SiteThemeManifest = {
          ...m,
          source: "installed",
          skinCss,
          bannerHref,
          logoHref,
        };
        out.push(full);
        registerSiteTheme(full);
      } catch {
        /* skip broken */
      }
    }
  } catch {
    /* no dir */
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export type ThemeListItem = SiteThemeManifest & {
  active?: boolean;
};

/** Builtin skins as theme list entries (neutral only — no game brands). */
export async function listBuiltinThemeEntries(): Promise<
  SiteThemeManifest[]
> {
  const { listBuiltinSkins, skinCssHref } = await import("./skins.ts");
  const names = await listBuiltinSkins();
  return names.map((id) => {
    return {
      id,
      label: id === "default" ? "Default (violet night)" : id,
      source: "builtin" as const,
      skinCss: skinCssHref(id),
    };
  });
}

export async function listAllThemes(
  cwd: string = Deno.cwd(),
): Promise<SiteThemeManifest[]> {
  await scanInstalledThemes(cwd);
  const builtin = await listBuiltinThemeEntries();
  const byId = new Map<string, SiteThemeManifest>();
  for (const t of builtin) byId.set(t.id, t);
  for (const t of listRegisteredThemes()) byId.set(t.id, t);
  return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Apply a theme id to site config object (mutates / returns patch fields).
 */
export function themeToSiteConfig(
  theme: SiteThemeManifest,
): {
  skin?: string;
  skinCss?: string;
  bannerImage?: string;
  logoImage?: string;
  title?: string;
  plainBg?: boolean;
  themeDir?: string;
} {
  if (theme.source === "builtin") {
    return {
      skin: theme.id,
      skinCss: "",
      bannerImage: theme.bannerHref ?? "",
      logoImage: theme.logoHref ?? "",
      title: theme.title,
      plainBg: theme.plainBg,
    };
  }
  return {
    skin: theme.id,
    skinCss: theme.skinCss ?? "",
    bannerImage: theme.bannerHref ?? "",
    logoImage: theme.logoHref ?? "",
    title: theme.title,
    plainBg: theme.plainBg,
    themeDir: "theme",
  };
}

/** Court example package path inside @ursamu/site (for pack script). */
export function courtExampleRoot(): string {
  return fromFileUrl(
    new URL("../examples/themes/court/", import.meta.url),
  );
}
