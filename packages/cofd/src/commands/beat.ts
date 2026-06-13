// +beat command: award, subtract, or view Beat pools.
//
// Beats convert to Experience at 5:1 the moment the 5th Beat is logged
// (see docs/xp-beats-spec.md s2). The standard and Arcane tracks are kept
// strictly separate.

import type { IUrsamuSDK } from "@ursamu/ursamu";
import { addBeats } from "../xp/beats.ts";
import {
  refreshAdvantages,
  type CofdSheet,
} from "../stats/index.ts";
import { sendCofdMail } from "../integrations/mail.ts";

/** Parse `/sw1/sw2,sw3` switch tail into a lowercase token set. */
function parseSwitchTokens(raw: string): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .toLowerCase()
      .split(/[/,]/)
      .map(s => s.trim())
      .filter(Boolean),
  );
}

/** Parse `[<player>] [= <reason>]` into target name and reason. */
function parseTargetAndReason(rest: string): { name: string; reason: string } {
  const eq = rest.indexOf("=");
  if (eq < 0) {
    return { name: rest.trim(), reason: "" };
  }
  return {
    name: rest.slice(0, eq).trim(),
    reason: rest.slice(eq + 1).trim(),
  };
}

function poolLine(sheet: CofdSheet): string {
  const isMortal = sheet.template.toLowerCase().trim() === "mortal";
  const base = `Beats: ${sheet.beats ?? 0}/5  Experiences: ${sheet.experience ?? 0}`;
  if (isMortal) return base;
  return `${base}  Arcane Beats: ${sheet.arcaneBeats ?? 0}/5  Arcane XP: ${sheet.arcaneExperience ?? 0}`;
}

export async function beatExec(u: IUrsamuSDK) {
  const swRaw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

  const switches = parseSwitchTokens(swRaw);
  const arcane = switches.has("arcane");

  // First switch token (without 'arcane') is the action.
  let action: string | undefined;
  for (const s of switches) {
    if (s === "arcane") continue;
    action = s;
    break;
  }

  // No switch: view-only (alias for +xp).
  if (!action) {
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
    return;
  }

  if (action !== "add" && action !== "sub") {
    u.send(`Unknown +beat switch '/${action}'. Use /add or /sub.`);
    return;
  }

  const { name, reason } = parseTargetAndReason(rest);
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
    u.send("Permission denied. You cannot modify that player's Beats.");
    return;
  }

  const delta = action === "add" ? 1 : -1;
  const before = refreshAdvantages({ ...sheetRaw });
  const beforeXp = arcane ? (before.arcaneExperience ?? 0) : (before.experience ?? 0);
  const updated = addBeats(before, delta, arcane);
  const afterXp = arcane ? (updated.arcaneExperience ?? 0) : (updated.experience ?? 0);

  await u.db.modify(target.id, "$set", { "data.cofd": updated });

  const targetLabel = sameTarget ? "you" : u.util.displayName(target, u.me);
  const verb = action === "add" ? "Awarded" : "Subtracted";
  const track = arcane ? "Arcane Beat" : "Beat";
  const reasonSuffix = reason ? ` (${reason})` : "";
  u.send(`${verb} 1 ${track} ${action === "add" ? "to" : "from"} ${targetLabel}.${reasonSuffix}`);

  if (action === "add" && afterXp > beforeXp) {
    const gained = afterXp - beforeXp;
    const xpLabel = arcane ? "Arcane Experience" : "Experience";
    u.send(`  +${gained} ${xpLabel} earned!`);
  }

  u.send(`  ${poolLine(updated)}`);

  if (action === "add" && !sameTarget) {
    const staffName = u.util.displayName(u.me, u.me);
    const track = arcane ? "Arcane Beat" : "Beat";
    const xpGained = afterXp - beforeXp;
    const xpLabel = arcane ? "Arcane Experience" : "Experience";
    const bodyLines = [
      `${staffName} awarded you 1 ${track}.`,
    ];
    if (reason) bodyLines.push(`Reason: ${reason}`);
    if (xpGained > 0) bodyLines.push(`That rolled over into +${xpGained} ${xpLabel}.`);
    bodyLines.push(``, `Use +xp to view your pools or +xp/spend to advance traits.`);
    await sendCofdMail({
      to: target.id,
      subject: `${track} awarded${reason ? `: ${reason}` : ""}`,
      body: bodyLines.join("\n"),
    });
  }
}
