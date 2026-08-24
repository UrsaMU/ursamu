/**
 * Phase 0 validators — draft payload, tokens, cssExtras allowlist.
 */

import {
  loadSelectorsFile,
  loadTokensFile,
  SPEC_VERSION,
  type SelectorsFile,
  type TokenDef,
} from "./spec-data.ts";
import type { ExportManifest } from "./export-theme.ts";

export type Issue = {
  level: "error" | "warn";
  code: string;
  message: string;
  path?: string;
};

export type ValidationResult = {
  ok: boolean;
  errors: Issue[];
  warnings: Issue[];
};

export type DraftLike = {
  specVersion?: string;
  manifest: ExportManifest;
  tokens: Record<string, string>;
  cssExtras?: string;
  siteCss?: string;
};

const ID_RE = /^[a-z][a-z0-9_-]{0,39}$/;
const TOKEN_NAME_RE = /^--site-[a-z0-9-]+$/;
/** imgs/ or fonts/ + safe filename (letters, digits, . _ - @ ( ) +) */
const ASSET_PATH_RE = /^(imgs|fonts)\/[A-Za-z0-9._@()+\-]+$/;

function issue(
  level: "error" | "warn",
  code: string,
  message: string,
  path?: string,
): Issue {
  return { level, code, message, path };
}

export function validateManifest(m: ExportManifest): Issue[] {
  const out: Issue[] = [];
  if (!m.id || !ID_RE.test(m.id)) {
    out.push(issue(
      "error",
      "manifest.id",
      "id must match [a-z][a-z0-9_-]{0,39}",
      "manifest.id",
    ));
  }
  if (!m.label || !String(m.label).trim()) {
    out.push(issue(
      "error",
      "manifest.label",
      "label is required",
      "manifest.label",
    ));
  }
  if (m.bannerImage && m.bannerImage.includes("..")) {
    out.push(issue(
      "error",
      "manifest.bannerImage",
      "bannerImage path traversal forbidden",
      "manifest.bannerImage",
    ));
  }
  return out;
}

export function validateTokens(
  tokens: Record<string, string>,
  catalog: TokenDef[],
): Issue[] {
  const out: Issue[] = [];
  const known = new Set(catalog.map((t) => t.name));
  for (const [k, v] of Object.entries(tokens)) {
    if (!TOKEN_NAME_RE.test(k)) {
      out.push(issue(
        "error",
        "token.name",
        `Invalid token name: ${k}`,
        `tokens.${k}`,
      ));
      continue;
    }
    if (!known.has(k)) {
      out.push(issue(
        "warn",
        "token.unknown",
        `Unknown token (passthrough): ${k}`,
        `tokens.${k}`,
      ));
    }
    if (typeof v !== "string") {
      out.push(issue(
        "error",
        "token.value",
        `Token value must be string: ${k}`,
        `tokens.${k}`,
      ));
    } else if (v.length > 2000) {
      out.push(issue(
        "error",
        "token.value",
        `Token value too long: ${k}`,
        `tokens.${k}`,
      ));
    } else if (/expression\s*\(|javascript:/i.test(v)) {
      out.push(issue(
        "error",
        "token.unsafe",
        `Unsafe token value: ${k}`,
        `tokens.${k}`,
      ));
    }
  }
  return out;
}

/** Split cssExtras into rule-ish chunks (best-effort). */
export function splitCssRules(css: string): string[] {
  const rules: string[] = [];
  let i = 0;
  const s = css;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i]!)) i++;
    if (i >= s.length) break;
    if (s.startsWith("/*", i)) {
      const end = s.indexOf("*/", i + 2);
      i = end < 0 ? s.length : end + 2;
      continue;
    }
    if (s[i] === "@") {
      // @font-face { ... } or other at-rule
      const brace = s.indexOf("{", i);
      if (brace < 0) {
        rules.push(s.slice(i).trim());
        break;
      }
      let depth = 0;
      let j = brace;
      for (; j < s.length; j++) {
        if (s[j] === "{") depth++;
        else if (s[j] === "}") {
          depth--;
          if (depth === 0) {
            j++;
            break;
          }
        }
      }
      rules.push(s.slice(i, j).trim());
      i = j;
      continue;
    }
    const brace = s.indexOf("{", i);
    if (brace < 0) {
      const rest = s.slice(i).trim();
      if (rest) rules.push(rest);
      break;
    }
    let depth = 0;
    let j = brace;
    for (; j < s.length; j++) {
      if (s[j] === "{") depth++;
      else if (s[j] === "}") {
        depth--;
        if (depth === 0) {
          j++;
          break;
        }
      }
    }
    rules.push(s.slice(i, j).trim());
    i = j;
  }
  return rules.filter(Boolean);
}

function selectorAllowed(
  selector: string,
  sel: SelectorsFile,
): boolean {
  const s = selector.trim();
  if (!s) return false;
  for (const pat of sel.forbiddenSelectorPatterns) {
    if (new RegExp(pat, "i").test(s)) return false;
  }
  // multi-selectors: each part must pass
  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    let ok = false;
    for (const pat of sel.allowSelectorPatterns) {
      if (new RegExp(pat, "i").test(part)) {
        ok = true;
        break;
      }
    }
    // also allow exact stable class with optional pseudo
    if (!ok) {
      for (const cls of sel.stableClasses) {
        const esc = cls.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (
          new RegExp(
            `^${esc}(\\s+${esc})*(:[a-z-]+|\\[[^\\]]+\\])*$`,
            "i",
          ).test(part)
        ) {
          ok = true;
          break;
        }
      }
    }
    if (!ok) return false;
  }
  return true;
}

