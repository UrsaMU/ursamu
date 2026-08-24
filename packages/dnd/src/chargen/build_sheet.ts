/**
 * Build a live DndSheet from a finished chargen draft.
 */
import {
  type DndAbility,
  type DndSheet,
  type DndSkill,
  DND_ABILITIES,
  DND_SKILLS,
  getAbilityMod,
  migrateSheet,
} from "../stats/dnd_sheet.ts";
import {
  BACKGROUND_METADATA,
  CLASS_METADATA,
} from "../data/catalog.ts";
import type { DndCgState } from "./state.ts";

export function buildSheetFromCg(cg: DndCgState): DndSheet {
  const bgMeta = BACKGROUND_METADATA[cg.background.toLowerCase()];
  const clsMeta = CLASS_METADATA[cg.class.toLowerCase()];

  const finalAbilities = {} as Record<DndAbility, number>;
  for (const ab of DND_ABILITIES) {
    finalAbilities[ab] = (cg.abilities[ab] ?? 8) +
      (cg.abilityIncreases[ab] ?? 0);
  }

  const conMod = getAbilityMod(finalAbilities.constitution);
  const hitDie = clsMeta?.hitDie ?? 8;
  const hpMax = Math.max(1, hitDie + conMod);

  const skillProficiency = {} as Record<
    DndSkill,
    "none" | "proficient" | "expert"
  >;
  for (const skill of DND_SKILLS) {
    skillProficiency[skill] = "none";
  }
  if (bgMeta) {
    for (const sk of bgMeta.skills) {
      skillProficiency[sk] = "proficient";
    }
  }
  for (const sk of cg.chosenSkills) {
    skillProficiency[sk] = "proficient";
  }
  if (cg.species.toLowerCase() === "elf") {
    skillProficiency.perception = "proficient";
  }
  if (cg.species.toLowerCase() === "human") {
    const free = clsMeta?.skillOptions.find((s) =>
      skillProficiency[s] === "none"
    );
    if (free) skillProficiency[free] = "proficient";
  }

  const feats: string[] = [];
  if (cg.chosenFeats.length > 0) {
    for (const f of cg.chosenFeats) {
      feats.push(
        f.split("_").map((w) =>
          w.charAt(0).toUpperCase() + w.slice(1)
        ).join(" "),
      );
    }
  } else if (bgMeta?.feat) {
    feats.push(bgMeta.feat);
  }

  const spells = [...cg.chosenSpells];
  const spellSlotsMax: Record<number, number> = {};
  const spellSlotsCurrent: Record<number, number> = {};
  for (let i = 1; i <= 9; i++) {
    spellSlotsMax[i] = 0;
    spellSlotsCurrent[i] = 0;
  }
  if (clsMeta?.spellcasting) {
    const slots = cg.class.toLowerCase() === "warlock" ? 1 : 2;
    spellSlotsMax[1] = slots;
    spellSlotsCurrent[1] = slots;
  }

  const className = cg.class
    ? cg.class.charAt(0).toUpperCase() + cg.class.slice(1)
    : "Fighter";

  return migrateSheet({
    class: className,
    classes: { [className]: 1 },
    level: 1,
    species: cg.species,
    background: cg.background,
    abilities: finalAbilities,
    skillProficiency,
    savingThrowProficiency: clsMeta?.saves || [],
    hp: { max: hpMax, current: hpMax, temp: 0 },
    hitDice: { max: 1, current: 1 },
    ac: 10 + getAbilityMod(finalAbilities.dexterity),
    feats,
    spells,
    spellSlotsMax,
    spellSlotsCurrent,
    gold: cg.startingGear === "gold"
      ? (clsMeta?.startingGold ?? 100)
      : 10,
    money: {
      cp: 0,
      sp: 0,
      ep: 0,
      gp: cg.startingGear === "gold"
        ? (clsMeta?.startingGold ?? 100)
        : 10,
      pp: 0,
    },
  });
}

/** Plain-text snapshot for CGEN job bodies. */
export function sheetSnapshot(
  name: string,
  sheet: DndSheet,
): string {
  const s = migrateSheet(sheet);
  const abs = DND_ABILITIES.map((a) =>
    `${a.slice(0, 3).toUpperCase()} ${s.abilities[a]}`
  ).join("  ");
  const skills = DND_SKILLS.filter((sk) =>
    s.skillProficiency[sk] !== "none"
  ).join(", ") || "none";
  return [
    `Character: ${name}`,
    `Class: ${s.class} ${s.level}` +
      (s.subclass ? ` (${s.subclass})` : ""),
    `Species: ${s.species}  Background: ${s.background}`,
    `HP ${s.hp.max}  AC ${s.ac}  Speed ${s.speed}`,
    abs,
    `Skills: ${skills}`,
    `Feats: ${s.feats.join(", ") || "none"}`,
    `Spells: ${s.spells.join(", ") || "none"}`,
    `Gold: ${s.gold} gp`,
    "",
    "```json",
    JSON.stringify(s, null, 2),
    "```",
  ].join("\n");
}
