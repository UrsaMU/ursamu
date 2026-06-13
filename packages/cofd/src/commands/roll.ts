// +roll command implementation. Output is a single compact line:
//
//   ROLL>> Marcus rolls strength+brawl  5d (3 7 8 9 10) -> 2 successes (Success)
//
// Variants:
//   /wp /rote /9again /8again -- appear in the "rolls" verb prefix
//   chance die                 -- shows "chance" instead of "Nd"
//   rote rerolls               -- appended as "rote(...)" after the main dice
//   willpower spend            -- "rolls/wp" prefix

import type { IUrsamuSDK } from "@ursamu/ursamu";
import { defaultSheet, type CofdSheet } from "../stats/index.ts";
import { parseRollExpression, executeRoll, type AgainThreshold } from "../roller/index.ts";
import { equippedWeaponEntry } from "../equipment/index.ts";

/** Short forms used for compact broadcast lines (under 78 cols). */
const COMPACT_ABBREV: Record<string, string> = {
  strength: "Str", dexterity: "Dex", stamina: "Sta",
  intelligence: "Int", wits: "Wit", resolve: "Res",
  presence: "Pre", manipulation: "Man", composure: "Com",
  willpower: "WP",
};

/**
 * Build a compact roll expression for the broadcast line. Drops the per-trait
 * `(N)` annotations, replaces canonical attribute names with their three-letter
 * short forms, and collapses any equipped-weapon term to a bare "wpn" token so
 * the broadcast stays under 78 columns even with long weapon names.
 */
export function compactRollExpr(
  terms: string[],
  opts: { spentWp: boolean; useWeapon: boolean },
): string {
  const out: string[] = [];
  for (const raw of terms) {
    // Strip trailing "(...)" annotations the parser appends.
    const bare = raw.replace(/\s*\([^)]*\)\s*$/, "").trim();
    const key = bare.toLowerCase();
    if (COMPACT_ABBREV[key]) {
      out.push(COMPACT_ABBREV[key]);
    } else {
      // Title-case lowercase trait names for friendly display.
      out.push(bare.replace(/\b([a-z])/g, (_m, c) => c.toUpperCase()));
    }
  }
  if (opts.spentWp) out.push("WP");
  if (opts.useWeapon) out.push("wpn");
  return out.join("+");
}

