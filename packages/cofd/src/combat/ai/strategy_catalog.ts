// Load resources/ai/*.json AI strategies.

import type { AiStrategy } from "./strategy_types.ts";

const AI_DIR = new URL("../../../resources/ai/", import.meta.url);

export interface StrategyLoadError {
  file: string;
  message: string;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ACTIONS = new Set([
  "attack",
  "move",
  "reload",
  "flee",
  "posture",
  "wait",
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validateStrategy(
  raw: unknown,
  file: string,
): { ok: true; s: AiStrategy } | { ok: false; message: string } {
  if (!isRecord(raw)) {
    return { ok: false, message: `${file}: root must be object` };
  }
  if (typeof raw.slug !== "string" || !SLUG_RE.test(raw.slug)) {
    return { ok: false, message: `${file}: invalid slug` };
  }
  if (typeof raw.name !== "string" || !raw.name.trim()) {
    return { ok: false, message: `${file}: name required` };
  }
  if (!Array.isArray(raw.rules) || raw.rules.length === 0) {
    return { ok: false, message: `${file}: rules must be non-empty` };
  }
  for (const r of raw.rules) {
    if (!isRecord(r)) {
      return { ok: false, message: `${file}: rule must be object` };
    }
    if (typeof r.id !== "string" || !r.id) {
      return { ok: false, message: `${file}: rule.id required` };
    }
    if (typeof r.priority !== "number") {
      return {
        ok: false,
        message: `${file}: rule ${r.id} priority required`,
      };
    }
    if (!isRecord(r.when)) {
      return {
        ok: false,
        message: `${file}: rule ${r.id} when required`,
      };
    }
    if (!isRecord(r.then) || typeof r.then.action !== "string") {
      return {
        ok: false,
        message: `${file}: rule ${r.id} then.action required`,
      };
    }
    if (!ACTIONS.has(r.then.action as string)) {
      return {
        ok: false,
        message: `${file}: rule ${r.id} bad action`,
      };
    }
    if (
      r.then.action === "posture" &&
      typeof r.then.posture !== "string"
    ) {
      return {
        ok: false,
        message: `${file}: rule ${r.id} posture required`,
      };
    }
    if (
      r.weight !== undefined &&
      (typeof r.weight !== "number" || r.weight <= 0)
    ) {
      return {
        ok: false,
        message: `${file}: rule ${r.id} weight must be > 0`,
      };
    }
  }
  return { ok: true, s: raw as unknown as AiStrategy };
}

function loadAll(): {
  bySlug: Map<string, AiStrategy>;
  errors: StrategyLoadError[];
} {
  const bySlug = new Map<string, AiStrategy>();
  const errors: StrategyLoadError[] = [];

  let entries: Deno.DirEntry[];
  try {
    entries = [...Deno.readDirSync(AI_DIR)];
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push({ file: "ai/", message: `readDir: ${msg}` });
    return { bySlug, errors };
  }

  for (const ent of entries) {
    if (!ent.isFile || !ent.name.endsWith(".json")) continue;
    const path = new URL(ent.name, AI_DIR);
    let text: string;
    try {
      text = Deno.readTextFileSync(path);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ file: ent.name, message: msg });
      continue;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ file: ent.name, message: `JSON: ${msg}` });
      continue;
    }
    const v = validateStrategy(raw, ent.name);
    if (!v.ok) {
      errors.push({ file: ent.name, message: v.message });
      continue;
    }
    const key = v.s.slug.toLowerCase();
    if (bySlug.has(key)) {
      errors.push({
        file: ent.name,
        message: `duplicate slug '${key}'`,
      });
      continue;
    }
    bySlug.set(key, v.s);
  }

  return { bySlug, errors };
}

const _loaded = loadAll();

export const AI_STRATEGY_ERRORS: readonly StrategyLoadError[] =
  _loaded.errors;

export const AI_STRATEGIES: ReadonlyMap<string, AiStrategy> =
  _loaded.bySlug;

export function getAiStrategy(slug: string): AiStrategy | null {
  if (!slug) return null;
  return AI_STRATEGIES.get(slug.toLowerCase().trim()) ?? null;
}

export function aiStrategyKeys(): string[] {
  return [...AI_STRATEGIES.keys()].sort();
}

export function listAiStrategies(): AiStrategy[] {
  return aiStrategyKeys().map((k) => AI_STRATEGIES.get(k)!);
}
