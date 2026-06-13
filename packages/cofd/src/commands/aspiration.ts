// +aspiration command: view, add, remove, fulfill Aspirations.
//
// Fulfilling an Aspiration awards 1 Beat. Removal is correctional. The cap
// of three (3) active Aspirations is enforced in `addAspiration`. Compound
// switches `/add/long` set the long-term flag; default is short-term.

import { divider, type IUrsamuSDK } from "@ursamu/ursamu";
import {
  addAspiration,
  AspirationCapacityError,
  fulfillAspiration,
  MAX_ASPIRATIONS,
  removeAspiration,
} from "../subsystems/aspirations.ts";
import type { CofdSheet } from "../stats/index.ts";

/** Pull off a trailing " for <player>" suffix. */
function splitForTarget(rest: string): { body: string; target: string } {
  const idx = rest.toLowerCase().lastIndexOf(" for ");
  if (idx < 0) return { body: rest.trim(), target: "" };
  return {
    body: rest.slice(0, idx).trim(),
    target: rest.slice(idx + 5).trim(),
  };
}

function poolLine(sheet: CofdSheet): string {
  const isMortal = sheet.template.toLowerCase().trim() === "mortal";
  const base = `Beats: ${sheet.beats ?? 0}/5  Experiences: ${sheet.experience ?? 0}`;
  if (isMortal) return base;
  return `${base}  Arcane Beats: ${sheet.arcaneBeats ?? 0}/5  Arcane XP: ${sheet.arcaneExperience ?? 0}`;
}

async function renderAspirationList(u: IUrsamuSDK, sheet: CofdSheet, label: string) {
  const list = sheet.aspirations ?? [];
  const lines: string[] = [];
  lines.push(await divider("A S P I R A T I O N S"));
  if (list.length === 0) {
    lines.push(`  ${label} has no active Aspirations.`);
  } else {
    list.forEach((a, i) => {
      const tag = a.shortTerm ? "[S]" : "[L]";
      lines.push(`  ${i + 1}. ${tag} ${a.text}`);
    });
  }
  u.send(lines.join("\n"));
}

async function aspirationView(u: IUrsamuSDK, rest: string) {
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
  await renderAspirationList(u, sheet, u.util.displayName(target, u.me));
}

