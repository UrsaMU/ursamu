// +tilt command -- view, add, remove, clear Tilts (Personal + Environmental).
// Tilts award no Beats on resolution per CoFD 2e core p.282. /clear is the
// end-of-scene sweep.

import { divider, type IUrsamuSDK } from "@ursamu/ursamu";
import {
  addTilt,
  clearTilts,
  lookupTilt,
  removeTilt,
  TILTS,
} from "../subsystems/tilts.ts";
import type { CofdSheet } from "../stats/index.ts";

function splitForTarget(rest: string): { body: string; target: string } {
  const idx = rest.toLowerCase().lastIndexOf(" for ");
  if (idx < 0) return { body: rest.trim(), target: "" };
  return { body: rest.slice(0, idx).trim(), target: rest.slice(idx + 5).trim() };
}

async function resolveTarget(u: IUrsamuSDK, targetName: string) {
  const target = targetName ? await u.util.target(u.me, targetName, true) : u.me;
  if (!target) {
    u.send(`Player '${targetName}' not found.`);
    return null;
  }
  const sheet = target.state?.cofd as CofdSheet | undefined;
  if (!sheet) {
    u.send("That player does not have an approved character sheet yet.");
    return null;
  }
  const sameTarget = target.id === u.me.id;
  if (!sameTarget && !(await u.canEdit(u.me, target))) {
    u.send("Permission denied. You cannot modify that player's Tilts.");
    return null;
  }
  return { target, sheet, sameTarget };
}

async function renderTiltList(
  u: IUrsamuSDK,
  sheet: CofdSheet,
  label: string,
) {
  const list = sheet.tilts ?? [];
  const lines: string[] = [];
  lines.push(await divider("T I L T S"));
  if (list.length === 0) {
    lines.push(`  ${label} is under no active Tilts.`);
  } else {
    for (const t of list) {
      const entry = lookupTilt(t.key);
      const name = entry?.name ?? t.key;
      const scope = entry?.scope === "environmental" ? "[E]" : "[P]";
      const desc = t.note ?? entry?.effect ?? "";
      lines.push(`  ${scope} ${name.padEnd(16)} ${desc}`);
    }
  }
  u.send(lines.join("\n"));
}

async function tiltView(u: IUrsamuSDK, rest: string) {
  const target = rest ? await u.util.target(u.me, rest, true) : u.me;
  if (!target) {
    u.send(`Player '${rest}' not found.`);
    return;
  }
  const sheet = target.state?.cofd as CofdSheet | undefined;
  if (!sheet) {
    u.send("That player does not have an approved character sheet yet.");
    return;
  }
  await renderTiltList(u, sheet, u.util.displayName(target, u.me));
}

async function tiltAdd(u: IUrsamuSDK, rest: string) {
  const { body, target: targetName } = splitForTarget(rest);
  const slash = body.indexOf("/");
  const key = (slash >= 0 ? body.slice(0, slash) : body).trim();
  const note = slash >= 0 ? body.slice(slash + 1).trim() : "";
  if (!key) {
    u.send("Usage: +tilt/add <key>[/<note>] [for <player>]");
    return;
  }
  if (!lookupTilt(key)) {
    u.send(`Unknown Tilt '${key}'. See +tilt/list.`);
    return;
  }
  const ctx = await resolveTarget(u, targetName);
  if (!ctx) return;
  const updated = addTilt(ctx.sheet, key, note || undefined);
  await u.db.modify(ctx.target.id, "$set", { "data.cofd": updated });
  const entry = lookupTilt(key)!;
  const who = ctx.sameTarget ? "you" : u.util.displayName(ctx.target, u.me);
  u.send(`Inflicted %ch${entry.name}%cn on ${who}.`);
  await renderTiltList(u, updated, u.util.displayName(ctx.target, u.me));
}

async function tiltRemove(u: IUrsamuSDK, rest: string) {
  const { body, target: targetName } = splitForTarget(rest);
  const key = body.trim();
  if (!key) {
    u.send("Usage: +tilt/remove <key> [for <player>]");
    return;
  }
  const ctx = await resolveTarget(u, targetName);
  if (!ctx) return;
  const updated = removeTilt(ctx.sheet, key);
  await u.db.modify(ctx.target.id, "$set", { "data.cofd": updated });
  const name = lookupTilt(key)?.name ?? key;
  const who = ctx.sameTarget ? "you" : u.util.displayName(ctx.target, u.me);
  u.send(`Removed %ch${name}%cn from ${who} (Tilts award no Beats).`);
  await renderTiltList(u, updated, u.util.displayName(ctx.target, u.me));
}

async function tiltClear(u: IUrsamuSDK, rest: string) {
  const { target: targetName } = splitForTarget(rest);
  const ctx = await resolveTarget(u, targetName);
  if (!ctx) return;
  const updated = clearTilts(ctx.sheet);
  await u.db.modify(ctx.target.id, "$set", { "data.cofd": updated });
  const who = ctx.sameTarget ? "Your" : `${u.util.displayName(ctx.target, u.me)}'s`;
  u.send(`${who} Tilts cleared (scene end).`);
}

async function tiltList(u: IUrsamuSDK, rest: string) {
  const filter = rest.toLowerCase().trim();
  const lines: string[] = [];
  lines.push(await divider("T I L T   C A T A L O G"));
  const keys = Object.keys(TILTS).sort();
  for (const k of keys) {
    const entry = TILTS[k];
    if (filter && filter !== entry.scope) continue;
    const scope = entry.scope === "environmental" ? "Env " : "Pers";
    lines.push(`  ${k.padEnd(16)} ${scope}  ${entry.name}`);
  }
  lines.push("");
  lines.push("  Legend: Pers = Personal Tilt, Env = Environmental Tilt.");
  u.send(lines.join("\n"));
}

async function tiltShow(u: IUrsamuSDK, key: string) {
  const entry = lookupTilt(key);
  if (!entry) {
    u.send(`Unknown Tilt '${key}'. See +tilt/list.`);
    return;
  }
  const lines: string[] = [];
  lines.push(await divider(entry.name.toUpperCase()));
  lines.push(`  Scope:       ${entry.scope === "environmental" ? "Environmental" : "Personal"}`);
  lines.push(`  Description: ${entry.description}`);
  lines.push(`  Effect:      ${entry.effect}`);
  lines.push(`  Causing:     ${entry.causing}`);
  lines.push(`  Ending:      ${entry.ending}`);
  u.send(lines.join("\n"));
}

export async function tiltExec(u: IUrsamuSDK) {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

  if (!sw) {
    await tiltView(u, rest);
    return;
  }
  switch (sw) {
    case "view":
      await tiltView(u, rest);
      return;
    case "list":
      await tiltList(u, rest);
      return;
    case "show":
      await tiltShow(u, rest);
      return;
    case "add":
      await tiltAdd(u, rest);
      return;
    case "remove":
    case "rem":
      await tiltRemove(u, rest);
      return;
    case "clear":
    case "end-scene":
      await tiltClear(u, rest);
      return;
    default:
      u.send(
        `Unknown +tilt switch '/${sw}'. Use /list, /show, /add, /remove, /clear.`,
      );
  }
}
