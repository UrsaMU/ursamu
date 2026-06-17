// +integrity command: view Integrity, trigger a Breaking Point roll, or
// adjust the track directly (ST).
//
// Syntax:
//   +integrity                                view own
//   +integrity <player>                       view another's
//   +integrity/break <reason>                 self-trigger a Breaking Point
//   +integrity/break <reason> +N|-N           with a situational modifier
//   +integrity/break <player>=<reason>        ST-initiated for another player
//   +integrity/break <player>=<reason> +N     with modifier
//   +integrity/set <n> [for <player>]         ST: adjust Integrity rating
//
// Cross-player /break and /set require canEdit (builder+). Granted
// Conditions feed straight into the existing +condition catalog.

import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  refreshAdvantages,
  type CofdSheet,
} from "../stats/index.ts";
import { lookupCondition } from "../subsystems/conditions.ts";
import {
  applyBreakingPoint,
  rollBreakingPoint,
  type BreakingPointResult,
} from "../integrity/engine.ts";

/** Pull a trailing "+N" / "-N" modifier off a reason string. */
function extractModifier(rest: string): { body: string; modifier: number } {
  const m = rest.match(/\s+([+\-]\d+)\s*$/);
  if (!m) return { body: rest.trim(), modifier: 0 };
  const mod = parseInt(m[1], 10);
  if (Number.isNaN(mod)) return { body: rest.trim(), modifier: 0 };
  return { body: rest.slice(0, m.index).trim(), modifier: mod };
}

/** Parse `[<player>=]<reason> [+N|-N]` into target name, reason, modifier. */
function parseBreakArgs(
  rest: string,
): { name: string; reason: string; modifier: number } {
  const eq = rest.indexOf("=");
  if (eq < 0) {
    const { body, modifier } = extractModifier(rest);
    return { name: "", reason: body, modifier };
  }
  const name = rest.slice(0, eq).trim();
  const tail = rest.slice(eq + 1);
  const { body, modifier } = extractModifier(tail);
  return { name, reason: body, modifier };
}

/** Parse `<n> [for <player>]` for /set. */
function parseSetArgs(rest: string): { name: string; raw: string } {
  const idx = rest.toLowerCase().lastIndexOf(" for ");
  if (idx < 0) return { name: "", raw: rest.trim() };
  return {
    name: rest.slice(idx + 5).trim(),
    raw: rest.slice(0, idx).trim(),
  };
}

function dots(value: number, max = 10): string {
  const v = Math.max(0, Math.min(max, value | 0));
  return "*".repeat(v) + ".".repeat(max - v);
}

function viewLine(sheet: CofdSheet, label: string): string {
  const n = sheet.moralityValue | 0;
  return `${label}  Integrity: ${n}/10  [${dots(n)}]`;
}

function outcomeLabel(o: BreakingPointResult["outcome"]): string {
  switch (o) {
    case "dramatic":    return "DRAMATIC FAILURE";
    case "failure":     return "FAILURE";
    case "success":     return "SUCCESS";
    case "exceptional": return "EXCEPTIONAL SUCCESS";
  }
}

async function viewIntegrity(u: IUrsamuSDK, arg: string) {
  const target = arg ? await u.util.target(u.me, arg, true) : u.me;
  if (!target) {
    u.send(`Player '${arg}' not found.`);
    return;
  }
  const sheet = target.state?.cofd as CofdSheet | undefined;
  if (!sheet) {
    u.send("That player does not have an approved character sheet yet.");
    return;
  }
  const label = target.id === u.me.id
    ? "Your"
    : `${u.util.displayName(target, u.me)}'s`;
  u.send(viewLine(sheet, label));
}

