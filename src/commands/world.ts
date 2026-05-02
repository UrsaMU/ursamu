import "./world-building.ts";
import "./world-admin.ts";
import type { IUrsamuSDK, IGameTime } from "../@types/UrsamuSDK.ts";

export function privLevel(flags: Set<string>): number {
  if (flags.has("superuser")) return 3;
  if (flags.has("admin"))     return 2;
  if (flags.has("wizard"))    return 1;
  return 0;
}

export const REACTIVE_ATTRS = ["LISTEN", "AHEAR", "ACONNECT", "ADISCONNECT", "STARTUP"];

export async function execFind(u: IUrsamuSDK): Promise<void> {
      const sw = (u.cmd.args[0] || "").toLowerCase().trim();
      const arg = (u.cmd.args[1] || "").trim();
      if (!arg) {
        u.send("Usage: @find <name>  |  @find/flag <flag>  |  @find/type <type>");
        return;
      }

      const escaped = arg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      let results;
      if (sw === "flag") {
        results = await u.db.search({ flags: new RegExp(escaped, "i") });
      } else if (sw === "type") {
        results = await u.db.search({ flags: new RegExp(`\\b${escaped}\\b`, "i") });
      } else {
        results = await u.db.search({ "data.name": new RegExp(escaped, "i") });
      }

      if (!results.length) { u.send(`No objects found matching '${arg}'.`); return; }
      u.send(`%chFound ${results.length} object${results.length === 1 ? "" : "s"}:%cn`);
      for (const obj of results) {
        const name = (obj.state?.name as string) || obj.name || "(unnamed)";
        const flagList = obj.flags instanceof Set ? [...obj.flags].join(" ") : String(obj.flags);
        u.send(`  #${obj.id}  ${name}  [${flagList}]`);
      }
}

export async function execFlags(u: IUrsamuSDK): Promise<void> {
      const raw = (u.cmd.args[0] || "").trim();
      const eqIdx = raw.indexOf("=");
      if (eqIdx === -1) { u.send("Usage: @flags <target>=<flags>"); return; }

      const targetName = raw.slice(0, eqIdx).trim();
      const flags = raw.slice(eqIdx + 1).trim();
      if (!targetName || !flags) { u.send("Usage: @flags <target>=<flags>"); return; }

      const tar = await u.util.target(u.me, targetName);
      if (!tar) { u.send("I can't find that here."); return; }
      if (!(await u.canEdit(u.me, tar))) { u.send("Permission denied."); return; }

      await u.setFlags(tar.id, flags);
      u.send(`Flags set on ${u.util.displayName(tar, u.me)}.`);
}