async function aspirationAdd(u: IUrsamuSDK, rest: string, longTerm: boolean) {
  const { body, target: targetName } = splitForTarget(rest);
  if (!body) {
    u.send("Usage: +aspiration/add[/long] <text> [for <player>]");
    return;
  }
  const target = targetName ? await u.util.target(u.me, targetName, true) : u.me;
  if (!target) {
    u.send(`Player '${targetName}' not found.`);
    return;
  }
  const sheetRaw = target.state?.cofd as CofdSheet | undefined;
  if (!sheetRaw) {
    u.send("That player does not have an approved character sheet yet.");
    return;
  }
  const sameTarget = target.id === u.me.id;
  if (!sameTarget && !(await u.canEdit(u.me, target))) {
    u.send("Permission denied. You cannot modify that player's Aspirations.");
    return;
  }

  let updated: CofdSheet;
  try {
    updated = addAspiration(sheetRaw, body, !longTerm);
  } catch (err) {
    if (err instanceof AspirationCapacityError) {
      u.send(`Error: maximum ${MAX_ASPIRATIONS} active Aspirations reached. Remove or fulfill one first.`);
      return;
    }
    u.send(`Error: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  await u.db.modify(target.id, "$set", { "data.cofd": updated });

  const targetLabel = sameTarget ? "your" : `${u.util.displayName(target, u.me)}'s`;
  const kind = longTerm ? "long-term" : "short-term";
  u.send(`Added ${kind} Aspiration to ${targetLabel} sheet.`);
  await renderAspirationList(u, updated, u.util.displayName(target, u.me));
}

async function aspirationRemove(u: IUrsamuSDK, rest: string) {
  const { body, target: targetName } = splitForTarget(rest);
  const idx = parseInt(body, 10) - 1;
  if (!Number.isFinite(idx) || idx < 0) {
    u.send("Usage: +aspiration/remove <#> [for <player>]");
    return;
  }
  const target = targetName ? await u.util.target(u.me, targetName, true) : u.me;
  if (!target) {
    u.send(`Player '${targetName}' not found.`);
    return;
  }
  const sheetRaw = target.state?.cofd as CofdSheet | undefined;
  if (!sheetRaw) {
    u.send("That player does not have an approved character sheet yet.");
    return;
  }
  const sameTarget = target.id === u.me.id;
  if (!sameTarget && !(await u.canEdit(u.me, target))) {
    u.send("Permission denied. You cannot modify that player's Aspirations.");
    return;
  }
  const list = sheetRaw.aspirations ?? [];
  if (idx >= list.length) {
    u.send(`No Aspiration at slot ${idx + 1}.`);
    return;
  }

  const updated = removeAspiration(sheetRaw, idx);
  await u.db.modify(target.id, "$set", { "data.cofd": updated });

  const targetLabel = sameTarget ? "your" : `${u.util.displayName(target, u.me)}'s`;
  u.send(`Removed Aspiration ${idx + 1} from ${targetLabel} sheet (no Beat awarded).`);
  await renderAspirationList(u, updated, u.util.displayName(target, u.me));
}

async function aspirationFulfill(u: IUrsamuSDK, rest: string) {
  const { body, target: targetName } = splitForTarget(rest);
  const idx = parseInt(body, 10) - 1;
  if (!Number.isFinite(idx) || idx < 0) {
    u.send("Usage: +aspiration/fulfill <#> [for <player>]");
    return;
  }
  const target = targetName ? await u.util.target(u.me, targetName, true) : u.me;
  if (!target) {
    u.send(`Player '${targetName}' not found.`);
    return;
  }
  const sheetRaw = target.state?.cofd as CofdSheet | undefined;
  if (!sheetRaw) {
    u.send("That player does not have an approved character sheet yet.");
    return;
  }
  const sameTarget = target.id === u.me.id;
  if (!sameTarget && !(await u.canEdit(u.me, target))) {
    u.send("Permission denied. You cannot modify that player's Aspirations.");
    return;
  }
  const list = sheetRaw.aspirations ?? [];
  if (idx >= list.length) {
    u.send(`No Aspiration at slot ${idx + 1}.`);
    return;
  }

  const beforeXp = sheetRaw.experience ?? 0;
  const result = fulfillAspiration(sheetRaw, idx);
  await u.db.modify(target.id, "$set", { "data.cofd": result.sheet });

  const targetLabel = sameTarget ? "your" : `${u.util.displayName(target, u.me)}'s`;
  if (result.beatsAwarded > 0) {
    u.send(`Fulfilled Aspiration ${idx + 1} on ${targetLabel} sheet. +${result.beatsAwarded} Beat awarded!`);
    const afterXp = result.sheet.experience ?? 0;
    if (afterXp > beforeXp) {
      u.send(`  +${afterXp - beforeXp} Experience earned!`);
    }
    u.send(`  ${poolLine(result.sheet)}`);
  } else {
    u.send(`No Aspiration at slot ${idx + 1}.`);
  }
  await renderAspirationList(u, result.sheet, u.util.displayName(target, u.me));
}

export async function aspirationExec(u: IUrsamuSDK) {
  const swRaw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

  // Split compound switches on '/' so `+aspiration/add/long` -> ["add", "long"].
  const tokens = swRaw ? swRaw.split("/").map((s) => s.trim()).filter(Boolean) : [];
  if (tokens.length === 0) {
    await aspirationView(u, rest);
    return;
  }

  const action = tokens[0];
  const modifiers = new Set(tokens.slice(1));

  switch (action) {
    case "view":
      await aspirationView(u, rest);
      return;
    case "add": {
      const longTerm = modifiers.has("long") || modifiers.has("long-term");
      await aspirationAdd(u, rest, longTerm);
      return;
    }
    case "remove":
    case "rem":
      await aspirationRemove(u, rest);
      return;
    case "fulfill":
      await aspirationFulfill(u, rest);
      return;
    default:
      u.send(`Unknown +aspiration switch '/${action}'. Use /add[/long], /remove, or /fulfill.`);
  }
}
