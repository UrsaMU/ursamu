// +zone command -- staff-defined regions of rooms populated with themed
// wandering NPCs. v1 surface: create, add rooms, populate, wander on/off,
// list, show, destroy.

import { divider, type IDBObj, type IUrsamuSDK } from "@ursamu/ursamu";
import {
  addRoomsToZone,
  addSpawnRule,
  createZone,
  destroyZone,
  findAdjacentRooms,
  findZoneByName,
  listZones,
  mobsInRoomForZone,
  type MobAggro,
  setFlavorEnabled,
  setMigration,
  setRespawnCooldown,
  setWanderEnabled,
  setZoneTheme,
  spawnMobs,
  startWander,
  stopWander,
  type Zone,
} from "../combat/zone.ts";
import { archetypeKeys, getArchetype } from "../npc/archetypes.ts";
import {
  pickThemeSpawns,
  type SpawnSize,
  type ThemeKey,
  themeKeys,
} from "../combat/themes.ts";

function isStaff(actor: IDBObj): boolean {
  const f = actor.flags as Set<string> | undefined;
  if (!f) return false;
  return f.has?.("superuser") || f.has?.("admin") ||
    f.has?.("wizard") || f.has?.("builder");
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function isValidAggro(s: string): s is MobAggro {
  return s === "passive" || s === "territorial" || s === "hunter";
}

export async function zoneExec(u: IUrsamuSDK): Promise<void> {
  const switchName = u.cmd.args[0] ?? "";
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

  switch (switchName.toLowerCase()) {
    case "":
    case "list":
      return await zoneList(u);
    case "show":
      return await zoneShow(u, rest);
    case "create":
      return await zoneCreate(u, rest);
    case "add":
      return await zoneAdd(u, rest);
    case "from-exits":
      return await zoneFromExits(u, rest);
    case "populate":
      return await zonePopulate(u, rest);
    case "wander":
      return await zoneWander(u, rest);
    case "respawn":
      return await zoneRespawn(u, rest);
    case "flavor":
      return await zoneFlavor(u, rest);
    case "theme":
      return await zoneTheme(u, rest);
    case "migration":
      return await zoneMigration(u, rest);
    case "destroy":
      return await zoneDestroy(u, rest);
    default:
      u.send(`Unknown +zone switch: /${switchName}`);
  }
}

// ---------------------------------------------------------------------------
// /list
// ---------------------------------------------------------------------------

async function zoneList(u: IUrsamuSDK): Promise<void> {
  if (!isStaff(u.me)) { u.send("Permission denied."); return; }
  const zones = await listZones();
  const lines: string[] = [];
  lines.push(await divider("Z O N E S"));
  if (zones.length === 0) {
    lines.push("  No zones defined. Use +zone/create <name> here.");
    u.send(lines.join("\n"));
    return;
  }
  lines.push(
    "  " + pad("Name", 22) + pad("Rooms", 8) + pad("Wander", 10) + "Id",
  );
  lines.push("  " + "-".repeat(72));
  for (const z of zones) {
    lines.push(
      "  " + pad(z.name, 22) + pad(String(z.roomIds.length), 8) +
        pad(z.wanderEnabled ? "on" : "off", 10) + z.id,
    );
  }
  u.send(lines.join("\n"));
}

// ---------------------------------------------------------------------------
// /show <name>
// ---------------------------------------------------------------------------

async function zoneShow(u: IUrsamuSDK, name: string): Promise<void> {
  if (!isStaff(u.me)) { u.send("Permission denied."); return; }
  if (!name) { u.send("Syntax: +zone/show <name>"); return; }
  const z = await findZoneByName(name);
  if (!z) { u.send(`No zone named '${name}'.`); return; }

  const lines: string[] = [];
  lines.push(await divider(`Z O N E :  ${z.name}`));
  lines.push(`  Id:           ${z.id}`);
  lines.push(`  Rooms:        ${z.roomIds.length}`);
  lines.push(`  Wander:       ${z.wanderEnabled ? "on" : "off"}  (every ${Math.round(z.wanderIntervalMs / 1000)}s)`);
  lines.push(`  Theme:        ${z.theme ?? "(none)"}`);
  lines.push(`  Flavor:       ${z.flavorEnabled === false ? "off" : "on"}`);
  lines.push(
    `  Respawn:      ${
      z.respawnCooldownMs
        ? `every ${Math.round(z.respawnCooldownMs / 1000)}s`
        : "off"
    }`,
  );
  lines.push(`  Migration:    ${z.allowMigration ? "on" : "off"}`);
  lines.push(`  Spawn rules:`);
  if (z.spawnRules.length === 0) lines.push("    (none)");
  for (const r of z.spawnRules) {
    lines.push(`    - ${r.archetype} x${r.count}  aggro=${r.aggro}`);
  }
  // Live mob count per room.
  let total = 0;
  for (const rid of z.roomIds) {
    const mobs = await mobsInRoomForZone(rid, z.id);
    total += mobs.length;
  }
  lines.push(`  Live mobs:    ${total}`);
  u.send(lines.join("\n"));
}

// ---------------------------------------------------------------------------
// /create <name>
// ---------------------------------------------------------------------------

async function zoneCreate(u: IUrsamuSDK, name: string): Promise<void> {
  if (!isStaff(u.me)) { u.send("Permission denied."); return; }
  if (!name) { u.send("Syntax: +zone/create <name>"); return; }
  const roomId = u.here?.id;
  if (!roomId) { u.send("You are not in a room."); return; }
  const existing = await findZoneByName(name);
  if (existing) { u.send(`Zone '${name}' already exists.`); return; }
  const z = await createZone(name, roomId, u.me.id);
  u.send(`Created zone %ch${z.name}%cn (${z.id}) anchored to this room.`);
}

// ---------------------------------------------------------------------------
// /add <name>=<room1> <room2>...
// ---------------------------------------------------------------------------

async function zoneAdd(u: IUrsamuSDK, rest: string): Promise<void> {
  if (!isStaff(u.me)) { u.send("Permission denied."); return; }
  const eq = rest.indexOf("=");
  if (eq < 0) { u.send("Syntax: +zone/add <name>=<roomId> [<roomId>...]"); return; }
  const name = rest.slice(0, eq).trim();
  const ids = rest.slice(eq + 1).trim().split(/\s+/).filter(Boolean);
  if (!name || ids.length === 0) {
    u.send("Syntax: +zone/add <name>=<roomId> [<roomId>...]");
    return;
  }
  const z = await findZoneByName(name);
  if (!z) { u.send(`No zone named '${name}'.`); return; }
  const updated = await addRoomsToZone(z.id, ids);
  if (!updated) { u.send("Add failed."); return; }
  u.send(`Zone %ch${name}%cn now spans ${updated.roomIds.length} room${updated.roomIds.length === 1 ? "" : "s"}.`);
}

// ---------------------------------------------------------------------------
// /from-exits <name>
// ---------------------------------------------------------------------------

async function zoneFromExits(u: IUrsamuSDK, name: string): Promise<void> {
  if (!isStaff(u.me)) { u.send("Permission denied."); return; }
  if (!name) { u.send("Syntax: +zone/from-exits <name>"); return; }
  const z = await findZoneByName(name);
  if (!z) { u.send(`No zone named '${name}'.`); return; }

  const MAX_ROOMS = 200;
  const seen = new Set<string>(z.roomIds);
  const frontier = [...z.roomIds];
  let capped = false;
  while (frontier.length > 0) {
    if (seen.size >= MAX_ROOMS) { capped = true; break; }
    const rid = frontier.shift()!;
    const adj = await findAdjacentRooms(rid);
    for (const a of adj) {
      if (seen.size >= MAX_ROOMS) { capped = true; break; }
      if (!seen.has(a)) { seen.add(a); frontier.push(a); }
    }
  }
  const updated = await addRoomsToZone(z.id, [...seen]);
  if (!updated) { u.send("Add failed."); return; }
  const note = capped ? ` (capped at ${MAX_ROOMS}; rerun to extend further)` : "";
  u.send(`Zone %ch${name}%cn extended via exits to ${updated.roomIds.length} rooms${note}.`);
}

// ---------------------------------------------------------------------------
// /populate <name>=<archetype>x<N> [aggro=<mode>]
// ---------------------------------------------------------------------------

async function zonePopulate(u: IUrsamuSDK, rest: string): Promise<void> {
  if (!isStaff(u.me)) { u.send("Permission denied."); return; }
  const eq = rest.indexOf("=");
  if (eq < 0) {
    u.send("Syntax: +zone/populate <name>=<archetype>x<N> [aggro=<mode>]  OR  +zone/populate <name>=theme=<theme> [size=small|medium|large] [aggro=<mode>]");
    return;
  }
  const name = rest.slice(0, eq).trim();
  const spec = rest.slice(eq + 1).trim();

  // v2: theme=<theme> [size=<size>] [aggro=<mode>]
  const themeMatch = spec.match(/^theme=(\S+)(.*)$/i);
  if (themeMatch) {
    const themeRaw = themeMatch[1].toLowerCase();
    const tail = themeMatch[2] ?? "";
    const sizeMatch = tail.match(/\bsize=(\S+)/i);
    const aggroMatch = tail.match(/\baggro=(\S+)/i);

    const valid = themeKeys();
    if (!(valid as string[]).includes(themeRaw)) {
      u.send(
        `Unknown theme '${themeRaw}'. Valid: ${valid.join(", ")}`,
      );
      return;
    }
    const theme = themeRaw as ThemeKey;

    const sizeRaw = (sizeMatch?.[1] ?? "medium").toLowerCase();
    if (sizeRaw !== "small" && sizeRaw !== "medium" && sizeRaw !== "large") {
      u.send("Size must be small, medium, or large.");
      return;
    }
    const size = sizeRaw as SpawnSize;

    let overrideAggro: MobAggro | null = null;
    if (aggroMatch) {
      const a = aggroMatch[1].toLowerCase();
      if (!isValidAggro(a)) {
        u.send(`Invalid aggro mode '${a}'. Use passive, territorial, or hunter.`);
        return;
      }
      overrideAggro = a;
    }

    const z = await findZoneByName(name);
    if (!z) { u.send(`No zone named '${name}'.`); return; }

    const picks = pickThemeSpawns(theme, size);
    let total = 0;
    for (const pick of picks) {
      if (!getArchetype(pick.archetype)) continue;
      const finalAggro: MobAggro = overrideAggro ?? pick.aggro;
      const ids = await spawnMobs(u, z, pick.archetype, 1, finalAggro);
      total += ids.length;
    }
    u.send(
      `Spawned ${total} mobs in zone %ch${name}%cn (theme: ${theme}, size: ${size}).`,
    );
    return;
  }

  // Parse "<archetype>x<N>" + optional " aggro=<mode>".
  const m = spec.match(/^(\S+)x(\d+)(?:\s+aggro=(\S+))?/i);
  if (!m) {
    u.send("Syntax: +zone/populate <name>=<archetype>x<N> [aggro=passive|territorial|hunter]");
    return;
  }
  const archKey = m[1].toLowerCase();
  const count = parseInt(m[2], 10);
  const aggroRaw = (m[3] ?? "territorial").toLowerCase();
  if (!isValidAggro(aggroRaw)) {
    u.send(`Invalid aggro mode '${aggroRaw}'. Use passive, territorial, or hunter.`);
    return;
  }
  if (count < 1 || count > 50) {
    u.send("Count must be 1-50.");
    return;
  }
  if (!getArchetype(archKey)) {
    u.send(`Unknown archetype '${archKey}'. Valid: ${archetypeKeys().join(", ")}`);
    return;
  }

  const z = await findZoneByName(name);
  if (!z) { u.send(`No zone named '${name}'.`); return; }

  await addSpawnRule(z.id, { archetype: archKey, count, aggro: aggroRaw });
  const refreshed = await findZoneByName(name);
  const ids = await spawnMobs(u, refreshed ?? z, archKey, count, aggroRaw);
  u.send(`Spawned ${ids.length} ${archKey}${ids.length === 1 ? "" : "s"} (aggro=${aggroRaw}) across zone %ch${name}%cn.`);
}

// ---------------------------------------------------------------------------
// /wander <name>=on|off
// ---------------------------------------------------------------------------

async function zoneWander(u: IUrsamuSDK, rest: string): Promise<void> {
  if (!isStaff(u.me)) { u.send("Permission denied."); return; }
  const eq = rest.indexOf("=");
  if (eq < 0) { u.send("Syntax: +zone/wander <name>=on|off"); return; }
  const name = rest.slice(0, eq).trim();
  const stateStr = rest.slice(eq + 1).trim().toLowerCase();
  const enable = stateStr === "on" || stateStr === "true" || stateStr === "1";
  if (!enable && stateStr !== "off" && stateStr !== "false" && stateStr !== "0") {
    u.send("State must be on or off.");
    return;
  }
  const z = await findZoneByName(name);
  if (!z) { u.send(`No zone named '${name}'.`); return; }
  const updated = await setWanderEnabled(z.id, enable);
  if (!updated) { u.send("Update failed."); return; }
  if (enable) startWander(updated.id, updated.wanderIntervalMs);
  else stopWander(updated.id);
  u.send(`Wander ${enable ? "started" : "stopped"} for zone %ch${name}%cn.`);
}

// ---------------------------------------------------------------------------
// /respawn <name>=<seconds>|off
// ---------------------------------------------------------------------------

async function zoneRespawn(u: IUrsamuSDK, rest: string): Promise<void> {
  if (!isStaff(u.me)) { u.send("Permission denied."); return; }
  const eq = rest.indexOf("=");
  if (eq < 0) { u.send("Syntax: +zone/respawn <name>=<seconds>|off"); return; }
  const name = rest.slice(0, eq).trim();
  const val = rest.slice(eq + 1).trim().toLowerCase();
  const z = await findZoneByName(name);
  if (!z) { u.send(`No zone named '${name}'.`); return; }
  if (val === "off" || val === "0") {
    const updated = await setRespawnCooldown(z.id, null);
    if (!updated) { u.send("Update failed."); return; }
    u.send(`Respawn disabled for zone %ch${name}%cn.`);
    return;
  }
  const secs = parseInt(val, 10);
  // Min 30s: respawn must be at least one wander tick to avoid storms (M1).
  if (!Number.isFinite(secs) || secs < 30 || secs > 86_400) {
    u.send("Cooldown must be a number of seconds between 30 and 86400, or 'off'.");
    return;
  }
  const updated = await setRespawnCooldown(z.id, secs * 1000);
  if (!updated) { u.send("Update failed."); return; }
  u.send(`Respawn cooldown set to ${secs}s for zone %ch${name}%cn.`);
}

// ---------------------------------------------------------------------------
// /flavor <name>=on|off
// ---------------------------------------------------------------------------

async function zoneFlavor(u: IUrsamuSDK, rest: string): Promise<void> {
  if (!isStaff(u.me)) { u.send("Permission denied."); return; }
  const eq = rest.indexOf("=");
  if (eq < 0) { u.send("Syntax: +zone/flavor <name>=on|off"); return; }
  const name = rest.slice(0, eq).trim();
  const state = rest.slice(eq + 1).trim().toLowerCase();
  if (state !== "on" && state !== "off") {
    u.send("State must be on or off.");
    return;
  }
  const z = await findZoneByName(name);
  if (!z) { u.send(`No zone named '${name}'.`); return; }
  const updated = await setFlavorEnabled(z.id, state === "on");
  if (!updated) { u.send("Update failed."); return; }
  u.send(`Flavor ${state === "on" ? "enabled" : "disabled"} for zone %ch${name}%cn.`);
}

// ---------------------------------------------------------------------------
// /theme <name>=<theme>|none
// ---------------------------------------------------------------------------

async function zoneTheme(u: IUrsamuSDK, rest: string): Promise<void> {
  if (!isStaff(u.me)) { u.send("Permission denied."); return; }
  const eq = rest.indexOf("=");
  if (eq < 0) { u.send("Syntax: +zone/theme <name>=<theme>|none"); return; }
  const name = rest.slice(0, eq).trim();
  const theme = rest.slice(eq + 1).trim().toLowerCase();
  const z = await findZoneByName(name);
  if (!z) { u.send(`No zone named '${name}'.`); return; }
  if (theme === "" || theme === "none") {
    const updated = await setZoneTheme(z.id, null);
    if (!updated) { u.send("Update failed."); return; }
    u.send(`Theme cleared for zone %ch${name}%cn.`);
    return;
  }
  const valid = themeKeys() as string[];
  if (!valid.includes(theme)) {
    u.send(`Unknown theme '${theme}'. Valid: ${valid.join(", ")}`);
    return;
  }
  const updated = await setZoneTheme(z.id, theme);
  if (!updated) { u.send("Update failed."); return; }
  u.send(`Theme set to '${theme}' for zone %ch${name}%cn.`);
}

// ---------------------------------------------------------------------------
// /migration <name>=on|off
// ---------------------------------------------------------------------------

async function zoneMigration(u: IUrsamuSDK, rest: string): Promise<void> {
  if (!isStaff(u.me)) { u.send("Permission denied."); return; }
  const eq = rest.indexOf("=");
  if (eq < 0) { u.send("Syntax: +zone/migration <name>=on|off"); return; }
  const name = rest.slice(0, eq).trim();
  const state = rest.slice(eq + 1).trim().toLowerCase();
  if (state !== "on" && state !== "off") {
    u.send("State must be on or off.");
    return;
  }
  const z = await findZoneByName(name);
  if (!z) { u.send(`No zone named '${name}'.`); return; }
  const updated = await setMigration(z.id, state === "on");
  if (!updated) { u.send("Update failed."); return; }
  u.send(
    `Migration ${state === "on" ? "enabled" : "disabled"} for zone %ch${name}%cn.`,
  );
}

// ---------------------------------------------------------------------------
// /destroy <name>
// ---------------------------------------------------------------------------

async function zoneDestroy(u: IUrsamuSDK, name: string): Promise<void> {
  if (!isStaff(u.me)) { u.send("Permission denied."); return; }
  if (!name) { u.send("Syntax: +zone/destroy <name>"); return; }
  const z = await findZoneByName(name);
  if (!z) { u.send(`No zone named '${name}'.`); return; }
  await destroyZone(z.id);
  u.send(`Zone %ch${name}%cn destroyed. NPCs were NOT removed; use +npc/destroy to clean up.`);
}

// Re-export Zone type for tests if needed.
export type { Zone };
