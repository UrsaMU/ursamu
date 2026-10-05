/**
 * Import Court-style theme zip, CSS, or on-disk package folder.
 */

import { basename, dirname, join } from "@std/path";
import { ensureDir, existsSync, walk } from "@std/fs";
import { unzipSync } from "fflate";
import {
  parseRootTokens,
  stripRootBlock,
  TOKEN_CATALOG,
  tokensToCss,
} from "./tokens.ts";
import type { ExportManifest } from "./export-theme.ts";
import { filterCssExtras } from "./validate.ts";
import { loadSelectorsFile } from "./spec-data.ts";

export type ImportedTheme = {
  manifest: ExportManifest;
  tokens: Record<string, string>;
  cssExtras: string;
  siteCss: string;
  /** relative path → bytes (imgs/, fonts/) */
  assets: Record<string, Uint8Array>;
};

function fillTokenDefaults(
  tokens: Record<string, string>,
): Record<string, string> {
  const out = { ...tokens };
  for (const def of TOKEN_CATALOG) {
    if (out[def.name] == null || out[def.name] === "") {
      out[def.name] = def.default;
    }
  }
  return out;
}

async function sanitizeExtras(css: string): Promise<string> {
  try {
    const sel = await loadSelectorsFile();
    return filterCssExtras(css, sel).css;
  } catch {
    return css;
  }
}

/** Rewrite install-path asset URLs to studio draft URLs. */
export function rewriteCssToDraftAssets(
  css: string,
  themeId?: string,
): string {
  let out = css;
  if (themeId) {
    const re = new RegExp(
      `/site/theme/installed/${themeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`,
      "g",
    );
    out = out.replace(re, "/draft/assets/");
  }
  out = out.replace(
    /\/site\/theme\/installed\/[a-z0-9_-]+\//gi,
    "/draft/assets/",
  );
  return out;
}

function manifestFromJson(
  j: Record<string, unknown>,
  fallbackId: string,
): ExportManifest {
  const idRaw = String(j.id ?? fallbackId).trim().toLowerCase();
  const id = /^[a-z][a-z0-9_-]{0,39}$/.test(idRaw) ? idRaw : fallbackId;
  return {
    id,
    label: String(j.label ?? id),
    version: typeof j.version === "string" ? j.version : "0.1.0",
    description: typeof j.description === "string"
      ? j.description
      : undefined,
    title: typeof j.title === "string"
      ? j.title
      : String(j.label ?? id),
    plainBg: j.plainBg === true,
    css: "site.css",
    bannerImage: typeof j.bannerImage === "string"
      ? j.bannerImage
      : undefined,
  };
}

/**
 * Best-effort import of a bare site.css (optional theme.json fields).
 */
export function importThemeCss(
  siteCssRaw: string,
  opts: {
    manifest?: Partial<ExportManifest>;
    fallbackId?: string;
  } = {},
): ImportedTheme {
  const fallbackId = opts.fallbackId ?? "imported";
  let siteCss = siteCssRaw;
  const tokens = fillTokenDefaults(parseRootTokens(siteCss));
  const cssExtras = stripRootBlock(siteCss);
  const id = opts.manifest?.id ?? fallbackId;
  siteCss = rewriteCssToDraftAssets(siteCss, id);

  const manifest: ExportManifest = {
    id: /^[a-z][a-z0-9_-]{0,39}$/.test(String(id))
      ? String(id)
      : "imported",
    label: opts.manifest?.label ?? String(id),
    version: opts.manifest?.version ?? "0.1.0",
    description: opts.manifest?.description,
    title: opts.manifest?.title ?? opts.manifest?.label ?? String(id),
    plainBg: opts.manifest?.plainBg !== false,
    css: "site.css",
    bannerImage: opts.manifest?.bannerImage,
  };

  // Re-parse tokens after URL rewrite
  const tokens2 = fillTokenDefaults(parseRootTokens(siteCss));
  const extras2 = stripRootBlock(siteCss);

  return {
    manifest,
    tokens: Object.keys(tokens2).length ? tokens2 : tokens,
    cssExtras: extras2 || cssExtras,
    siteCss: siteCss.includes(":root")
      ? siteCss
      : tokensToCss(tokens2, extras2),
    assets: {},
  };
}

function stripRootFolder(
  files: Record<string, Uint8Array>,
): Record<string, Uint8Array> {
  const keys = Object.keys(files).filter((k) => !k.endsWith("/"));
  if (!keys.length) return {};
  // Detect common prefix folder (id/)
  const first = keys[0].replace(/\\/g, "/");
  const slash = first.indexOf("/");
  if (slash < 1) return files;
  const prefix = first.slice(0, slash + 1);
  const allPrefixed = keys.every((k) =>
    k.replace(/\\/g, "/").startsWith(prefix) || !k.includes("/")
  );
  if (!allPrefixed) return files;
  const out: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(files)) {
    const norm = k.replace(/\\/g, "/");
    if (norm.endsWith("/")) continue;
    if (norm.startsWith(prefix)) {
      out[norm.slice(prefix.length)] = v;
    } else {
      out[norm] = v;
    }
  }
  return out;
}

function decode(u8: Uint8Array): string {
  return new TextDecoder().decode(u8);
}

