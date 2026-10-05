/** Soft-register with AI-GM when present. */
import type { ISprawlChar } from "../db/schemas.ts";

export const sprawlSystem = {
  id: "sprawl-goons",
  name: "Sprawl Goons: Upgraded",
  version: "1.0.0",
  source: "bundled" as const,
  stats: [
    "morphology",
    "equilibrium",
    "reaction",
    "cognition",
    "affinity",
  ] as const,
  moveThresholds: { fullSuccess: 0, partialSuccess: 0 },
  coreRulesPrompt: [
    "Sprawl Goons uses 2d6 + stat + gear vs Difficulty Score (DS).",
    "Dangerous actions: margin between total and DS is Resilience damage.",
    "NPC DS is also their Resilience. No initiative — player-facing rolls.",
    "Glitch = keep worst 2 of 3d6; Upgrade = keep best 2 of 3d6.",
    "Currency is bityuan (b¥). Stats: Morphology Equilibrium Reaction",
    "Cognition Affinity. Starting Res 12, Loadout 10.",
  ].join(" "),
  adjudicationHint:
    "Call Action Rolls only when outcome is uncertain. Prefer player rolls.",
  hardMoves: [
    "Deal Resilience damage equal to margin",
    "Force a critical injury at Res 0",
    "Burn a console or aug with feedback",
  ] as const,
  softMoves: [
    "Offer Upgrade for smart prep",
    "Introduce a corp or Flow location",
    "Tempt with a street-market deal",
  ] as const,
  missConsequenceHint:
    "On failure of a dangerous action, the PC takes the margin in Res.",
  charCollection: "state.sprawl",

  getCategories(): string[] {
    return ["stats", "condition", "loadout"];
  },
  getStats(category?: string): string[] {
    if (category === "condition") {
      return ["resilience", "loadout", "bityuan"];
    }
    return [...this.stats];
  },
  getStat(actor: Record<string, unknown>, stat: string): unknown {
    const s = actor as unknown as ISprawlChar;
    const stats = s.stats as unknown as Record<string, number>;
    if (stats && stat in stats) return stats[stat];
    const bag = s as unknown as Record<string, unknown>;
    return bag[stat];
  },
  async setStat(): Promise<void> {
    /* AI-GM writes via host */
  },
  validate(stat: string, value: unknown): boolean | string {
    if (typeof value !== "number") return "number required";
    if (value < 0 || value > 20) return "out of range";
    void stat;
    return true;
  },
  formatMoveResult(
    moveName: string,
    stat: string,
    total: number,
    roll: [number, number],
  ): string {
    return (
      `${moveName} (${stat}) [${roll[0]}+${roll[1]}]` +
      ` total ${total}`
    );
  },
  formatCharacterContext(sheet: Record<string, unknown>): string {
    const c = sheet as unknown as ISprawlChar;
    if (!c?.stats) return "No Sprawl sheet.";
    const s = c.stats;
    return [
      `${c.name || "Goon"} · ${c.backgroundName || "unknown"}`,
      `MOR ${s.morphology} EQU ${s.equilibrium}` +
      ` REA ${s.reaction} COG ${s.cognition} AFF ${s.affinity}`,
      `Res ${c.resilience}/${c.resilienceMax}` +
      ` b¥ ${c.bityuan}`,
    ].join("\n");
  },
};

export function registerWithGM(): void {
  try {
    // deno-lint-ignore no-explicit-any
    const { gameHooks } = requireHooks();
    // deno-lint-ignore no-explicit-any
    (gameHooks as any).emit?.("gm:system:register", {
      system: sprawlSystem,
      events: [
        { name: "sprawl:roll", cue: "Sprawl action roll" },
        { name: "sprawl:combat", cue: "Sprawl combat" },
      ],
    });
  } catch {
    /* ai-gm optional */
  }
}

function requireHooks(): { gameHooks: unknown } {
  // Lazy import path used by index — caller passes gameHooks usually.
  // This stub is replaced by index.ts direct emit.
  return { gameHooks: globalThis };
}
