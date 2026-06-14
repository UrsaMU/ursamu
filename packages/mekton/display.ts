import type { IUrsamuSDK } from "@ursamu/ursamu";
import type { IMektonChar, WoundLocation } from "./schema.ts";
import { derivedStats, skillPointsSpent, effectiveMA } from "./derived.ts";
import { combatStatus, LOCATION_LABELS } from "./combat.ts";

const W = 78;

function sectionHead(u: IUrsamuSDK, title: string): string {
  return `%ch%cw${u.util.ljust(title, W)}%cn`;
}

function _row(u: IUrsamuSDK, label: string, value: string | number, pad = 20): string {
  return `  ${u.util.ljust(label, pad)} ${value}`;
}

/** Full character sheet for +sheet. */
export function formatSheet(u: IUrsamuSDK, char: IMektonChar): string {
  const d = derivedStats(char);
  const spent = skillPointsSpent(char.skills);
  const eff = effectiveMA(char);
  const status = combatStatus(char);
  const careerLine = char.charType === "professional"
    ? `Professional (${char.careers.length} term${char.careers.length !== 1 ? "s" : ""})`
    : char.charType === "rookie"
    ? `Rookie${char.rookieTemplate ? ` — ${char.rookieTemplate}` : ""}`
    : "Undeclared";

  const lines: string[] = [
    u.util.header("MEKTON ZETA CHARACTER SHEET"),
    u.util.ljust(u.util.sprintf(" %cyName:%cn %-23s %cyAge:%cn %-10d %cyType:%cn %s", char.playerName, char.age, careerLine), 78),
    u.util.ljust(u.util.sprintf(" %cyStatus:%cn %-21s %cyCombat:%cn %s", `%ch${char.chargenStatus.toUpperCase()}%cn`, status), 78),
    "",
    sectionHead(u, "STATS"),
    u.util.sprintf("  %cyATT:%cn  %-9d%cyBOD:%cn  %-9d%cyCL:%cn   %-9d%cyEMP:%cn  %-9d%cyINT:%cn  %-10d", char.stats.att, char.stats.bod, char.stats.cl, char.stats.emp, char.stats.int),
    u.util.sprintf("  %cyLUCK:%cn %-9d%cyMA:%cn   %-9d%cyREF:%cn  %-9d%cyTECH:%cn %-9d%cyEDU:%cn  %-10d", char.stats.luck, char.stats.ma, char.stats.ref, char.stats.tech, char.stats.edu),
    "",
    sectionHead(u, "DERIVED"),
    u.util.sprintf("  %cyHead:%cn  %-8s%cyTorso:%cn %-8s%cyLimbs:%cn %-8s%cyStun:%cn %-9d%cyStability:%cn %-5d", `${d.headHp}H`, `${d.torsoHp}H`, `${d.limbHp}H`, d.stun, d.stability),
    u.util.sprintf("  %cyLift:%cn  %-8s%cyThrow:%cn %-8s%cyDmgBonus:%cn %-5s%cyEV:%cn %-11d%cyEff.MA:%cn %-8d", `${d.lift}kg`, `${d.throwM}m`, `${d.dmgBonus >= 0 ? "+" : ""}${d.dmgBonus}`, d.ev, eff),
    u.util.ljust(u.util.sprintf("  %cySkill Points:%cn   %d total / %d spent / %d remaining", d.skillPoints, spent, d.skillPoints - spent), 78),
    u.util.ljust(u.util.sprintf("  %cyLuck Remaining:%cn %d/%d", char.luckRemaining, char.stats.luck), 78),
  ];

  // Skills by stat
  lines.push("", sectionHead(u, "SKILLS"));
  const skillsByStat: Record<string, string[]> = {};
  for (const [sk, lv] of Object.entries(char.skills)) {
    if (lv === 0) continue;
    skillsByStat["all"] ??= [];
    skillsByStat["all"].push(`${sk} +${lv}`);
  }
  if ((skillsByStat["all"] ?? []).length === 0) {
    lines.push(u.util.ljust("  (none)", 78));
  } else {
    const chunks = skillsByStat["all"] ?? [];
    for (let i = 0; i < chunks.length; i += 3) {
      const slice = chunks.slice(i, i + 3);
      const rowStr = slice.map((item, idx) => {
        if (idx === 0) return u.util.ljust(item, 25);
        if (idx === 1) return u.util.ljust(item, 25);
        return u.util.ljust(item, 26);
      }).join("");
      lines.push("  " + rowStr);
    }
  }

  // Wounds
  lines.push("", sectionHead(u, "WOUNDS"));
  const locs = Object.keys(char.wounds) as (keyof typeof char.wounds)[];
  const maxW = derivedStats(char);
  const locStrings = locs.map((loc) => {
    const label = LOCATION_LABELS[loc as WoundLocation];
    const cur = char.wounds[loc];
    const max = loc === "head" ? maxW.headHp : loc === "torso" ? maxW.torsoHp : maxW.limbHp;
    return `%cy${label}:%cn ${cur}/${max}`;
  });
  for (let i = 0; i < locStrings.length; i += 3) {
    const slice = locStrings.slice(i, i + 3);
    const rowStr = slice.map((item, idx) => {
      if (idx === 0) return u.util.ljust(item, 25);
      if (idx === 1) return u.util.ljust(item, 25);
      return u.util.ljust(item, 26);
    }).join("");
    lines.push("  " + rowStr);
  }

  // Lifepath summary
  if (char.lifepath.parentStatus) {
    lines.push("", sectionHead(u, "LIFEPATH"));
    const col1_1 = u.util.ljust(`%cySocial Status:%cn ${char.lifepath.socialStatus}`, 38);
    const col1_2 = u.util.ljust(`%cyStarting Cash:%cn ¥${char.lifepath.startingCash}`, 38);
    lines.push(`  ${col1_1}${col1_2}`);
    const col2_1 = u.util.ljust(`%cyFamily:%cn ${char.lifepath.parentStatus}`, 38);
    const col2_2 = u.util.ljust(`%cyStanding:%cn ${char.lifepath.familyStanding === "good" ? "Good Standing" : "Bad Standing"}`, 38);
    lines.push(`  ${col2_1}${col2_2}`);
    const col3_1 = u.util.ljust(`%cySiblings:%cn ${char.lifepath.siblings.length}`, 25);
    const col3_2 = u.util.ljust(`%cyFriends:%cn ${char.lifepath.friends.length}`, 25);
    const col3_3 = u.util.ljust(`%cyEnemies:%cn ${char.lifepath.enemies.length}`, 26);
    lines.push(`  ${col3_1}${col3_2}${col3_3}`);
    if (char.lifepath.romance) {
      lines.push(u.util.ljust(`  %cyRomance:%cn ${char.lifepath.romance.status}`, 78));
    }
  }

  // Equipment
  lines.push("", sectionHead(u, `EQUIPMENT  (¥${char.cash} remaining)`));
  if (char.equipment.length === 0) {
    lines.push(u.util.ljust("  (none)", 78));
  } else {
    for (const item of char.equipment) {
      lines.push(u.util.ljust(`  ${item.name} (${item.weight}kg, ¥${item.cost})`, 78));
    }
  }

  lines.push(u.util.footer());
  return lines.join("%r");
}

export function wrapText(text: string, width = 78, indent = "    "): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = indent;
  for (const word of words) {
    const wordClean = word.replace(/%c[a-zA-Z]/g, "").replace(/%[nrtbR]/g, "");
    const curClean = currentLine.replace(/%c[a-zA-Z]/g, "").replace(/%[nrtbR]/g, "");
    if (curClean.length + (curClean.length > indent.length ? 1 : 0) + wordClean.length > width) {
      lines.push(currentLine);
      currentLine = indent + word;
    } else {
      if (currentLine === indent) currentLine += word;
      else currentLine += " " + word;
    }
  }
  if (currentLine.replace(/%c[a-zA-Z]/g, "").replace(/%[nrtbR]/g, "").trim()) {
    lines.push(currentLine);
  }
  return lines;
}
