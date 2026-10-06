/** Gear catalog/info rendering (78-col). */
import type { IUrsamuSDK } from "@ursamu/mush";
import { ARMOR, WEAPONS, armorDef, weaponDef } from "./data.ts";

export function weaponLine(w: (typeof WEAPONS)[number]): string {
  const dmg = w.dmg.fixed != null
    ? String(w.dmg.fixed)
    : w.dmg.plus
    ? `${w.dmg.mult} x (Strength+${w.dmg.plus})`
    : `${w.dmg.mult} x Strength`;
  return ` ${w.name.padEnd(23)}${dmg.padStart(18).padEnd(25)}` +
    `${w.type.padEnd(14)}${w.range}`;
}

export function armorLine(a: (typeof ARMOR)[number]): string {
  return ` ${a.name.padEnd(25)}${String(a.protection.bash).padStart(6)}` +
    `${String(a.protection.slash).padStart(16)}` +
    `${String(a.protection.bullet).padStart(14)}` +
    `   ${a.coverage}`;
}

export async function showCatalog(u: IUrsamuSDK, what: string): Promise<void> {
  if (what === "armor") {
    const lines = [
      `%ch${"ARMOR".padEnd(25)}${"Bash".padStart(6)}` +
        `${"Slash/stab".padStart(16)}${"Bullet".padStart(14)}   Coverage%cn`,
      "-".repeat(78),
    ];
    for (const a of ARMOR) lines.push(armorLine(a));
    u.send(lines.join("%r"));
    return;
  }
  const lines = [
    `%ch${"WEAPON".padEnd(23)}${"Base Damage".padStart(18)}       ` +
      `${"Type".padEnd(10)}Range%cn`,
    "-".repeat(78),
  ];
  for (const w of WEAPONS) lines.push(weaponLine(w));
  lines.push("");
  lines.push(
    ` Melee weapons use Getting Medieval. Firearms use Gun Fu.`,
  );
  u.send(lines.join("%r"));
}

export function showInfo(slug: string): string {
  const w = weaponDef(slug);
  if (w) {
    return [
      `%ch${w.name}%cn`,
      `Base damage: ${w.dmg.fixed ?? `${w.dmg.mult} x Strength` +
        (w.dmg.plus ? ` + ${w.dmg.plus}` : "")}`,
      `Type: ${w.type}   Skill: ${w.skill}   Range: ${w.range}` +
        `   Hands: ${w.hands}`,
      w.special ? `Special: ${w.special}` : "",
    ].filter(Boolean).join("%r");
  }
  const a = armorDef(slug);
  if (a) {
    return [
      `%ch${a.name}%cn`,
      `Bash ${a.protection.bash} / Slash-stab ${a.protection.slash}` +
        ` / Bullet ${a.protection.bullet}`,
      `Coverage: ${a.coverage}`,
    ].join("%r");
  }
  return `%crNot found%cn: ${slug}`;
}

function skillName(slug: string): string {
  const s = SKILL_NAMES[slug];
  return s ?? slug;
}

const SKILL_NAMES: Record<string, string> = {
  "getting-medieval": "Getting Medieval",
  "gun-fu": "Gun Fu",
};