export async function importThemeZip(
  raw: Uint8Array,
): Promise<ImportedTheme> {
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(raw) as Record<string, Uint8Array>;
  } catch {
    throw new Error("Invalid zip file");
  }

  const files = stripRootFolder(unzipped);
  const jsonEntry = files["theme.json"];
  if (!jsonEntry) {
    throw new Error("Zip missing theme.json");
  }

  let j: Record<string, unknown>;
  try {
    j = JSON.parse(decode(jsonEntry)) as Record<string, unknown>;
  } catch {
    throw new Error("theme.json is not valid JSON");
  }

  const id = String(j.id ?? "imported").trim().toLowerCase();
  const cssName = String(j.css ?? "site.css").replace(/^\/+/, "");
  const cssBytes = files[cssName] ?? files["site.css"];
  if (!cssBytes) {
    throw new Error(`Zip missing CSS (${cssName})`);
  }
  const idNorm = /^[a-z][a-z0-9_-]{0,39}$/.test(id) ? id : "imported";
  let siteCss = rewriteCssToDraftAssets(decode(cssBytes), idNorm);
  const tokens = fillTokenDefaults(parseRootTokens(siteCss));
  const cssExtras = await sanitizeExtras(stripRootBlock(siteCss));

  const assets: Record<string, Uint8Array> = {};
  for (const [path, data] of Object.entries(files)) {
    if (path === "theme.json" || path === cssName) continue;
    if (path === "site.css") continue;
    if (path.endsWith(".md") || path.endsWith(".txt")) continue;
    if (path.endsWith(".html")) continue;
    if (
      path.startsWith("imgs/") ||
      path.startsWith("fonts/") ||
      /\.(png|jpe?g|webp|gif|svg|woff2?|ttf|otf)$/i.test(path)
    ) {
      assets[path] = data;
    }
  }

  const manifest = manifestFromJson(j, idNorm);

  return { manifest, tokens, cssExtras, siteCss, assets };
}

/**
 * Load a theme package folder (theme.json + site.css + imgs/).
 */
export async function loadThemeDirectory(
  dir: string,
): Promise<ImportedTheme> {
  const themeJsonPath = join(dir, "theme.json");
  if (!existsSync(themeJsonPath)) {
    throw new Error(`Missing theme.json in ${dir}`);
  }
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(await Deno.readTextFile(themeJsonPath)) as Record<
      string,
      unknown
    >;
  } catch {
    throw new Error("theme.json is not valid JSON");
  }

  const fallbackId = basename(dir).toLowerCase().replace(
    /[^a-z0-9_-]/g,
    "-",
  ) || "theme";
  const manifest = manifestFromJson(j, fallbackId);
  const cssName = String(j.css ?? "site.css").replace(/^\/+/, "");
  const cssPath = join(dir, cssName);
  if (!existsSync(cssPath)) {
    throw new Error(`Missing ${cssName} in ${dir}`);
  }
  let siteCss = await Deno.readTextFile(cssPath);
  siteCss = rewriteCssToDraftAssets(siteCss, manifest.id);
  const tokens = fillTokenDefaults(parseRootTokens(siteCss));
  const cssExtras = await sanitizeExtras(stripRootBlock(siteCss));

  const assets: Record<string, Uint8Array> = {};
  for await (
    const e of walk(dir, {
      includeDirs: false,
      skip: [
        /\.git/,
        /\.preview-shell/,
        /\.theme-studio/,
        /\.draft/,
        /\.zip$/,
      ],
    })
  ) {
    const rel = e.path.slice(dir.length).replace(/^[/\\]+/, "").replace(
      /\\/g,
      "/",
    );
    if (
      rel === "theme.json" ||
      rel === cssName ||
      rel === "site.css" ||
      rel.endsWith(".md") ||
      rel.endsWith(".ts") ||
      rel.endsWith(".html") ||
      rel === "deno.json" ||
      rel === "deno.lock"
    ) {
      continue;
    }
    if (
      rel.startsWith("imgs/") ||
      rel.startsWith("fonts/") ||
      /\.(png|jpe?g|webp|gif|svg|woff2?|ttf|otf)$/i.test(rel)
    ) {
      assets[rel] = await Deno.readFile(e.path);
    }
  }

  return {
    manifest,
    tokens,
    cssExtras,
    siteCss,
    assets,
  };
}

/**
 * Write draft back to a theme package folder.
 */
export async function saveThemeDirectory(
  dir: string,
  imp: {
    manifest: ExportManifest;
    siteCss: string;
    assets: Record<string, Uint8Array>;
  },
): Promise<void> {
  await ensureDir(dir);
  const m = {
    id: imp.manifest.id,
    label: imp.manifest.label,
    version: imp.manifest.version ?? "0.1.0",
    description: imp.manifest.description ??
      "Edited with UrsaMU Theme Studio",
    css: "site.css",
    title: imp.manifest.title ?? imp.manifest.label,
    plainBg: imp.manifest.plainBg !== false,
    ...(imp.manifest.bannerImage
      ? { bannerImage: imp.manifest.bannerImage }
      : {}),
  };
  // Install-path URLs for on-disk package
  const css = imp.siteCss.replaceAll(
    "/draft/assets/",
    `/site/theme/installed/${m.id}/`,
  );
  await Deno.writeTextFile(
    join(dir, "theme.json"),
    JSON.stringify(m, null, 2) + "\n",
  );
  await Deno.writeTextFile(
    join(dir, "site.css"),
    css.endsWith("\n") ? css : css + "\n",
  );

  for (const [rel, data] of Object.entries(imp.assets)) {
    const clean = rel.replace(/^\/+/, "").replace(/\\/g, "/");
    if (!clean || clean.includes("..")) continue;
    const out = join(dir, clean);
    await ensureDir(dirname(out));
    await Deno.writeFile(out, data);
  }
}
