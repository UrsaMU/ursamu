// +condition command: view, add, remove, resolve Conditions and Tilts.
//
// Resolution awards the catalog-specified Beats; removal is correctional and
// awards none. Cross-player edits require canEdit (builder+).

import { divider, type IUrsamuSDK } from "@ursamu/ursamu";
import {
  addCondition,
  CONDITIONS,
  lookupCondition,
  removeCondition,
  resolveCondition,
} from "../subsystems/conditions.ts";
import type { CofdSheet } from "../stats/index.ts";

/** Pull off a trailing " for <player>" suffix. Returns [body, target]. */
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

async function renderConditionList(u: IUrsamuSDK, _target: { id: string }, sheet: CofdSheet, label: string) {
  const list = sheet.conditions ?? [];
  const lines: string[] = [];
  lines.push(await divider("C O N D I T I O N S"));
  if (list.length === 0) {
    lines.push(`  ${label} has no active Conditions.`);
  } else {
    for (const c of list) {
      const entry = lookupCondition(c.key);
      const name = entry?.name ?? c.key;
      const desc = c.note ?? entry?.description ?? "";
      lines.push(`  ${name.padEnd(20)} ${desc}`);
    }
  }
  u.send(lines.join("\n"));
}

async function conditionView(u: IUrsamuSDK, rest: string) {
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
  await renderConditionList(u, target, sheet, u.util.displayName(target, u.me));
}

async function conditionAdd(u: IUrsamuSDK, rest: string) {
  const { body, target: targetName } = splitForTarget(rest);
  // Body is "<key>[/<note>]"
  const slash = body.indexOf("/");
  const key = (slash >= 0 ? body.slice(0, slash) : body).trim();
  const note = slash >= 0 ? body.slice(slash + 1).trim() : "";

  if (!key) {
    u.send("Usage: +condition/add <key>[/<note>] [for <player>]");
    return;
  }
  if (!lookupCondition(key)) {
    u.send(`Unknown condition '${key}'. See +condition/list for available keys.`);
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
    u.send("Permission denied. You cannot modify that player's Conditions.");
    return;
  }

  const updated = addCondition(sheetRaw, key, note || undefined);
  await u.db.modify(target.id, "$set", { "data.cofd": updated });

  const entry = lookupCondition(key)!;
  const targetLabel = sameTarget ? "you" : u.util.displayName(target, u.me);
  u.send(`Applied %ch${entry.name}%cn to ${targetLabel}.`);
  await renderConditionList(u, target, updated, u.util.displayName(target, u.me));
}

async function conditionRemove(u: IUrsamuSDK, rest: string) {
  const { body, target: targetName } = splitForTarget(rest);
  const key = body.trim();
  if (!key) {
    u.send("Usage: +condition/remove <key> [for <player>]");
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
    u.send("Permission denied. You cannot modify that player's Conditions.");
    return;
  }

  const updated = removeCondition(sheetRaw, key);
  await u.db.modify(target.id, "$set", { "data.cofd": updated });

  const name = lookupCondition(key)?.name ?? key;
  const targetLabel = sameTarget ? "you" : u.util.displayName(target, u.me);
  u.send(`Removed %ch${name}%cn from ${targetLabel} (no Beat awarded).`);
  await renderConditionList(u, target, updated, u.util.displayName(target, u.me));
}

async function conditionResolve(u: IUrsamuSDK, rest: string) {
  const { body, target: targetName } = splitForTarget(rest);
  const key = body.trim();
  if (!key) {
    u.send("Usage: +condition/resolve <key> [for <player>]");
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
    u.send("Permission denied. You cannot modify that player's Conditions.");
    return;
  }

  const beforeXp = sheetRaw.experience ?? 0;
  const result = resolveCondition(sheetRaw, key);
  await u.db.modify(target.id, "$set", { "data.cofd": result.sheet });

  const name = lookupCondition(key)?.name ?? key;
  const targetLabel = sameTarget ? "you" : u.util.displayName(target, u.me);

  if (result.beatsAwarded <= 0) {
    if (!sheetRaw.conditions?.some((c) => c.key === key.toLowerCase().trim())) {
      u.send(`${targetLabel} is not currently affected by %ch${name}%cn.`);
    } else {
      u.send(`Resolved %ch${name}%cn on ${targetLabel}. No Beat awarded (Tilt or no-beat entry).`);
    }
    await renderConditionList(u, target, result.sheet, u.util.displayName(target, u.me));
    return;
  }

  u.send(`Resolved %ch${name}%cn on ${targetLabel}. +${result.beatsAwarded} Beat awarded!`);
  const afterXp = result.sheet.experience ?? 0;
  if (afterXp > beforeXp) {
    u.send(`  +${afterXp - beforeXp} Experience earned!`);
  }
  u.send(`  ${poolLine(result.sheet)}`);
  await renderConditionList(u, target, result.sheet, u.util.displayName(target, u.me));
}

async function conditionList(u: IUrsamuSDK) {
  const lines: string[] = [];
  lines.push(await divider("C O N D I T I O N   C A T A L O G"));
  const keys = Object.keys(CONDITIONS).sort();
  for (const k of keys) {
    const entry = CONDITIONS[k];
    const cat = entry.category === "condition"
      ? "Cond"
      : entry.category === "tilt-personal"
      ? "Tilt-P"
      : "Tilt-E";
    const persist = entry.persistent ? "*" : " ";
    lines.push(`  ${k.padEnd(22)} ${cat.padEnd(7)} ${persist} ${entry.name}`);
  }
  lines.push(``);
  lines.push(`  Legend: Cond=Condition, Tilt-P=Personal Tilt, Tilt-E=Environmental Tilt. * = Persistent.`);
  u.send(lines.join("\n"));
}

export async function conditionExec(u: IUrsamuSDK) {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

  if (!sw) {
    await conditionView(u, rest);
    return;
  }
  switch (sw) {
    case "view":
      await conditionView(u, rest);
      return;
    case "add":
      await conditionAdd(u, rest);
      return;
    case "remove":
    case "rem":
      await conditionRemove(u, rest);
      return;
    case "resolve":
      await conditionResolve(u, rest);
      return;
    case "list":
      await conditionList(u);
      return;
    default:
      u.send(`Unknown +condition switch '/${sw}'. Use /add, /remove, /resolve, or /list.`);
  }
}