export async function rollExec(u: IUrsamuSDK) {
  const swRaw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const expr = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

  if (!expr) {
    u.send("Usage: +roll[/wp][/rote][/9again|/8again] <expression> (e.g. Strength+Brawl+2)");
    return;
  }

  // Multi-switch: split on / or , so users can stack /wp/rote/9again, etc.
  const switches = swRaw
    ? swRaw.split(/[\/,]/).map((s) => s.trim()).filter(Boolean)
    : [];

  let wantWp = false;
  let rote = false;
  let useWeapon = false;
  let again: AgainThreshold = 10;

  for (const sw of switches) {
    if (sw === "wp" || sw === "willpower") {
      wantWp = true;
    } else if (sw === "rote") {
      rote = true;
    } else if (sw === "weapon") {
      useWeapon = true;
    } else if (sw === "9again" || sw === "9-again") {
      again = 9;
    } else if (sw === "8again" || sw === "8-again") {
      again = 8;
    } else {
      u.send(`Error: Unknown switch '/${sw}'. Valid: /wp, /rote, /weapon, /9again, /8again.`);
      return;
    }
  }

  const sheet = (u.me.state?.cofd as CofdSheet) || defaultSheet();
  let wpBonus = 0;
  let spentWp = false;

  if (wantWp) {
    if (sheet.advantages.willpowerCurrent < 1) {
      u.send("Error: You do not have any Willpower left to spend.");
      return;
    }
    sheet.advantages.willpowerCurrent -= 1;
    wpBonus = 3;
    spentWp = true;
    await u.db.modify(u.me.id, "$set", { "data.cofd": sheet });
  }

  const parsed = parseRollExpression(expr, sheet);
  if (parsed.error) {
    u.send(`Error: ${parsed.error}`);
    return;
  }

  const finalPool = parsed.pool + wpBonus;
  const result = executeRoll(finalPool, { again, rote });

  // /weapon: add equipped weapon damage as bonus successes on a hit (>=1
  // success). Per CoFD core, weapon damage is "bonus successes added to a
  // successful attack" -- no hit, no bonus. Chance-die successes count too.
  let weaponBonus = 0;
  let weaponName: string | null = null;
  if (useWeapon) {
    const wi = await equippedWeaponEntry(u, sheet.equipment?.equippedWeapon ?? null);
    const w = wi?.entry ?? null;
    if (!w) {
      u.send("Error: No weapon equipped. Use +gear/equip <#> first.");
      return;
    }
    if (result.successes > 0) {
      weaponBonus = w.damage;
      result.successes += w.damage;
      // Re-evaluate exceptional success after weapon bonus (per RAW, 5+ total).
      if (result.successes >= 5) result.exceptional = true;
    }
    weaponName = w.name;
  }

  // Build the switch-suffix on "rolls" -- e.g. "rolls/rote/9again". The
  // /wp and /weapon switches are intentionally omitted here because they
  // already appear as the bare "WP" / "wpn" tokens in the compact roll
  // expression, and duplicating them would push the broadcast past 78 cols.
  const verbSwitches: string[] = [];
  if (result.rote && !result.isChanceDie) verbSwitches.push("rote");
  if (!result.isChanceDie && result.again !== 10) verbSwitches.push(`${result.again}again`);
  const verb = verbSwitches.length ? `rolls/${verbSwitches.join("/")}` : "rolls";

  // Dice display: "5d (3 7 8 9 10)" or "chance (1)".
  const diceList = result.rolls.join(" ");
  const diceBlock = result.isChanceDie
    ? `chance (${diceList})`
    : `${finalPool}d (${diceList})`;

  // Optional rote rerolls trailing the dice block.
  const roteBlock = (result.roteRerolls && result.roteRerolls.length > 0)
    ? ` rote(${result.roteRerolls.join(" ")})`
    : "";

  // Outcome label + color.
  let outcomeLabel = "Failure";
  let outcomeColor = "%ch%cx";
  if (result.exceptional) {
    outcomeLabel = "Exceptional";
    outcomeColor = "%ch%cg";
  } else if (result.successes > 0) {
    outcomeLabel = "Success";
    outcomeColor = "%ch%cc";
  } else if (result.dramaticFailure) {
    outcomeLabel = "Dramatic Failure";
    outcomeColor = "%ch%cr";
  }

  const name = u.util.displayName(u.me, u.me);

  // weaponName / weaponBonus are computed earlier for the damage math; they
  // do not appear in the broadcast line because long weapon names blew past
  // the 78-col MUSH window. The "wpn" token in the compact expression is the
  // visible signal that a weapon bonus was applied.
  void weaponName;
  void weaponBonus;
  const compactExpr = compactRollExpr(parsed.terms, { spentWp, useWeapon });
  const successWord = result.successes === 1 ? "success" : "successes";

  const buildLine = (exprStr: string) =>
    `%ch%ccROLL>>%cn ${name} ${verb} %ch${exprStr}%cn ` +
    `${diceBlock}${roteBlock} -> %ch%cy${result.successes}%cn ${successWord} ` +
    `(${outcomeColor}${outcomeLabel}%cn)`;

  // Both lines use the compact expression so the broadcast stays under 78
  // chars even with weapon bonuses.
  const verboseLine = buildLine(compactExpr);
  const bareLine    = buildLine(compactExpr);

  // The roller and anyone who can edit the roller (STs, builders) see the
  // verbose form with trait values. Everyone else in the room sees the
  // bare expression.
  u.send(verboseLine);

  const meId = u.me.id;
  const occupants = (u.here?.contents ?? [])
    .filter((o) =>
      o &&
      o !== u.me &&
      o.id !== meId &&
      typeof o.flags?.has === "function" &&
      o.flags.has("player")
    );

  for (const observer of occupants) {
    let line = bareLine;
    try {
      if (await u.canEdit(observer, u.me)) line = verboseLine;
    } catch {
      // canEdit can fail in test/mock environments -- default to bare.
    }
    u.send(line, observer.id);
  }
}
