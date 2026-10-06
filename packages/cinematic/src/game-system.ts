/** Soft-register with AI-GM when present (loose coupling). */
import { formatCharacterContext } from "./context.ts";
import { bestDefenseSkill, successLevels } from "./rules.ts";
import { CHAR_TYPES, SKILLS } from "./data.ts";
import { ATTRS, type ICinChar } from "./types.ts";

export const cinematicSystem = {
  id: "cinematic-unisystem",
  name: "Cinematic Unisystem",
  version: "1.0.0",
  source: "ingested" as const,
  ingestedFrom: ["cinematic-unisystem.txt"],
  stats: [...ATTRS] as readonly string[],
  moveThresholds: { fullSuccess: 9, partialSuccess: 0 },
  coreRulesPrompt: [
    "Cinematic Unisystem: roll D10 + Attribute + Skill; 9+ succeeds.",
    "Success Levels from total (9-10=1 SL, +1 per 2 up to 16, 17-20=5,",
    "then +3 per SL). Damage = base + Success Levels - armor.",
    "Life Points = (Str+Con)x4+10. Drama Points buy +10 rolls, heal half,",
    "or plot twists. NPCs use fixed Ability Scores: Muscle=2xStr+6,",
    "Combat=Dex+avg combat skill+6, Brains=avg mental+avg skill+6.",
    "Types: White Hat 15/10/15 + 20 drama; Hero 20/20/20 + 10 drama;",
    "Experienced Hero 25/25/40 + 20 drama.",
  ].join(" "),
  adjudicationHint:
    "Only roll when outcome is in doubt and dramatic. Attributes alone" +
    " are doubled when no skill applies. Reward descriptive action with" +
    " +1/+2 bonuses.",
  hardMoves: [
    "Attack connects and deals damage plus Success Levels",
    "Hero is knocked down, defenses at -4",
    "Grapple sets up Choke or Break Neck",
    "Fear Test failure forces Panic Table result",
  ] as const,
  softMoves: [
    "Offer a Plot Twist opening for a Drama Point",
    "Let a descriptive stunt grant a +1/+2 bonus",
    "Have the villain monologue instead of finishing the hero",
    "Introduce a witness or clue via Notice",
  ] as const,
  missConsequenceHint:
    "A failed roll hands the scene to the adversary; the hero may lose" +
    " a Drama Point's worth of luck or suffer the enemy's move.",
  charCollection: "state.cinematic",

  getCategories(): string[] {
    return ["attributes", "skills", "types"];
  },
  getStats(category?: string): string[] {
    if (category === "skills") return SKILLS.map((s) => s.slug);
    if (category === "types") return CHAR_TYPES.map((t) => t.slug);
    return [...ATTRS];
  },
  getStat(actor: Record<string, unknown>, stat: string): unknown {
    const c = actor.cinematic as ICinChar | undefined;
    if (!c) return undefined;
    if (stat in c.attrs) return c.attrs[stat as keyof typeof c.attrs];
    if (stat in c.skills) return c.skills[stat];
    return undefined;
  },
  async setStat(): Promise<void> {
    /* AI-GM writes via host */
  },
  validate(stat: string, value: unknown): boolean | string {
    if (typeof value !== "number") return "number required";
    if (SKILLS.some((s) => s.slug === stat)) {
      return value >= 0 && value <= 10
        ? true
        : "skill range 0-10";
    }
    return value >= 1 && value <= 6 ? true : "attribute range 1-6";
  },
  formatMoveResult(
    moveName: string,
    stat: string,
    total: number,
    roll: [number, number],
  ): string {
    const sl = successLevels(total);
    return `${moveName} (${stat}) [d10:${roll[0]}+${roll[1]}]` +
      ` total ${total} — ${sl} SL`;
  },
  formatCharacterContext(sheet: Record<string, unknown>): string {
    const c = sheet.cinematic as ICinChar | undefined;
    if (!c) return "No Cinematic Unisystem sheet.";
    const name = (sheet.name as string) ?? "Cast Member";
    void bestDefenseSkill(c);
    return formatCharacterContext(c, name);
  },
};