export async function execTeleport(u: IUrsamuSDK): Promise<void> {
      const actor = u.me;
      const input = (u.cmd.args[0] || "").trim();
      const match = input.match(/^(.+?)\s*=\s*(.*)$/);
      if (!match) { u.send("Usage: @teleport <target>=<destination>"); return; }

      const targetName = match[1].trim();
      const destName = match[2].trim();

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
      const actor = u.me;
      const isAdmin = actor.flags.has("admin") || actor.flags.has("wizard") || actor.flags.has("superuser");
      if (!isAdmin) { u.send("Permission denied."); return; }
      const input = (u.cmd.args[0] || "").trim();
      const eqIdx = input.indexOf("=");
      if (eqIdx === -1) { u.send("Usage: @tel <target>=<destination>"); return; }

      const targetName = input.slice(0, eqIdx).trim();
      const destName = input.slice(eqIdx + 1).trim();
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

export async function execStats(u: IUrsamuSDK): Promise<void> {
      const sw = (u.cmd.args[0] || "").toLowerCase().trim();
      const full = sw === "full";

      const connectedPlayers = await u.db.search({ flags: /connected/ });
      const connected = connectedPlayers.length;

      let rooms = 0, players = 0, exits = 0, things = 0, totalObjs = 0;
      if (full) {
        const all = await u.db.search({});
        rooms   = all.filter((o) => o.flags.has("room")).length;
        players = all.filter((o) => o.flags.has("player")).length;
        exits   = all.filter((o) => o.flags.has("exit")).length;
        things  = all.filter((o) => !o.flags.has("room") && !o.flags.has("player") && !o.flags.has("exit")).length;
        totalObjs = all.length;
      }

      const uptimeMs = await u.sys.uptime();
      const uptimeSec = Math.floor(uptimeMs / 1000);
      const days    = Math.floor(uptimeSec / 86400);
      const hours   = Math.floor((uptimeSec % 86400) / 3600);
      const minutes = Math.floor((uptimeSec % 3600) / 60);
      const seconds = uptimeSec % 60;
      const uptimeStr = days > 0
        ? `${days}d ${hours}h ${minutes}m ${seconds}s`
        : hours > 0
        ? `${hours}h ${minutes}m ${seconds}s`
        : `${minutes}m ${seconds}s`;

      u.send("%ch%cy=== Server Stats ===%cn");
      u.send(`Uptime:     ${uptimeStr}`);
      u.send(`Connected:  ${connected} player${connected === 1 ? "" : "s"}`);
      if (full) {
        u.send(`Total objs: ${totalObjs}`);
        u.send("%ch%cy--- Object Breakdown ---%cn");
        u.send(`  Rooms:   ${rooms}`);
        u.send(`  Players: ${players}`);
        u.send(`  Exits:   ${exits}`);
        u.send(`  Things:  ${things}`);
      }
      u.send("%ch%cy===================%cn");
}

export async function execTime(u: IUrsamuSDK): Promise<void> {
      const sw = (u.cmd.args[0] || "").toLowerCase().trim();
      const argStr = (u.cmd.args[1] || "").trim();

      if (sw === "set") {
        const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
        if (!isAdmin) { u.send("Permission denied."); return; }

        const partial: Partial<IGameTime> = {};
        const validKeys = new Set(["year", "month", "day", "hour", "minute"]);
        const RANGES: Record<string, [number, number]> = {
          year: [1, 9999], month: [1, 12], day: [1, 28], hour: [0, 23], minute: [0, 59],
        };

        for (const pair of argStr.split(/\s+/)) {
          const eqIdx = pair.indexOf("=");
          if (eqIdx === -1) continue;
          const key = pair.slice(0, eqIdx).trim().toLowerCase();
          const val = parseInt(pair.slice(eqIdx + 1).trim(), 10);
          if (!validKeys.has(key) || isNaN(val)) continue;
          const [min, max] = RANGES[key];
          if (val < min || val > max) {
            u.send(`Invalid value for ${key}: must be between ${min} and ${max}.`);
            return;
          }
          (partial as Record<string, number>)[key] = val;
        }

        if (Object.keys(partial).length === 0) {
          u.send("Usage: @time/set year=<n> month=<n> day=<n> hour=<n> minute=<n>");
          return;
        }

        const current = await u.sys.gameTime();
        const merged: IGameTime = { ...current, ...partial };
        u.send(
          `%chGame>%cn Setting game time to: Year ${merged.year}, Month ${merged.month}, Day ${merged.day}, ` +
          `${String(merged.hour).padStart(2, "0")}:${String(merged.minute).padStart(2, "0")}`
        );
        await u.sys.setGameTime(merged);
        return;
      }

      const gt = await u.sys.gameTime();
      const hh = String(gt.hour).padStart(2, "0");
      const mm = String(gt.minute).padStart(2, "0");
      u.send(`Game time  : Year ${gt.year}, Month ${gt.month}, Day ${gt.day}, ${hh}:${mm}`);
      u.send(`Server time: ${new Date().toUTCString()}`);
}

export async function execEntrances(u: IUrsamuSDK): Promise<void> {
      const actor = u.me;
      const isAdmin = actor.flags.has("admin") || actor.flags.has("wizard") || actor.flags.has("superuser");
      if (!isAdmin) { u.send("Permission denied."); return; }
      const arg = (u.cmd.args[0] || "").trim();

      let target;
      if (arg) {
        target = await u.util.target(actor, arg);
        if (!target) { u.send(`I can't find '${arg}'.`); return; }
      } else {
        target = u.here;
      }

      const targetId = target.id;
      const targetName = target.name || targetId;
      const exits = await u.db.search({ flags: /exit/ });
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

// ── Simple attribute-setter helper ───────────────────────────────────────────

async function execAttrSetter(
  u: IUrsamuSDK,
  attrKey: string,
  cmdUsage: string,
): Promise<void> {
  const raw    = (u.cmd.args[0] || "").trim();
  const eqIdx  = raw.indexOf("=");
  if (eqIdx === -1) { u.send(`Usage: ${cmdUsage}`); return; }
  const targetStr = raw.slice(0, eqIdx).trim();
  const value     = raw.slice(eqIdx + 1);                  // preserve spaces
  const tar       = await u.util.target(u.me, targetStr);
  if (!tar) { u.send("I can't find that."); return; }
  if (!(await u.canEdit(u.me, tar))) { u.send("Permission denied."); return; }
  await u.db.modify(tar.id, "$set", { [`data.${attrKey}`]: value });
  u.send(`${attrKey.toUpperCase()} set on ${u.util.displayName(tar, u.me)}.`);
}

// ── @desc ─────────────────────────────────────────────────────────────────────
export async function execDesc(u: IUrsamuSDK): Promise<void> {
  await execAttrSetter(u, "desc", "@desc <target>=<description>");
}

// ── @aconnect / @adisconnect / @startup / @daily ─────────────────────────────
export async function execAconnect(u: IUrsamuSDK): Promise<void> {
  await execAttrSetter(u, "aconnect", "@aconnect <target>=<action>");
}
export async function execAdisconnect(u: IUrsamuSDK): Promise<void> {
  await execAttrSetter(u, "adisconnect", "@adisconnect <target>=<action>");
}
export async function execStartup(u: IUrsamuSDK): Promise<void> {
  await execAttrSetter(u, "startup", "@startup <target>=<action>");
}
export async function execDaily(u: IUrsamuSDK): Promise<void> {
  await execAttrSetter(u, "daily", "@daily <target>=<action>");
}

// ── @parent ───────────────────────────────────────────────────────────────────
export async function execParent(u: IUrsamuSDK): Promise<void> {
  const raw    = (u.cmd.args[0] || "").trim();
  const eqIdx  = raw.indexOf("=");
  if (eqIdx === -1) { u.send("Usage: @parent <target>=<parent>"); return; }
  const targetStr = raw.slice(0, eqIdx).trim();
  const parentStr = raw.slice(eqIdx + 1).trim();
  const tar       = await u.util.target(u.me, targetStr);
  if (!tar) { u.send("I can't find that."); return; }
  if (!(await u.canEdit(u.me, tar))) { u.send("Permission denied."); return; }

  if (!parentStr) {
    // Clear parent
    await u.db.modify(tar.id, "$unset", { "data.parent": "" });
    u.send(`Parent cleared on ${u.util.displayName(tar, u.me)}.`);
    return;
  }

  const parent = await u.util.target(u.me, parentStr);
  if (!parent) { u.send(`I can't find parent '${parentStr}'.`); return; }
  await u.db.modify(tar.id, "$set", { "data.parent": parent.id });
  u.send(`Parent of ${u.util.displayName(tar, u.me)} set to ${u.util.displayName(parent, u.me)}.`);
}

// ── @link ─────────────────────────────────────────────────────────────────────
// @link <target>=<dest> — sets the home/destination of an object.
export async function execLink(u: IUrsamuSDK): Promise<void> {
  const raw    = (u.cmd.args[0] || "").trim();
  const eqIdx  = raw.indexOf("=");
  if (eqIdx === -1) { u.send("Usage: @link <target>=<destination>"); return; }
  const targetStr = raw.slice(0, eqIdx).trim();
  const destStr   = raw.slice(eqIdx + 1).trim();
  const tar       = await u.util.target(u.me, targetStr);
  if (!tar) { u.send("I can't find that."); return; }
  if (!(await u.canEdit(u.me, tar))) { u.send("Permission denied."); return; }

  if (!destStr) {
    await u.db.modify(tar.id, "$unset", { "data.home": "" });
    u.send(`Link cleared on ${u.util.displayName(tar, u.me)}.`);
    return;
  }

  const dest = await u.util.target(u.me, destStr);
  if (!dest) { u.send(`I can't find '${destStr}'.`); return; }
  const field = tar.flags.has("exit") ? "data.destination" : "data.home";
  await u.db.modify(tar.id, "$set", { [field]: dest.id });
  u.send(`${u.util.displayName(tar, u.me)} linked to ${u.util.displayName(dest, u.me)}.`);
}

// ── @clone ────────────────────────────────────────────────────────────────────
// @clone <target>[=<new name>]
export async function execClone(u: IUrsamuSDK): Promise<void> {
  const raw     = (u.cmd.args[0] || "").trim();
  const eqIdx   = raw.indexOf("=");
  const srcStr  = eqIdx >= 0 ? raw.slice(0, eqIdx).trim() : raw;
  const newName = eqIdx >= 0 ? raw.slice(eqIdx + 1).trim() : "";
  const src     = await u.util.target(u.me, srcStr);
  if (!src) { u.send("I can't find that."); return; }
  if (src.flags.has("player")) { u.send("You can't clone players."); return; }
  if (!(await u.canEdit(u.me, src))) { u.send("Permission denied."); return; }

  const cloneName = newName || src.name || "Clone";
  const cloneState: Record<string, unknown> = { ...((src.state as Record<string, unknown>) || {}) };
  cloneState.name = cloneName;
  cloneState.owner = u.me.id;
  // Clear attributes that shouldn't be inherited by default
  delete (cloneState as Record<string, unknown>).lock;

  const clone = await u.db.create({
    flags:    src.flags,
    location: u.me.id,
    state:    cloneState,
    name:     cloneName,
    contents: [],
  });
  u.send(`Cloned ${u.util.displayName(src, u.me)} as ${cloneName} (#${clone.id}).`);
}

// ── @dest ─────────────────────────────────────────────────────────────────────
// @dest[/instant] <target> — destroy an object without confirmation prompt.
export async function execDest(u: IUrsamuSDK): Promise<void> {
  const targetStr = (u.cmd.args[0] || "").trim();
  if (!targetStr) { u.send("Usage: @dest <target>"); return; }
  const tar = await u.util.target(u.me, targetStr);
  if (!tar) { u.send("I can't find that."); return; }
  if (tar.flags.has("player")) { u.send("You can't destroy players."); return; }
  if (!(await u.canEdit(u.me, tar))) { u.send("Permission denied."); return; }
  const name = u.util.displayName(tar, u.me);
  await u.db.destroy(tar.id);
  u.send(`${name} destroyed.`);
}

// ── @log ──────────────────────────────────────────────────────────────────────
// @log[/<file>] [<object>=]<message>
export function execLog(u: IUrsamuSDK): void {
  const raw = (u.cmd.args[0] || "").trim();
  // Support both "@log msg" and "@log obj=msg" forms; just log the message.
  const eqIdx = raw.indexOf("=");
  const msg   = eqIdx >= 0 ? raw.slice(eqIdx + 1) : raw;
  console.log(`[MUSH LOG] ${msg}`);
  // No user-visible output (silent, as in standard MUSH @log behavior).
}

export async function execSweep(u: IUrsamuSDK): Promise<void> {
      const actor = u.me;
      const isAdmin = actor.flags.has("admin") || actor.flags.has("wizard") || actor.flags.has("superuser");
      if (!isAdmin) { u.send("Permission denied."); return; }
      const contents = await u.db.search({ location: u.here.id });
      const reactive: string[] = [];

      for (const obj of contents) {
        if (obj.id === actor.id) continue;
        const attrs = obj.state?.attributes as Array<{ name: string }> | undefined;
        if (!attrs || !Array.isArray(attrs)) continue;
        const found = REACTIVE_ATTRS.filter((rAttr) => attrs.some((a) => a.name === rAttr));
        if (found.length > 0) reactive.push(`  ${obj.name || obj.id} [${found.join(", ")}]`);
      }

      if (reactive.length === 0) { u.send("No reactive objects in this room."); return; }
      u.send("%chReactive objects in this room:%cn");
      for (const line of reactive) u.send(line);
}

export async function execForce(u: IUrsamuSDK): Promise<void> {
      const actor = u.me;
      const isAdmin = actor.flags.has("admin") || actor.flags.has("wizard") || actor.flags.has("superuser");
      if (!isAdmin) { u.send("Permission denied."); return; }
      const input = (u.cmd.args[0] || "").trim();
      const eqIdx = input.indexOf("=");
      if (eqIdx === -1) { u.send("Usage: @force <target>=<command>"); return; }

      const targetName = input.slice(0, eqIdx).trim();
      const command = input.slice(eqIdx + 1).trim();
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
