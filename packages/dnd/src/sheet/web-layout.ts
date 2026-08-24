/**
 * Structured +sheet layout for web /play (u.ui.layout).
 */
import {
  DND_ABILITIES,
  DND_SKILLS,
  getAbilityMod,
  getProficiencyBonus,
  migrateSheet,
  type DndSheet,
  type DndAbility,
  type DndSkill,
  SKILL_ABILITY_MAP,
} from "../stats/dnd_sheet.ts";
import { formatDeathStatus } from "../stats/death.ts";

function titleCase(s: string): string {
  return String(s || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtMod(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function skillTotal(
  sheet: DndSheet,
  sk: DndSkill,
  prof: number,
): number {
  const ab = SKILL_ABILITY_MAP[sk];
  const mod = getAbilityMod(sheet.abilities[ab] ?? 10);
  const p = sheet.skillProficiency[sk] ?? "none";
  const mult = p === "expert" ? 2 : p === "proficient" ? 1 : 0;
  return mod + prof * mult;
}

/**
 * Build layout components for +sheet on web clients.
 */
export function buildSheetWebLayout(
  playerName: string,
  sheetIn: DndSheet,
): {
  components: Record<string, unknown>[];
  meta: Record<string, unknown>;
} {
  const s = migrateSheet(sheetIn);
  const prof = getProficiencyBonus(s.level);
  const components: Record<string, unknown>[] = [];
  const dexM = getAbilityMod(s.abilities.dexterity ?? 10);
  const wisM = getAbilityMod(s.abilities.wisdom ?? 10);
  const percP = s.skillProficiency.perception ?? "none";
  const percMult = percP === "expert"
    ? 2
    : percP === "proficient"
    ? 1
    : 0;
  const passive = 10 + wisM + prof * percMult;
  const sub = [
    `${s.class}${s.subclass ? ` (${s.subclass})` : ""} ${s.level}`,
    s.species,
    s.background,
  ].filter(Boolean).join(" · ");

  components.push({
    type: "header",
    title: playerName,
    subtitle: sub,
  });

  components.push({
    type: "grid",
    title: "Combat",
    content: [
      { label: "AC", value: String(s.ac) },
      { label: "Initiative", value: fmtMod(dexM) },
      { label: "Speed", value: `${s.speed} ft` },
      { label: "Proficiency", value: fmtMod(prof) },
      { label: "Passive Perc", value: String(passive) },
      {
        label: "HP",
        value: `${s.hp.current}/${s.hp.max}` +
          (s.hp.temp ? ` (+${s.hp.temp})` : ""),
      },
      {
        label: "Hit Dice",
        value: `${s.hitDice.current}/${s.hitDice.max}`,
      },
      { label: "Gold", value: `${s.gold} gp` },
      { label: "XP", value: String(s.xp) },
      {
        label: "Status",
        value: formatDeathStatus(s)
          .replace(/%c[a-z]/gi, "")
          .replace(/%cn/gi, ""),
      },
    ],
  });

  components.push({
    type: "grid",
    title: "Abilities",
    content: DND_ABILITIES.map((ab: DndAbility) => {
      const v = s.abilities[ab] ?? 10;
      const m = getAbilityMod(v);
      return {
        label: ab.slice(0, 3).toUpperCase(),
        value: `${v} (${fmtMod(m)})`,
      };
    }),
  });

  components.push({
    type: "list",
    title: "Saving Throws",
    content: DND_ABILITIES.map((ab) => {
      const isP = s.savingThrowProficiency.includes(ab);
      const m = getAbilityMod(s.abilities[ab] ?? 10) +
        (isP ? prof : 0);
      const mark = isP ? "[X]" : "[ ]";
      return `${mark} ${titleCase(ab)} ${fmtMod(m)}`;
    }),
  });

  components.push({
    type: "list",
    title: "Skills",
    content: DND_SKILLS.map((sk) => {
      const p = s.skillProficiency[sk] ?? "none";
      const mark = p === "expert"
        ? "[E]"
        : p === "proficient"
        ? "[X]"
        : "[ ]";
      const ab = SKILL_ABILITY_MAP[sk].slice(0, 3).toUpperCase();
      const total = skillTotal(s, sk, prof);
      return `${mark} ${titleCase(sk)} (${ab}) ${fmtMod(total)}`;
    }),
  });

  if (s.feats.length) {
    components.push({
      type: "list",
      title: "Feats",
      content: s.feats.map(titleCase),
    });
  }

  if (s.equipment?.length) {
    components.push({
      type: "list",
      title: "Equipment",
      content: s.equipment.map(titleCase),
    });
  }

  if (s.spells.length) {
    components.push({
      type: "list",
      title: "Spells",
      content: s.spells.map((x) => titleCase(x)),
    });
  }

  const slotLines: string[] = [];
  for (let n = 1; n <= 9; n++) {
    const mx = s.spellSlotsMax[n] ?? 0;
    if (!mx) continue;
    const cur = s.spellSlotsCurrent[n] ?? mx;
    slotLines.push(`Level ${n}: ${cur}/${mx}`);
  }
  if (slotLines.length) {
    components.push({
      type: "list",
      title: "Spell Slots",
      content: slotLines,
    });
  }

  return {
    components,
    meta: {
      type: "dnd-sheet",
      system: "dnd",
      class: s.class,
      level: s.level,
    },
  };
}
