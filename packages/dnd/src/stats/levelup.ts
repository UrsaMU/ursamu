/**
 * Level-up packages: HP, slots, ASI/feat, optional spell picks.
 */
import {
  DND_ABILITIES,
  getAbilityMod,
  type DndAbility,
  type DndSheet,
} from "./dnd_sheet.ts";
import { classBySlug } from "../data/catalog.ts";
import { ORIGIN_FEATS } from "../data/catalog.ts";
import { getXpRequired } from "./rules.ts";
import { spellBySlug } from "../data/catalog.ts";

/** Levels that grant ASI or feat (PHB). */
export function isAsiLevel(characterLevel: number): boolean {
  return [4, 8, 12, 16, 19].includes(characterLevel);
}

export type LevelUpPlan = {
  nextLevel: number;
  xpRequired: number;
  xpHave: number;
  canLevel: boolean;
  classKey: string;
  hpGain: number;
  needsAsi: boolean;
  isCaster: boolean;
  spellOptions: string[];
};

export function planLevelUp(
  sheet: DndSheet,
  classArg?: string,
): LevelUpPlan | { error: string } {
  let classKey = (classArg || "").toLowerCase().trim();
  if (!classKey) {
    const keys = Object.keys(sheet.classes);
    classKey = (keys[0] || sheet.class || "fighter")
      .toLowerCase().split("/")[0].trim();
  }
  const meta = classBySlug(classKey);
  if (!meta && !CLASS_FALLBACK[classKey]) {
    return { error: `Unknown class "${classArg}".` };
  }
  const total = Object.values(sheet.classes).reduce(
    (a, b) => a + b,
    0,
  ) || sheet.level || 1;
  const nextLevel = total + 1;
  const xpRequired = getXpRequired(nextLevel);
  const xpHave = sheet.xp || 0;
  const hitDie = meta?.hitDie ??
    CLASS_FALLBACK[classKey]?.hitDie ?? 8;
  const con = getAbilityMod(sheet.abilities.constitution ?? 10);
  const hpGain = Math.max(1, Math.floor(hitDie / 2) + 1 + con);
  const caster = !!(meta?.spellcasting) ||
    !!CLASS_FALLBACK[classKey]?.caster;
  const spellOptions = meta?.spellcasting?.spellOptions ??
    CLASS_FALLBACK[classKey]?.spells ?? [];
  return {
    nextLevel,
    xpRequired,
    xpHave,
    canLevel: xpHave >= xpRequired && nextLevel <= 20,
    classKey,
    hpGain,
    needsAsi: isAsiLevel(nextLevel),
    isCaster: caster,
    spellOptions: spellOptions.filter((s) => spellBySlug(s)),
  };
}

const CLASS_FALLBACK: Record<
  string,
  { hitDie: number; caster?: boolean; spells?: string[] }
> = {
  fighter: { hitDie: 10 },
  barbarian: { hitDie: 12 },
  rogue: { hitDie: 8 },
  wizard: {
    hitDie: 6,
    caster: true,
    spells: ["magic_missile", "shield", "mage_armor"],
  },
  cleric: {
    hitDie: 8,
    caster: true,
    spells: ["cure_wounds", "bless", "guiding_bolt"],
  },
  bard: {
    hitDie: 8,
    caster: true,
    spells: ["healing_word", "thunderwave"],
  },
};

export type AsiChoice =
  | { type: "asi"; ability: DndAbility; amount: 1 | 2 }
  | { type: "asi2"; a: DndAbility; b: DndAbility }
  | { type: "feat"; feat: string };

/**
 * Apply core level-up (HP, class level, slots). Does not spend XP.
 * Pending ASI stored on sheet if needed and no choice given.
 */
export function applyLevelCore(
  sheet: DndSheet,
  plan: LevelUpPlan,
): DndSheet {
  const s = structuredClone(sheet) as DndSheet;
  const proper = plan.classKey.charAt(0).toUpperCase() +
    plan.classKey.slice(1);
  s.classes = { ...s.classes };
  s.classes[proper] = (s.classes[proper] || 0) + 1;
  s.level = plan.nextLevel;
  s.hitDice.max = plan.nextLevel;
  s.hitDice.current = Math.min(
    plan.nextLevel,
    (s.hitDice.current || 0) + 1,
  );
  s.hp.max += plan.hpGain;
  s.hp.current += plan.hpGain;

  const parts = Object.entries(s.classes).map(
    ([c, l]) => `${c} ${l}`,
  );
  s.class = parts.length === 1
    ? Object.keys(s.classes)[0]!
    : parts.join(" / ");

  // Spell slots — reuse simple table from cg if available via import cycle
  // Inline minimal full-caster bump
  if (plan.isCaster) {
    refreshSlots(s);
  }

  // deno-lint-ignore no-explicit-any
  const anyS = s as any;
  if (plan.needsAsi) {
    anyS.pendingAsi = true;
  } else {
    delete anyS.pendingAsi;
  }
  return s;
}