async function breakingPoint(u: IUrsamuSDK, rest: string) {
  if (!rest) {
    u.send("Usage: +integrity/break <reason> [+/-N]  or  +integrity/break <player>=<reason> [+/-N]");
    return;
  }
  const { name, reason, modifier } = parseBreakArgs(rest);
  if (!reason) {
    u.send("A reason for the breaking point is required.");
    return;
  }

  const target = name ? await u.util.target(u.me, name, true) : u.me;
  if (!target) {
    u.send(`Player '${name}' not found.`);
    return;
  }

  const sheetRaw = target.state?.cofd as CofdSheet | undefined;
  if (!sheetRaw) {
    u.send("That player does not have an approved character sheet yet.");
    return;
  }

  const sameTarget = target.id === u.me.id;
  if (!sameTarget && !(await u.canEdit(u.me, target))) {
    u.send("Permission denied. Only staff may invoke a breaking point for another player.");
    return;
  }

  const sheet = refreshAdvantages({ ...sheetRaw });
  const result = rollBreakingPoint({
    integrity: sheet.moralityValue | 0,
    resolve: sheet.attributes.resolve | 0,
    composure: sheet.attributes.composure | 0,
    modifier,
  }, sheet);

  const updated = applyBreakingPoint(sheet, result);
  await u.db.modify(target.id, "$set", { "data.cofd": updated });

  const targetLabel = sameTarget
    ? "You suffer a breaking point."
    : `${u.util.displayName(target, u.me)} suffers a breaking point.`;
  const sign = modifier >= 0 ? `+${modifier}` : `${modifier}`;
  const modBreak = modifier !== 0
    ? `Resolve(${sheet.attributes.resolve}) + Composure(${sheet.attributes.composure}) + IntegrityMod(${result.integrityMod >= 0 ? "+" : ""}${result.integrityMod}) ${sign}`
    : `Resolve(${sheet.attributes.resolve}) + Composure(${sheet.attributes.composure}) + IntegrityMod(${result.integrityMod >= 0 ? "+" : ""}${result.integrityMod})`;

  u.send(`%ch${targetLabel}%cn`);
  u.send(`  Pool   : ${modBreak} = ${Math.max(0, result.pool)} dice${result.roll.isChanceDie ? " (chance die)" : ""}`);
  u.send(`  Roll   : ${result.roll.rolls.join(", ")}  -> ${result.roll.successes} success${result.roll.successes === 1 ? "" : "es"}`);
  u.send(`  Outcome: %ch${outcomeLabel(result.outcome)}%cn`);
  u.send(`  Reason : ${reason}`);

  if (result.integrityLoss > 0) {
    u.send(`  Integrity: ${(sheet.moralityValue | 0)} -> ${updated.moralityValue | 0}`);
  } else {
    u.send(`  Integrity: ${updated.moralityValue | 0}/10 (unchanged)`);
  }

  for (const key of result.conditionsGranted) {
    const entry = lookupCondition(key);
    const name = entry?.name ?? key;
    const already = (sheetRaw.conditions ?? []).some(c => c.key === key);
    if (already) {
      u.send(`  Condition: ${name} (already active -- no change)`);
    } else {
      u.send(`  Condition: ${name} applied.`);
    }
  }

  if (result.willpowerRegained > 0) {
    const before = sheet.advantages.willpowerCurrent | 0;
    const after = updated.advantages.willpowerCurrent | 0;
    if (after > before) {
      u.send(`  Willpower: ${before} -> ${after} (+${after - before} regained)`);
    } else {
      u.send(`  Willpower: ${after}/${updated.advantages.willpowerMax} (already full)`);
    }
  }

  if (result.beatsAwarded > 0) {
    u.send(`  +${result.beatsAwarded} Beat awarded.`);
  }
}

async function setIntegrity(u: IUrsamuSDK, rest: string) {
  const { name, raw } = parseSetArgs(rest);
  if (!raw) {
    u.send("Usage: +integrity/set <0-10> [for <player>]");
    return;
  }
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0 || n > 10) {
    u.send("Integrity must be an integer from 0 to 10.");
    return;
  }

  const target = name ? await u.util.target(u.me, name, true) : u.me;
  if (!target) {
    u.send(`Player '${name}' not found.`);
    return;
  }
  const sheetRaw = target.state?.cofd as CofdSheet | undefined;
  if (!sheetRaw) {
    u.send("That player does not have an approved character sheet yet.");
    return;
  }

  const sameTarget = target.id === u.me.id;
  if (!sameTarget && !(await u.canEdit(u.me, target))) {
    u.send("Permission denied. Only staff may adjust another player's Integrity.");
    return;
  }

  const updated: CofdSheet = { ...sheetRaw, moralityValue: n };
  await u.db.modify(target.id, "$set", { "data.cofd": updated });

  const label = sameTarget ? "Your" : `${u.util.displayName(target, u.me)}'s`;
  u.send(`${label} Integrity set to ${n}/10.`);
}

export async function integrityExec(u: IUrsamuSDK) {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

  switch (sw) {
    case "":
      await viewIntegrity(u, rest);
      return;
    case "break":
      await breakingPoint(u, rest);
      return;
    case "set":
      await setIntegrity(u, rest);
      return;
    default:
      u.send(`Unknown +integrity switch '/${sw}'. Use /break or /set.`);
  }
}
