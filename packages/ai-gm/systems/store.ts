import { DBO } from "ursamu";
import { z } from "zod";
import type { IGameSystem } from "./interface.ts";
import { urbanShadowsSystem } from "./urban-shadows.ts";
import { genericSystem } from "./generic.ts";

// deno-lint-ignore no-explicit-any
function registerStatSystem(_system: any) {}

// MED-05: Zod schema validates DB-stored system records before deserializing.
// Prevents a corrupted or tampered DB row from producing a partial/poisoned IGameSystem.
const StoredGameSystemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string(),
  source: z.literal("ingested"),
  ingestedFrom: z.array(z.string()),
  confidence: z.record(z.string(), z.enum(["high", "uncertain"])),
  coreRulesPrompt: z.string(),
  moveThresholds: z.object({
    fullSuccess: z.number(),
    partialSuccess: z.number(),
  }),
  stats: z.array(z.string()),
  adjudicationHint: z.string(),
  hardMoves: z.array(z.string()),
  softMoves: z.array(z.string()),
  missConsequenceHint: z.string(),
  categories: z.array(z.string()),
  statsByCategory: z.record(z.string(), z.array(z.string())),
  charCollection: z.string().regex(/^[a-z0-9]+(\.[a-z0-9]+)*$/).optional(),
});

// ─── Serialized form stored in DB ─────────────────────────────────────────────

export interface IStoredGameSystem {
  id: string;
  name: string;
  version: string;
  source: "ingested";
  ingestedFrom: string[];
  confidence: Record<string, "high" | "uncertain">;
  coreRulesPrompt: string;
  moveThresholds: { fullSuccess: number; partialSuccess: number };
  stats: string[];
  adjudicationHint: string;
  hardMoves: string[];
  softMoves: string[];
  missConsequenceHint: string;
  // IStatSystem fields serialized
  categories: string[];
  statsByCategory: Record<string, string[]>;
  charCollection?: string;
}

export const gmCustomSystems = new DBO<IStoredGameSystem>(
  "server.gm.custom_systems",
);

// ─── In-memory registry ────────────────────────────────────────────────────────

const _registry = new Map<string, IGameSystem>();

// Register default systems
_registry.set(genericSystem.id, genericSystem);
registerStatSystem(genericSystem);

_registry.set(urbanShadowsSystem.id, urbanShadowsSystem);
registerStatSystem(urbanShadowsSystem);

// ─── Public API ───────────────────────────────────────────────────────────────

export function registerGameSystem(system: IGameSystem): void {
  _registry.set(system.id, system);
  registerStatSystem(system);
}

export function getGameSystem(id: string): IGameSystem {
  return _registry.get(id) ?? genericSystem;
}

export function getGameSystemNames(): string[] {
  return [..._registry.keys()];
}

// ─── Bootstrap: load all DB-stored ingested systems on startup ────────────────

export async function loadCustomSystems(): Promise<void> {
  const stored = await gmCustomSystems.all() as IStoredGameSystem[];
  for (const s of stored) {
    const system = deserializeSystem(s);
    _registry.set(system.id, system);
    registerStatSystem(system);
  }
}

// ─── Persist an ingested system to DB ─────────────────────────────────────────

export async function saveCustomSystem(system: IGameSystem): Promise<void> {
  if (system.source !== "ingested") return;
  const stored: IStoredGameSystem = {
    id: system.id,
    name: system.name,
    version: system.version,
    source: "ingested",
    ingestedFrom: system.ingestedFrom ?? [],
    confidence: system.confidence ?? {},
    coreRulesPrompt: system.coreRulesPrompt,
    moveThresholds: system.moveThresholds,
    stats: [...system.stats],
    adjudicationHint: system.adjudicationHint,
    hardMoves: [...system.hardMoves],
    softMoves: [...system.softMoves],
    missConsequenceHint: system.missConsequenceHint,
    categories: system.getCategories(),
    statsByCategory: Object.fromEntries(
      system.getCategories().map((cat) => [cat, system.getStats(cat)]),
    ),
    charCollection: system.charCollection,
  };
  const existing = await gmCustomSystems.queryOne({ id: system.id });
  if (existing) {
    await gmCustomSystems.update({ id: system.id }, stored);
  } else {
    await gmCustomSystems.create(stored);
  }
  registerGameSystem(system);
}

// ─── Deserialize stored JSON back into a runtime IGameSystem ──────────────────

export function deserializeSystem(s: IStoredGameSystem): IGameSystem {
  // MED-05: validate record shape before constructing live system object
  const parsed = StoredGameSystemSchema.safeParse(s);
  if (!parsed.success) {
    throw new Error(
      `[GM] Stored game system "${
        s?.id ?? "??"
      }" failed validation: ${parsed.error.message}`,
    );
  }
  s = parsed.data;
  return {
    id: s.id,
    name: s.name,
    version: s.version,
    source: "ingested",
    ingestedFrom: s.ingestedFrom,
    confidence: s.confidence,
    coreRulesPrompt: s.coreRulesPrompt,
    moveThresholds: s.moveThresholds,
    stats: s.stats,
    adjudicationHint: s.adjudicationHint,
    hardMoves: s.hardMoves,
    softMoves: s.softMoves,
    missConsequenceHint: s.missConsequenceHint,
    // IStatSystem methods
    getCategories: () => s.categories,
    getStats: (cat?: string) => cat ? (s.statsByCategory[cat] ?? []) : s.stats,
    getStat: (actor: Record<string, unknown>, stat: string) =>
      actor[stat.toLowerCase()] ?? 0,
    setStat: async (
      actor: Record<string, unknown>,
      stat: string,
      value: unknown,
    ) => {
      actor[stat.toLowerCase()] = value;
      await Promise.resolve();
    },
    validate: (stat: string, value: unknown) => {
      if (!s.stats.includes(stat)) return false;
      return typeof value === "number" && value >= 0;
    },
    charCollection: s.charCollection,
    // Ingested systems use generic formatters — game admins can refine via setup chat
    formatMoveResult: (
      moveName: string,
      _stat: string,
      total: number,
      _roll: [number, number],
    ) => {
      const { fullSuccess, partialSuccess } = s.moveThresholds;
      const outcome = total >= fullSuccess
        ? "Full success"
        : total >= partialSuccess
        ? "Partial success"
        : "Miss";
      return `${moveName} (${total}): ${outcome}`;
    },
    formatCharacterContext: (sheet) => {
      // SR4 chars store stats in `attrs`; generic systems use `data`.
      const attrs = sheet.attrs as Record<string, number> | undefined;
      if (attrs) {
        const lines = [`CHARACTER: ${sheet.name}`];
        for (const stat of s.stats) {
          const val = attrs[stat];
          if (val !== undefined) lines.push(`  ${stat}: ${val}`);
        }
        return lines.join("\n");
      }
      const lines = [`CHARACTER: ${sheet.name}`];
      for (const stat of s.stats) {
        const val = sheet.data?.[stat.toLowerCase()];
        if (val !== undefined) lines.push(`  ${stat}: ${val}`);
      }
      return lines.join("\n");
    },
  };
}