function refreshSlots(s: DndSheet): void {
  // Very rough: total caster levels ≈ character level for single class
  const lvl = s.level;
  const table: Record<number, number[]> = {
    1: [2],
    2: [3],
    3: [4, 2],
    4: [4, 3],
    5: [4, 3, 2],
    6: [4, 3, 3],
    7: [4, 3, 3, 1],
    8: [4, 3, 3, 2],
    9: [4, 3, 3, 3, 1],
    10: [4, 3, 3, 3, 2],
  };
  const row = table[Math.min(10, lvl)] ?? table[10]!;
  for (let i = 1; i <= 9; i++) {
    s.spellSlotsMax[i] = row[i - 1] ?? 0;
    s.spellSlotsCurrent[i] = s.spellSlotsMax[i];
  }
}

export function applyAsiChoice(
  sheet: DndSheet,
  choice: AsiChoice,
): { sheet: DndSheet; ok: boolean; message: string } {
  const s = structuredClone(sheet) as DndSheet;
  // deno-lint-ignore no-explicit-any
  if (!(s as any).pendingAsi && !isAsiLevel(s.level)) {
    return {
      sheet,
      ok: false,
      message: "No ASI/feat pending.",
    };
  }
  if (choice.type === "feat") {
    const slug = choice.feat.toLowerCase().replace(/\s+/g, "_");
    if (
      !ORIGIN_FEATS.includes(slug) &&
      !ORIGIN_FEATS.some((f) =>
        f.replace(/_/g, "") === slug.replace(/_/g, "")
      )
    ) {
      // Allow any short feat name as freeform for staff tables
      if (choice.feat.length < 2) {
        return { sheet, ok: false, message: "Unknown feat." };
      }
    }
    s.feats = [...(s.feats || []), choice.feat];
    // deno-lint-ignore no-explicit-any
    delete (s as any).pendingAsi;
    return {
      sheet: s,
      ok: true,
      message: `Feat gained: ${choice.feat}.`,
    };
  }
  if (choice.type === "asi") {
    const ab = choice.ability;
    if (!DND_ABILITIES.includes(ab)) {
      return { sheet, ok: false, message: "Bad ability." };
    }
    const cur = s.abilities[ab] ?? 10;
    const next = Math.min(20, cur + choice.amount);
    s.abilities[ab] = next;
    // deno-lint-ignore no-explicit-any
    delete (s as any).pendingAsi;
    return {
      sheet: s,
      ok: true,
      message: `${ab} ${cur} → ${next}.`,
    };
  }
  // asi2
  for (const ab of [choice.a, choice.b]) {
    if (!DND_ABILITIES.includes(ab)) {
      return { sheet, ok: false, message: "Bad ability." };
    }
    const cur = s.abilities[ab] ?? 10;
    s.abilities[ab] = Math.min(20, cur + 1);
  }
  // deno-lint-ignore no-explicit-any
  delete (s as any).pendingAsi;
  return {
    sheet: s,
    ok: true,
    message: `+1 ${choice.a}, +1 ${choice.b}.`,
  };
}

export function applySpellPick(
  sheet: DndSheet,
  spellRaw: string,
): { sheet: DndSheet; ok: boolean; message: string } {
  const sp = spellBySlug(spellRaw);
  if (!sp) {
    return { sheet, ok: false, message: `Unknown spell.` };
  }
  const s = structuredClone(sheet) as DndSheet;
  const has = s.spells.some((x) =>
    x.toLowerCase() === sp.slug ||
    x.toLowerCase() === sp.name.toLowerCase()
  );
  if (has) {
    return { sheet, ok: false, message: "Already known." };
  }
  s.spells = [...s.spells, sp.slug];
  return {
    sheet: s,
    ok: true,
    message: `Learned ${sp.name}.`,
  };
}

export function formatLevelReady(sheet: DndSheet): string {
  const plan = planLevelUp(sheet);
  if ("error" in plan) return "";
  if (!plan.canLevel) {
    const need = plan.xpRequired - plan.xpHave;
    if (plan.nextLevel > 20) return "Max level.";
    return (
      `XP ${plan.xpHave}/${plan.xpRequired} ` +
      `(need ${need} more for level ${plan.nextLevel}).`
    );
  }
  return (
    `Ready to %ch+level%cn → ${plan.nextLevel} ` +
    `(+${plan.hpGain} HP` +
    (plan.needsAsi ? ", ASI/feat" : "") +
    (plan.isCaster ? ", slots refresh" : "") +
    `).`
  );
}
