/**
 * Load Phase 0 spec artifacts (tokens, selectors, draft schema).
 */

import { dirname, fromFileUrl, join } from "@std/path";

const SPEC_DIR = join(dirname(fromFileUrl(import.meta.url)), "../spec");

export const SPEC_VERSION = "1.0.0";

export type TokenDef = {
  name: string;
  label: string;
  group: string;
  kind: "color" | "text" | "size" | "image";
  default: string;
  engineDefault?: string;
  /** Show in studio sidebar */
  studio?: boolean;
};

export type TokensFile = {
  specVersion: string;
  description?: string;
  tokens: TokenDef[];
};

export type SelectorsFile = {
  specVersion: string;
  description?: string;
  stableClasses: string[];
  allowSelectorPatterns: string[];
  allowAtRules: string[];
  forbiddenSubstring: string[];
  forbiddenSelectorPatterns: string[];
  notes?: string[];
};

let _tokens: TokensFile | null = null;
let _selectors: SelectorsFile | null = null;
let _schema: Record<string, unknown> | null = null;

async function readJson<T>(name: string): Promise<T> {
  const text = await Deno.readTextFile(join(SPEC_DIR, name));
  return JSON.parse(text) as T;
}

export async function loadTokensFile(): Promise<TokensFile> {
  if (!_tokens) _tokens = await readJson<TokensFile>("tokens.json");
  return _tokens;
}

export async function loadSelectorsFile(): Promise<SelectorsFile> {
  if (!_selectors) {
    _selectors = await readJson<SelectorsFile>("selectors.json");
  }
  return _selectors;
}

export async function loadDraftSchema(): Promise<Record<string, unknown>> {
  if (!_schema) {
    _schema = await readJson<Record<string, unknown>>(
      "theme-draft.schema.json",
    );
  }
  return _schema;
}

/** Full spec bundle for GET /api/spec */
export async function loadSpecBundle(): Promise<{
  specVersion: string;
  tokens: TokensFile;
  selectors: SelectorsFile;
  draftSchema: Record<string, unknown>;
}> {
  const [tokens, selectors, draftSchema] = await Promise.all([
    loadTokensFile(),
    loadSelectorsFile(),
    loadDraftSchema(),
  ]);
  return {
    specVersion: SPEC_VERSION,
    tokens,
    selectors,
    draftSchema,
  };
}

export function specDir(): string {
  return SPEC_DIR;
}