export function validateCssExtras(
  css: string,
  sel: SelectorsFile,
): Issue[] {
  const out: Issue[] = [];
  if (!css || !css.trim()) return out;
  if (css.length > 200000) {
    out.push(issue(
      "error",
      "cssExtras.size",
      "cssExtras exceeds 200KB",
      "cssExtras",
    ));
    return out;
  }
  const lower = css.toLowerCase();
  for (const bad of sel.forbiddenSubstring) {
    if (lower.includes(bad.toLowerCase())) {
      out.push(issue(
        "error",
        "cssExtras.forbidden",
        `Forbidden construct: ${bad}`,
        "cssExtras",
      ));
    }
  }
  // Reject :root in extras (tokens belong in tokens map)
  if (/(^|})\s*:root\b/m.test(css) || /^\s*:root\b/m.test(css)) {
    out.push(issue(
      "error",
      "cssExtras.root",
      "Put :root tokens in tokens map, not cssExtras",
      "cssExtras",
    ));
  }

  const rules = splitCssRules(css);
  for (const rule of rules) {
    if (rule.startsWith("@")) {
      const name = rule.slice(1).split(/[\s{]/)[0]?.toLowerCase() ?? "";
      if (!sel.allowAtRules.map((a) => a.toLowerCase()).includes(name)) {
        out.push(issue(
          "error",
          "cssExtras.at-rule",
          `At-rule not allowed: @${name}`,
          "cssExtras",
        ));
      }
      continue;
    }
    const brace = rule.indexOf("{");
    if (brace < 0) {
      out.push(issue(
        "warn",
        "cssExtras.parse",
        `Unparsed CSS fragment: ${rule.slice(0, 40)}…`,
        "cssExtras",
      ));
      continue;
    }
    const selText = rule.slice(0, brace).trim();
    if (!selectorAllowed(selText, sel)) {
      out.push(issue(
        "error",
        "cssExtras.selector",
        `Selector not allowlisted: ${selText.slice(0, 80)}`,
        "cssExtras",
      ));
    }
  }
  return out;
}

/**
 * Filter cssExtras to only allowlisted rules (drop illegal, keep rest).
 */
export function filterCssExtras(
  css: string,
  sel: SelectorsFile,
): { css: string; dropped: string[] } {
  const dropped: string[] = [];
  const kept: string[] = [];
  for (const rule of splitCssRules(css)) {
    const probe = validateCssExtras(rule, sel).filter((i) =>
      i.level === "error"
    );
    if (probe.length) {
      dropped.push(rule.slice(0, 60));
    } else {
      kept.push(rule);
    }
  }
  return {
    css: kept.join("\n\n") + (kept.length ? "\n" : ""),
    dropped,
  };
}

export async function validateDraft(
  draft: DraftLike,
  opts: { strict?: boolean } = {},
): Promise<ValidationResult> {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];

  const push = (list: Issue[]) => {
    for (const i of list) {
      if (i.level === "error") errors.push(i);
      else warnings.push(i);
    }
  };

  if (draft.specVersion && draft.specVersion !== SPEC_VERSION) {
    warnings.push(issue(
      "warn",
      "specVersion",
      `Draft specVersion ${draft.specVersion} ≠ ${SPEC_VERSION}`,
      "specVersion",
    ));
  }

  push(validateManifest(draft.manifest));

  const tokensFile = await loadTokensFile();
  push(validateTokens(draft.tokens ?? {}, tokensFile.tokens));

  const sel = await loadSelectorsFile();
  const extras = draft.cssExtras ?? "";
  push(validateCssExtras(extras, sel));

  if (draft.siteCss && draft.siteCss.length > 400000) {
    errors.push(issue(
      "error",
      "siteCss.size",
      "siteCss exceeds 400KB",
      "siteCss",
    ));
  }

  if (opts.strict && warnings.length) {
    // strict mode does not promote warns to errors
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateAssetPath(rel: string): Issue | null {
  const clean = rel.replace(/^\/+/, "").replace(/\\/g, "/");
  if (!clean || clean.includes("..")) {
    return issue(
      "error",
      "asset.path",
      `Invalid asset path: ${rel}`,
      "assets",
    );
  }
  if (!ASSET_PATH_RE.test(clean)) {
    return issue(
      "error",
      "asset.path",
      `Asset must be under imgs/ or fonts/: ${rel}`,
      "assets",
    );
  }
  return null;
}

export async function getStudioTokenCatalog(): Promise<TokenDef[]> {
  const f = await loadTokensFile();
  return f.tokens.filter((t) => t.studio !== false);
}

export function resultToPayload(r: ValidationResult): {
  ok: boolean;
  errors: Issue[];
  warnings: Issue[];
} {
  return {
    ok: r.ok,
    errors: r.errors,
    warnings: r.warnings,
  };
}
