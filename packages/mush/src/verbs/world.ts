import { addCmd } from "../commands/addCmd.ts";
import type { IUrsamuSDK } from "../commands/types.ts";

export function privLevel(flags: Set<string>): number {
  if (flags.has("superuser")) return 3;
  if (flags.has("admin"))     return 2;
  if (flags.has("wizard"))    return 1;
  return 0;
}

export const REACTIVE_ATTRS = ["LISTEN", "AHEAR", "ACONNECT", "ADISCONNECT", "STARTUP"];

export async function execTeleport(u: IUrsamuSDK): Promise<void> {
  const actor = u.me;
  const input = (u.cmd.args[0] || "").trim();
  const match = input.match(/^(.+?)\s*=\s*(.*)$/);
  if (!match) { u.send("Usage: @teleport <target>=<destination>"); return; }

  const targetName = match[1].trim();
  const destName   = match[2].trim();

  const searchTarget = await u.db.search(targetName);
  const target = searchTarget[0];
  if (!target) { u.send(`Could not find target: ${targetName}`); return; }

  if (!(await u.canEdit(actor, target))) { u.send("Permission denied."); return; }

  const searchDest = await u.db.search(destName);
  const destination = searchDest[0];
  if (!destination) { u.send(`Could not find destination: ${destName}`); return; }

  const canEnter = (await u.canEdit(actor, destination)) || destination.flags.has("enter_ok");
  if (!canEnter) { u.send("Permission denied (destination check)."); return; }

  u.teleport(target.id, destination.id);
  u.send(`You teleport ${u.util.displayName(target, actor)} to ${u.util.displayName(destination, actor)}.`);
}

export async function execTel(u: IUrsamuSDK): Promise<void> {
  const actor   = u.me;
  const isAdmin = actor.flags.has("admin") || actor.flags.has("wizard") || actor.flags.has("superuser");
  if (!isAdmin) { u.send("Permission denied."); return; }

  const input = (u.cmd.args[0] || "").trim();
  const eqIdx = input.indexOf("=");
  if (eqIdx === -1) { u.send("Usage: @tel <target>=<destination>"); return; }

  const targetName = input.slice(0, eqIdx).trim();
  const destName   = input.slice(eqIdx + 1).trim();
  if (!targetName || !destName) { u.send("Usage: @tel <target>=<destination>"); return; }

  const target = await u.util.target(actor, targetName);
  if (!target) { u.send(`I can't find '${targetName}'.`); return; }

  if (privLevel(target.flags) >= privLevel(actor.flags)) {
    u.send("Permission denied.");
    return;
  }

  const dest = await u.util.target(actor, destName);
  if (!dest) { u.send(`I can't find destination '${destName}'.`); return; }

  await u.db.modify(target.id, "$set", { location: dest.id });
  u.send(`You are teleported to ${dest.name || dest.id}.`, target.id);
  u.send(`You teleport ${target.name || target.id} to ${dest.name || dest.id}.`);
}

export async function execEntrances(u: IUrsamuSDK): Promise<void> {
  const actor   = u.me;
  const isAdmin = actor.flags.has("admin") || actor.flags.has("wizard") || actor.flags.has("superuser");
  if (!isAdmin) { u.send("Permission denied."); return; }

  const arg = (u.cmd.args[0] || "").trim();
  const target = arg ? await u.util.target(actor, arg) : u.here;
  if (arg && !target) { u.send(`I can't find '${arg}'.`); return; }

  const targetId   = target!.id;
  const targetName = target!.name || targetId;
  const exits      = await u.db.search({ flags: /exit/ });
  const matches: string[] = [];

  for (const exit of exits) {
    const dest = (exit.state?.destination as string) || (exit.state?.location as string);
    if (dest !== targetId) continue;
    const exitLocation = exit.location || (exit.state?.location as string);
    let roomName = exitLocation || "(unknown room)";
    if (exitLocation) {
      const rooms = await u.db.search({ id: exitLocation } as unknown as Record<string, unknown>);
      if (rooms.length > 0) roomName = rooms[0].name || exitLocation;
    }
    matches.push(`  Exit '${exit.name || exit.id}' in ${roomName}`);
  }

  if (matches.length === 0) { u.send(`No exits lead to ${targetName}.`); return; }
  u.send(`%chEntrances to ${targetName}:%cn`);
  for (const line of matches) u.send(line);
}


export async function execForce(u: IUrsamuSDK): Promise<void> {
  const actor   = u.me;
  const isAdmin = actor.flags.has("admin") || actor.flags.has("wizard") || actor.flags.has("superuser");
  if (!isAdmin) { u.send("Permission denied."); return; }

  const input = (u.cmd.args[0] || "").trim();
  const eqIdx = input.indexOf("=");
  if (eqIdx === -1) { u.send("Usage: @force <target>=<command>"); return; }

  const targetName = input.slice(0, eqIdx).trim();
  const command    = input.slice(eqIdx + 1).trim();
  if (!targetName || !command) { u.send("Usage: @force <target>=<command>"); return; }

  const target = await u.util.target(actor, targetName);
  if (!target) { u.send("I can't find that."); return; }

  if (privLevel(target.flags) >= privLevel(actor.flags)) {
    u.send("Permission denied.");
    return;
  }

  await u.forceAs(target.id, command);
  u.send(`You force ${target.name || target.id} to: ${command}`);
}

addCmd({
  name: "@teleport",
  pattern: /^@teleport\s+(.*)/i,
  lock: "connected",
  category: "Admin",
  help: `@teleport <target>=<destination>  — Teleport an object to a destination.

Examples:
  @teleport me=home
  @teleport sword=#5`,
  exec: execTeleport,
});

addCmd({
  name: "@tel",
  pattern: /^@tel\s+(.*)/i,
  lock: "connected admin+",
  category: "Admin",
  help: `@tel <target>=<destination>  — Admin teleport: move any object anywhere.

Examples:
  @tel Alice=#5
  @tel #12=here`,
  exec: execTel,
});

addCmd({
  name: "@entrances",
  pattern: /^@entrances(?:\s+(.*))?$/i,
  lock: "connected admin+",
  category: "Admin",
  help: `@entrances [<location>]  — List exits that lead to a location.

Examples:
  @entrances
  @entrances #5`,
  exec: execEntrances,
});

addCmd({
  name: "@force",
  pattern: /^@force\s+(.*)/i,
  lock: "connected admin+",
  category: "Admin",
  help: `@force <target>=<command>  — Force an object to execute a command.

You cannot force objects with equal or higher privilege than yourself.

Examples:
  @force Alice=look
  @force #12=say Hello!`,
  exec: execForce,
});
