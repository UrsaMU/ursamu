// +xp command: view pools, spend XP to raise traits, and show the cost table.

import { divider, type IUrsamuSDK } from "@ursamu/ursamu";
import { spendXp } from "../xp/spend.ts";
import { XP_COSTS } from "../xp/costs.ts";
import type { CofdSheet } from "../stats/index.ts";

function poolLine(sheet: CofdSheet): string {
  const isMortal = sheet.template.toLowerCase().trim() === "mortal";
  const base = `Beats: ${sheet.beats ?? 0}/5  Experiences: ${sheet.experience ?? 0}`;
  if (isMortal) return base;
  return `${base}  Arcane Beats: ${sheet.arcaneBeats ?? 0}/5  Arcane XP: ${sheet.arcaneExperience ?? 0}`;
}

/** Split `<trait>=<dots> [for <player>]` into its three parts. */
function parseSpendArgs(rest: string): {
  trait: string;
  dots: number;
  targetName: string;
  error?: string;
} {
  // Pull off the optional " for <player>" tail before splitting on '='.
  let body = rest;
  let targetName = "";
  const forIdx = body.toLowerCase().lastIndexOf(" for ");
  if (forIdx >= 0) {
    targetName = body.slice(forIdx + 5).trim();
    body = body.slice(0, forIdx).trim();
  }
  const eq = body.indexOf("=");
  if (eq < 0) {
    return { trait: "", dots: 0, targetName, error: "Usage: +xp/spend <trait>=<targetDots> [for <player>]" };
  }
  const trait = body.slice(0, eq).trim();
  const dotsStr = body.slice(eq + 1).trim();
  const dots = parseInt(dotsStr, 10);
  if (!trait || isNaN(dots) || dots <= 0) {
    return { trait, dots: 0, targetName, error: "Target dots must be a positive integer." };
  }
  return { trait, dots, targetName };
}

async function xpView(u: IUrsamuSDK, rest: string) {
  const targetName = rest;
  const target = targetName ? await u.util.target(u.me, targetName, true) : u.me;
  if (!target) {
    u.send(`Player '${targetName}' not found.`);
    return;
  }
  const sheet = target.state?.cofd as CofdSheet | undefined;
  if (!sheet) {
    u.send("That player does not have an approved character sheet yet.");
    return;
  }
  u.send(`  %ch${u.util.displayName(target, u.me)}:%cn ${poolLine(sheet)}`);
}

async function xpSpend(u: IUrsamuSDK, rest: string) {
  const parsed = parseSpendArgs(rest);
  if (parsed.error) {
    u.send(parsed.error);
    return;
  }

  const target = parsed.targetName
    ? await u.util.target(u.me, parsed.targetName, true)
    : u.me;
  if (!target) {
    u.send(`Player '${parsed.targetName}' not found.`);
    return;
  }
  const sheetRaw = target.state?.cofd as CofdSheet | undefined;
  if (!sheetRaw) {
    u.send("That player does not have an approved character sheet yet.");
    return;
  }

  const sameTarget = target.id === u.me.id;
  if (!sameTarget && !(await u.canEdit(u.me, target))) {
    u.send("Permission denied. You cannot spend XP on that player.");
    return;
  }

  const result = spendXp(sheetRaw, parsed.trait, parsed.dots);
  if (result.error || !result.sheet) {
    u.send(`Error: ${result.error ?? "Unable to spend XP."}`);
    return;
  }

  await u.db.modify(target.id, "$set", { "data.cofd": result.sheet });

  const pool = result.arcane
    ? (result.sheet.arcaneExperience ?? 0)
    : (result.sheet.experience ?? 0);
  const poolLabel = result.arcane ? "Arcane XP" : "XP";
  const targetLabel = sameTarget ? "your" : `${u.util.displayName(target, u.me)}'s`;
  u.send(
    `Raised ${targetLabel} ${parsed.trait} to ${parsed.dots} dots for ${result.cost} ${poolLabel}. Remaining ${poolLabel}: ${pool}.`,
  );
}

async function xpList(u: IUrsamuSDK) {
  const lines: string[] = [];
  lines.push(await divider("X P   C O S T   T A B L E"));
  lines.push(`  %chTrait Type%cn          %chCost%cn       %chPool%cn`);
  for (const [name, entry] of Object.entries(XP_COSTS.costs)) {
    const cost = typeof entry.costFlat === "number"
      ? `${entry.costFlat} flat`
      : `${entry.costPerDot} / dot`;
    const pool = entry.arcane ? "Arcane" : "Standard";
    lines.push(`  ${name.padEnd(22)}${cost.padEnd(11)}${pool}`);
  }
  lines.push(``);
  lines.push(`  %chConversion:%cn ${XP_COSTS.conversion.beatsPerExperience} Beats = 1 Experience (Arcane track: same ratio).`);
  u.send(lines.join("\n"));
}

export async function xpExec(u: IUrsamuSDK) {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

  if (sw === "spend") {
    await xpSpend(u, rest);
    return;
  }
  if (sw === "list") {
    await xpList(u);
    return;
  }
  if (sw && sw !== "view") {
    u.send(`Unknown +xp switch '/${sw}'. Use /spend or /list.`);
    return;
  }
  await xpView(u, rest);
}
