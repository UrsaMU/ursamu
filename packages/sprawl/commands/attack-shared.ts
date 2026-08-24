/** Shared roll/attack helpers. */
import type { IDBObj } from "@ursamu/ursamu";
import {
  bad,
  dim,
  panelClose,
  panelOpen,
  good,
  val,
  ylw,
} from "./chrome.ts";
import { type StatKey } from "../db/schemas.ts";
import { itemData, itemDataRepaired } from "../engine/items.ts";
import { DIFFICULTY, findByName } from "../engine/catalog.ts";
import type { IDiceResult } from "../engine/dice.ts";
import type { IActionResult } from "../engine/action.ts";

/** Wielded weapon, else first matching firearm/melee/heavy. */
export function pickPrimaryWeapon(
  items: IDBObj[],
  melee: boolean,
): IDBObj | null {
  // itemDataRepaired fixes market kind=gear mints in-place
  const rows = items
    .map((o) => ({
      o,
      d: itemDataRepaired(o) ?? itemData(o),
    }))
    .filter((r) => r.d);
  const kindOk = (k: string) =>
    melee
      ? k === "melee" || k === "weapon"
      : k === "firearm" || k === "heavy" || k === "weapon";
  const wielded = rows.find((r) =>
    r.d!.slot === "wielded" && kindOk(String(r.d!.kind))
  );
  if (wielded) return wielded.o;
  const pref = rows.find((r) =>
    kindOk(String(r.d!.kind)) &&
    (melee
      ? r.d!.kind === "melee"
      : r.d!.kind === "firearm")
  ) ?? rows.find((r) => kindOk(String(r.d!.kind)));
  return pref?.o ?? null;
}

export function parseStat(raw: string): StatKey | null {
  const s = raw.toLowerCase().trim();
  const aliases: Record<string, StatKey> = {
    mor: "morphology",
    morph: "morphology",
    morphology: "morphology",
    equ: "equilibrium",
    eq: "equilibrium",
    equilibrium: "equilibrium",
    rea: "reaction",
    react: "reaction",
    reaction: "reaction",
    cog: "cognition",
    cognition: "cognition",
    aff: "affinity",
    affinity: "affinity",
  };
  return aliases[s] ?? null;
}

export function parseDs(raw: string): number | null {
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 1 && n <= 30) return n;
  const row = findByName(DIFFICULTY, raw);
  if (row && typeof row.ds === "number") return row.ds as number;
  return null;
}

export function parseMods(rest: string): {
  glitch: number;
  upgrade: number;
  bonus: number;
  bg: boolean;
} {
  let glitch = 0;
  let upgrade = 0;
  let bonus = 0;
  let bg = false;
  const tokens = rest.toLowerCase().split(/\s+/).filter(Boolean);
  for (const t of tokens) {
    if (t === "+glitch" || t === "glitch") glitch++;
    else if (t === "+upgrade" || t === "upgrade") upgrade++;
    else if (t === "+bg" || t === "background") bg = true;
    else if (/^\+\d+$/.test(t)) bonus += Number(t.slice(1));
    else if (/^-\d+$/.test(t)) bonus -= Number(t.slice(1));
  }
  return { glitch, upgrade, bonus, bg };
}

export function shortStat(stat: string): string {
  const m: Record<string, string> = {
    morphology: "MOR",
    equilibrium: "EQU",
    reaction: "REA",
    cognition: "COG",
    affinity: "AFF",
  };
  return m[stat] ?? stat.slice(0, 3).toUpperCase();
}

/** Compact dice: [5+5+6]→5+6 upg */
export function shortDice(d: IDiceResult): string {
  const shown = d.dice.join("+");
  const kept = `${d.kept[0]}+${d.kept[1]}`;
  let s = `[${shown}]→${kept}`;
  if (d.explodeBonus) s += ` +${d.explodeBonus}`;
  if (d.mode === "upgrade") s += " upg";
  else if (d.mode === "glitch") s += " glitch";
  return s;
}

export function renderResult(
  title: string,
  r: IActionResult,
  parts: string[],
  opts: { flavor?: string | null } = {},
): string {
  const outcome = r.success
    ? good("OK")
    : bad("FAIL");
  const bonusBit = r.bonuses
    ? `+${val(r.bonuses)} `
    : "";
  const lines = [
    panelOpen(title, `DS${r.ds}`),
    `  ${ylw(shortStat(r.stat))} ${val(r.statValue)} ` +
    `${bonusBit}` +
    `${dim(shortDice(r.dice))}  ` +
    `${val(r.total)} vs ${val(r.ds)} → ${outcome}`,
  ];
  if (parts.length) {
    // One line, compact separators; wrap only if huge
    const modLine = parts.join(" · ");
    if (modLine.length <= 72) {
      lines.push(`  ${dim(modLine)}`);
    } else {
      let row = "";
      for (const p of parts) {
        const next = row ? `${row} · ${p}` : p;
        if (next.length > 72) {
          if (row) lines.push(`  ${dim(row)}`);
          row = p;
        } else {
          row = next;
        }
      }
      if (row) lines.push(`  ${dim(row)}`);
    }
  }
  if (r.damageToTarget) {
    lines.push(
      `  ${good("+" + r.damageToTarget)} margin to target`,
    );
  }
  if (r.damageToSelf) {
    lines.push(
      `  ${bad("-" + r.damageToSelf)} margin to you`,
    );
  }
  if (r.needNerveCheck) {
    lines.push(
      `  ${bad("1,1")} — EQU vs DS10 (nerve)`,
    );
  }
  if (r.dice.doubleSix) {
    lines.push(`  ${good("6,6")} exceptional`);
  }
  const flav = (opts.flavor ?? "").trim();
  if (flav) {
    // Soft cyan prose; wrap long lines at ~74
    const words = flav.split(/\s+/);
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (next.length > 74 && cur) {
        lines.push(`  ${dim(cur)}`);
        cur = w;
      } else cur = next;
    }
    if (cur) lines.push(`  ${dim(cur)}`);
  }
  lines.push(panelClose("SPRAWL"));
  return lines.join("\r\n");
}

