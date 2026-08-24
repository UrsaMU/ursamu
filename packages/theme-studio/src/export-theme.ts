/**
 * Pack a Court-style theme zip from studio export payload.
 */

import { zipSync } from "fflate";
import { tokensToCss, tokensToDualCss } from "./tokens.ts";
import {
  filterCssExtras,
  validateAssetPath,
  validateDraft,
  type Issue,
} from "./validate.ts";
import { loadSelectorsFile } from "./spec-data.ts";
import { SPEC_VERSION } from "./spec-data.ts";

export type ExportManifest = {
  id: string;
  label: string;
  version?: string;
  description?: string;
  title?: string;
  plainBg?: boolean;
  css?: string;
  bannerImage?: string;
};

export type ExportPayload = {
  specVersion?: string;
  manifest: ExportManifest;
  tokens: Record<string, string>;
  /** Optional light map when dual export */
  tokensLight?: Record<string, string>;
  /** Optional dark map when dual export */
  tokensDark?: Record<string, string>;
  /** When true and both light/dark present, emit dual CSS */
  dual?: boolean;
  /** Extra CSS (Grapes rules, manual) */
  cssExtras?: string;
  /** Optional full site.css override */
  siteCss?: string;
  /**
   * Binary assets keyed by zip-relative path
   * (e.g. "imgs/header.png"). Values are base64 in JSON
   * transport; packThemeZip accepts Uint8Array map.
   */
  assets?: Record<string, Uint8Array>;
};

const ID_RE = /^[a-z][a-z0-9_-]{0,39}$/;

export function validateManifest(
  m: ExportManifest,
): string | null {
  if (!m.id || !ID_RE.test(m.id)) {
    return "manifest.id must match [a-z][a-z0-9_-]{0,39}";
  }
  if (!m.label || !String(m.label).trim()) {
    return "manifest.label is required";
  }
  return null;
}

export function buildSiteCss(payload: ExportPayload): string {
  if (payload.siteCss && payload.siteCss.trim()) {
    return payload.siteCss.trim() + "\n";
  }
  const extras = payload.cssExtras ?? "";
  if (
    payload.dual &&
    payload.tokensLight &&
    payload.tokensDark &&
    Object.keys(payload.tokensLight).length > 0 &&
    Object.keys(payload.tokensDark).length > 0
  ) {
    return tokensToDualCss(
      payload.tokensLight,
      payload.tokensDark,
      extras,
    );
  }
  return tokensToCss(payload.tokens ?? {}, extras);
}

/**
 * Validate + optionally filter extras before pack.
 * Throws on hard errors.
 */
export async function prepareExportPayload(
  payload: ExportPayload,
): Promise<{ payload: ExportPayload; warnings: Issue[] }> {
  const sel = await loadSelectorsFile();
  let cssExtras = payload.cssExtras ?? "";
  const filtered = filterCssExtras(cssExtras, sel);
  cssExtras = filtered.css;
  const warnings: Issue[] = filtered.dropped.map((d) => ({
    level: "warn" as const,
    code: "cssExtras.filtered",
    message: `Dropped non-allowlisted rule: ${d}…`,
    path: "cssExtras",
  }));

  const next: ExportPayload = {
    ...payload,
    specVersion: payload.specVersion ?? SPEC_VERSION,
    cssExtras,
  };

  if (next.assets) {
    for (const rel of Object.keys(next.assets)) {
      const iss = validateAssetPath(rel);
      if (iss && iss.level === "error") {
        throw new Error(iss.message);
      }
    }
  }

  const v = await validateDraft({
    specVersion: next.specVersion,
    manifest: next.manifest,
    tokens: next.tokens ?? {},
    cssExtras: next.cssExtras,
    siteCss: next.siteCss,
  });
  if (!v.ok) {
    throw new Error(
      v.errors.map((e) => e.message).join("; ") || "Validation failed",
    );
  }
  warnings.push(...v.warnings);

  return { payload: next, warnings };
}

export function packThemeZip(
  payload: ExportPayload,
): { zip: Uint8Array; filename: string } {
  const err = validateManifest(payload.manifest);
  if (err) throw new Error(err);

  const id = payload.manifest.id.trim().toLowerCase();
  const manifest = {
    id,
    label: String(payload.manifest.label).trim(),
    version: payload.manifest.version ?? "0.1.0",
    description: payload.manifest.description ??
      "Exported from UrsaMU Theme Studio",
    css: "site.css",
    title: payload.manifest.title ?? payload.manifest.label,
    plainBg: payload.manifest.plainBg !== false,
  };

  if (payload.manifest.bannerImage) {
    (manifest as ExportManifest).bannerImage =
      payload.manifest.bannerImage;
  }

  let siteCss = buildSiteCss(payload);
  // Rewrite studio draft asset URLs to install paths
  // (root-relative and absolute studio-origin forms)
  siteCss = siteCss.replace(
    /https?:\/\/[^/"'\s)]+\/draft\/assets\//g,
    `/site/theme/installed/${id}/`,
  );
  siteCss = siteCss.replaceAll(
    "/draft/assets/",
    `/site/theme/installed/${id}/`,
  );
  const guide = `# ${manifest.label}

Exported from **UrsaMU Theme Studio** (GrapesJS).

## Install

1. Admin → Settings → Public site → Upload zip
2. Activate theme

Or:

\`\`\`bash
unzip ${id}.zip -d theme/installed/
\`\`\`

\`\`\`json
"plugins": {
  "site": {
    "skin": "${id}",
    "themeDir": "theme",
    "skinCss": "/site/theme/installed/${id}/site.css",
    "title": ${JSON.stringify(manifest.title)},
    "plainBg": ${manifest.plainBg}
  }
}
\`\`\`
`;

  const enc = new TextEncoder();
  const files: Record<string, Uint8Array> = {
    [`${id}/theme.json`]: enc.encode(
      JSON.stringify(manifest, null, 2) + "\n",
    ),
    [`${id}/site.css`]: enc.encode(siteCss),
    [`${id}/GUIDE.md`]: enc.encode(guide),
  };

  if (payload.assets) {
    for (const [rel, data] of Object.entries(payload.assets)) {
      const clean = rel.replace(/^\/+/, "").replace(/\\/g, "/");
      if (!clean || clean.includes("..")) continue;
      files[`${id}/${clean}`] = data;
    }
  }

  const zip = zipSync(files, { level: 6 });
  return { zip, filename: `${id}.zip` };
}
