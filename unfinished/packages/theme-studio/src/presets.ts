/**
 * Named token presets (Phase 5).
 */

import { dirname, fromFileUrl, join } from "@std/path";

const SPEC = join(dirname(fromFileUrl(import.meta.url)), "../spec");

export type Preset = {
  id: string;
  label: string;
  description?: string;
  mode: "light" | "dark";
  /** Suggested pair preset id for dual export */
  pair?: string;
  tokens: Record<string, string>;
};

export type PresetsFile = {
  specVersion: string;
  presets: Preset[];
};

let cache: PresetsFile | null = null;

export async function loadPresets(): Promise<PresetsFile> {
  if (!cache) {
    const text = await Deno.readTextFile(join(SPEC, "presets.json"));
    cache = JSON.parse(text) as PresetsFile;
  }
  return cache;
}

export async function getPreset(id: string): Promise<Preset | null> {
  const f = await loadPresets();
  return f.presets.find((p) => p.id === id) ?? null;
}

/**
 * Merge preset tokens onto a base map (catalog defaults).
 */
export function applyPresetTokens(
  base: Record<string, string>,
  preset: Preset,
): Record<string, string> {
  return { ...base, ...preset.tokens };
}
