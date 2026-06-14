// Zones -- staff-defined regions of rooms populated with themed NPCs that
// wander on a tick when no combat is happening, and auto-initiate combat
// when a PC enters a room where a territorial/hunter mob lives.
//
// Wandering pauses in any room with an active encounter, so the turn-based
// core is never interrupted. Mobs stay inside their zone's roomIds.

import { createObj, DBO, type IDBObj, type IUrsamuSDK, dbojs } from "@ursamu/ursamu";
import { exitsFromRoom, queryByLocation } from "./dbo_normalize.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MobAggro = "passive" | "territorial" | "hunter";

export interface SpawnRule {
  archetype: string;
  count: number;
  aggro: MobAggro;
}

export interface Zone {
  id: string;
  name: string;
  roomIds: string[];
  spawnRules: SpawnRule[];
  wanderEnabled: boolean;
  wanderIntervalMs: number;
  createdAt: number;
  createdBy: string;
  /** Optional v2 theme key (forest, city, urban-decay, sewer, ruins). */
  theme?: string;
  /** Whether ambient flavor broadcasts fire for this zone. Default true. */
  flavorEnabled?: boolean;
  /**
   * Respawn cooldown in ms. When undefined, respawn is off. When set, every
   * tick the zone re-checks live counts against spawn rules and refills any
   * deficits, throttled by lastRespawnAt.
   */
  respawnCooldownMs?: number;
  /** Last epoch-ms when a respawn check actually spawned mobs. */
  lastRespawnAt?: number;
  /**
   * Inter-zone migration. When true, wander may step a mob into adjacent
   * rooms outside this zone, transferring the mob to whichever zone owns
   * the destination (per findZoneForRoom precedence). Default off.
   */
  allowMigration?: boolean;
}

// ---------------------------------------------------------------------------
// DBO + active interval registry
// ---------------------------------------------------------------------------

export const zoneDb = new DBO<Zone>("cofd.zones");

// deno-lint-ignore no-explicit-any
type Q = any;

const intervals = new Map<string, number>();
const flavorTicks = new Map<string, number>();

/** Hard cap on per-tick respawn spawns to bound DBO writes per cycle. */
const MAX_RESPAWN_PER_TICK = 10;
/** Hard cap on spawn rules per zone to bound /show output and respawn cost. */
const MAX_SPAWN_RULES = 32;

// ---------------------------------------------------------------------------
// CRUD helpers
// ---------------------------------------------------------------------------

export async function createZone(
  name: string,
  anchorRoomId: string,
  createdBy: string,
): Promise<Zone> {
  const now = Date.now();
  const zone: Zone = {
    id: `zone-${now}-${Math.floor(Math.random() * 1e6)}`,
    name,
    roomIds: [anchorRoomId],
    spawnRules: [],
    wanderEnabled: false,
    wanderIntervalMs: 30_000,
    createdAt: now,
    createdBy,
  };
  await zoneDb.create(zone);
  return zone;
}

export async function findZoneByName(name: string): Promise<Zone | null> {
  return (await zoneDb.findOne({ name } as Q)) ?? null;
}

/**
 * Find the zone that owns this room. When a room belongs to multiple zones
 * (overlap), the OLDEST zone wins -- creation order is the deterministic
 * tiebreak so aggro/wander behavior is stable regardless of iteration.
 */
export async function findZoneForRoom(roomId: string): Promise<Zone | null> {
  // deno-lint-ignore no-explicit-any
  const all = await zoneDb.find({} as any);
  const owners = all.filter((z) => z.roomIds.includes(roomId));
  if (owners.length === 0) return null;
  // Primary key: createdAt ASC (oldest wins). Secondary: zone.id ASC, which
  // makes the tiebreak resistant to direct-DB forgery of createdAt
  // (L1 defense-in-depth).
  owners.sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return owners[0];
}

export async function listZones(): Promise<Zone[]> {
  // deno-lint-ignore no-explicit-any
  return await zoneDb.find({} as any);
}

export async function addRoomsToZone(
  zoneId: string,
  roomIds: string[],
): Promise<Zone | null> {
  try {
    return await zoneDb.atomicModify(zoneId, (cur) => ({
      ...cur,
      roomIds: Array.from(new Set([...cur.roomIds, ...roomIds])),
    }));
  } catch { return null; }
}

export async function addSpawnRule(
  zoneId: string,
  rule: SpawnRule,
): Promise<Zone | null> {
  try {
    return await zoneDb.atomicModify(zoneId, (cur) => {
      // Cap rules array (L4). If full, drop the oldest to make room.
      const trimmed = cur.spawnRules.length >= MAX_SPAWN_RULES
        ? cur.spawnRules.slice(-(MAX_SPAWN_RULES - 1))
        : cur.spawnRules;
      return { ...cur, spawnRules: [...trimmed, rule] };
    });
  } catch { return null; }
}

export async function setWanderEnabled(
  zoneId: string,
  enabled: boolean,
): Promise<Zone | null> {
  try {
    return await zoneDb.atomicModify(zoneId, (cur) => ({
      ...cur,
      wanderEnabled: enabled,
    }));
  } catch { return null; }
}

export async function setRespawnCooldown(
  zoneId: string,
  cooldownMs: number | null,
): Promise<Zone | null> {
  try {
    return await zoneDb.atomicModify(zoneId, (cur) => {
      const next = { ...cur };
      if (cooldownMs === null) {
        delete next.respawnCooldownMs;
        delete next.lastRespawnAt;
      } else {
        next.respawnCooldownMs = cooldownMs;
      }
      return next;
    });
  } catch { return null; }
}

export async function setFlavorEnabled(
  zoneId: string,
  enabled: boolean,
): Promise<Zone | null> {
  try {
    return await zoneDb.atomicModify(zoneId, (cur) => ({
      ...cur,
      flavorEnabled: enabled,
    }));
  } catch { return null; }
}

export async function setMigration(
  zoneId: string,
  enabled: boolean,
): Promise<Zone | null> {
  try {
    return await zoneDb.atomicModify(zoneId, (cur) => ({
      ...cur,
      allowMigration: enabled,
    }));
  } catch { return null; }
}

export async function setZoneTheme(
  zoneId: string,
  theme: string | null,
): Promise<Zone | null> {
  try {
    return await zoneDb.atomicModify(zoneId, (cur) => {
      const next = { ...cur };
      if (theme === null) delete next.theme;
      else next.theme = theme;
      return next;
    });
  } catch { return null; }
}

export async function destroyZone(zoneId: string): Promise<void> {
  stopWander(zoneId);
  await zoneDb.delete({ id: zoneId } as Q);
}

// ---------------------------------------------------------------------------
// Adjacency (via exit objects)
// ---------------------------------------------------------------------------

/**
 * Return ids of rooms reachable from `roomId` via one exit hop.
 * Handles both engine-raw and mock-flat storage shapes via dbo_normalize.
 */
export async function findAdjacentRooms(roomId: string): Promise<string[]> {
  return await exitsFromRoom(roomId);
}

// ---------------------------------------------------------------------------
// Mob discovery
// ---------------------------------------------------------------------------

interface MobMeta {
  zoneId?: string;
  aggro?: MobAggro;
  homeRoomId?: string;
  wanderRange?: number;
}

function mobMeta(obj: IDBObj): MobMeta | null {
  // deno-lint-ignore no-explicit-any
  const sheet = obj.state?.cofd as any;
  if (!sheet?.npc) return null;
  const n = sheet.npc;
  if (!n.zoneId) return null;
  return {
    zoneId: n.zoneId,
    aggro: n.aggro ?? "passive",
    homeRoomId: n.homeRoomId,
    wanderRange: n.wanderRange,
  };
}

/** Find all live NPC mobs anywhere in the zone (across every roomId). */
export async function mobsInZone(zone: Zone): Promise<IDBObj[]> {
  const out: IDBObj[] = [];
  for (const rid of zone.roomIds) {
    const here = await mobsInRoomForZone(rid, zone.id);
    out.push(...here);
  }
  return out;
}

/** Read the archetype key stamped on an NPC sheet, or null. */
function mobArchetypeKey(obj: IDBObj): string | null {
  // deno-lint-ignore no-explicit-any
  const sheet = obj.state?.cofd as any;
  return sheet?.npc?.archetype ?? null;
}

/** Find NPC mobs in a room that belong to the given zone. */
export async function mobsInRoomForZone(
  roomId: string,
  zoneId: string,
): Promise<IDBObj[]> {
  const here = await queryByLocation(roomId);
  return here.filter((o) => {
    if (!o.flags?.has?.("npc")) return false;
    return mobMeta(o)?.zoneId === zoneId;
  });
}

/**
 * Build a minimal synthetic IUrsamuSDK for hook contexts (player:move,
 * engine:ready) that lack a real SDK. Routes broadcast to all sockets in
 * the given room and wires db.search/db.create through the global dbojs.
 *
 * Only the subset needed by ensureEncounter/autoJoinTarget is implemented;
 * anything else will throw — keep usage scoped to those helpers.
 */
// deno-lint-ignore no-explicit-any
export async function makeHookSdk(playerActor: IDBObj, roomId: string): Promise<any> {
  const { send, sessions } = await import("@ursamu/ursamu");
  const doBroadcast = async (msg: string): Promise<void> => {
    const inRoom = await queryByLocation(roomId);
    const ids = inRoom
      .filter((o) => o.flags?.has?.("player"))
      .map((o) => o.id);
    if (ids.length === 0) return;
    // deno-lint-ignore no-explicit-any
    const targets = sessions.list().filter((s: any) => ids.includes(s.actorId))
      // deno-lint-ignore no-explicit-any
      .map((s: any) => s.socketId);
    if (targets.length > 0) send(targets, msg, {});
  };
  const broadcastToRoom = (msg: string): void => {
    doBroadcast(msg).catch(() => { /* swallow */ });
  };
  const here = { id: roomId, broadcast: broadcastToRoom };

  return {
    me: playerActor,
    here,
    broadcast: broadcastToRoom,
    send: (msg: string) => broadcastToRoom(msg),
    db: {
      // deno-lint-ignore no-explicit-any
      search: async (q: any) => (await dbojs.query(q)) as unknown as IDBObj[],
      // deno-lint-ignore no-explicit-any
      create: async (spec: any) => (await dbojs.create(spec)) as unknown as IDBObj,
      // deno-lint-ignore no-explicit-any
      modify: async (id: string, op: string, patch: any) =>
        await dbojs.modify({ id }, op as never, patch),
    },
    canEdit: () => Promise.resolve(true),
    util: { target: () => Promise.resolve(null), stripSubs: (s: string) => s },
    cmd: { name: "", original: "", args: ["", ""], switches: [] },
  };
}

/** Find aggro mobs (territorial or hunter) in a room. */
export async function aggroMobsInRoom(roomId: string): Promise<IDBObj[]> {
  const here = await queryByLocation(roomId);
  return here.filter((o) => {
    if (!o.flags?.has?.("npc")) return false;
    const m = mobMeta(o);
    return m?.aggro === "territorial" || m?.aggro === "hunter";
  });
}

// ---------------------------------------------------------------------------
// Wander tick
// ---------------------------------------------------------------------------

/**
 * Whether a room currently has an active combat encounter. Walker / wander
 * skip these rooms so turn-based combat is never disturbed.
 */
async function roomHasActiveEncounter(roomId: string): Promise<boolean> {
  const { getEncounterForRoom } = await import("./encounter.ts");
  const enc = await getEncounterForRoom(roomId);
  return !!enc && enc.status === "active";
}

/**
 * Walk the zone's roomIds and return the first room that contains an
 * active encounter with at least one PC participant. Used by hunter-aggro
 * mobs to navigate toward distant fights.
 */
export async function findActiveEncounterRoomInZone(
  zoneRoomIds: string[],
): Promise<string | null> {
  const { getEncounterForRoom } = await import("./encounter.ts");
  for (const rid of zoneRoomIds) {
    const enc = await getEncounterForRoom(rid);
    if (!enc || enc.status !== "active") continue;
    const hasPc = enc.participants.some((p) => p.kind === "pc");
    if (hasPc) return rid;
  }
  return null;
}

function pickRandom<T>(arr: T[]): T | null {
  if (arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Run one wander step for the zone. */
export async function tickZone(zoneId: string): Promise<void> {
  let z = await zoneDb.findOne({ id: zoneId } as Q);
  if (!z || !z.wanderEnabled) return;

  // Respawn pass: refill any spawn-rule deficits, throttled by cooldown.
  // Runs before wander so freshly-spawned mobs are eligible candidates.
  try {
    const spawned = await runRespawnPass(z);
    if (spawned > 0) {
      const refreshed = await zoneDb.findOne({ id: zoneId } as Q);
      if (refreshed) z = refreshed;
    }
  } catch (e) { console.error("respawn pass threw:", e); }

  // Collect all mobs across all zone rooms (excluding those in active combat).
  const candidates: { mob: IDBObj; meta: MobMeta }[] = [];
  for (const rid of z.roomIds) {
    if (await roomHasActiveEncounter(rid)) continue;
    const mobs = await mobsInRoomForZone(rid, zoneId);
    for (const m of mobs) {
      const meta = mobMeta(m);
      if (!meta) continue;
      candidates.push({ mob: m, meta });
    }
  }

  const pick = pickRandom(candidates);
  if (!pick) return;
  const { mob } = pick;
  const here = mob.location;
  if (!here) return;

  // Adjacent room candidates. By default stay inside the current zone; when
  // /migration is on, allow stepping into adjacent rooms that belong to
  // ANY zone (precedence resolved on arrival via findZoneForRoom).
  const allAdj = await findAdjacentRooms(here);
  const adj = z.allowMigration
    ? allAdj
    : allAdj.filter((rid) => z.roomIds.includes(rid));

  // Hunters seek distant active encounters: weighted Dijkstra toward the
  // first room in the zone that has an active fight with a PC, AVOIDING
  // rooms that already have unrelated active combat (otherwise the hunter
  // gets pulled into the wrong fight on the way).
  let dest: string | null = null;
  if (pick.meta?.aggro === "hunter") {
    const encRoom = await findActiveEncounterRoomInZone(z.roomIds);
    if (encRoom && encRoom !== here) {
      const { nextHopToward } = await import("./pathfind.ts");
      const hop = await nextHopToward(here, encRoom, z.roomIds, {
        maxDepth: 6,
        costOf: async (rid) => {
          // The goal room is always traversable. Detours through other
          // active-combat rooms cost a lot so the path routes around them.
          if (rid === encRoom) return 1;
          return (await roomHasActiveEncounter(rid)) ? 1000 : 1;
        },
      });
      if (hop) dest = hop;
    }
  }
  if (!dest) dest = pickRandom(adj);
  if (!dest || dest === here) return;

  // Re-check the zone right before mutating; a concurrent /destroy may
  // have wiped it between the initial fetch and now. For non-migration
  // moves the dest MUST stay inside the current zone; for migration moves
  // we allow ANY destination but require the source zone to still exist.
  const still = await zoneDb.findOne({ id: zoneId } as Q);
  if (!still) return;
  const isMigrating = !still.roomIds.includes(dest);
  if (isMigrating && !still.allowMigration) return;

  // Move the mob: use db modify on location.
  await dbojs.modify({ id: mob.id }, "$set", { location: dest });

  // Inter-zone migration: if the destination is outside the source zone,
  // transfer ownership to whichever zone owns the dest room. If the dest
  // has no owner (H2: race against /destroy of the dest zone), keep the
  // mob under the SOURCE zone so it isn't orphaned and the source zone
  // can keep grooming it. Mob's homeRoomId stays put so respawn logic
  // still treats it as a leaver, not a recurring slot.
  if (isMigrating) {
    const newOwner = await findZoneForRoom(dest);
    const nextZoneId = newOwner?.id ?? still.id;
    // deno-lint-ignore no-explicit-any
    const sheet = (mob.state?.cofd ?? {}) as any;
    const nextNpc = { ...(sheet.npc ?? {}), zoneId: nextZoneId };
    await dbojs.modify({ id: mob.id }, "$set", {
      "data.cofd": { ...sheet, npc: nextNpc },
      // deno-lint-ignore no-explicit-any
    } as any);
    // H1: stop processing this mob in the source tick after migration --
    // the destination zone's own tick will pick it up.
    return;
  }

  // If the destination room has a player AND this mob is aggro, open an
  // encounter so wandering hunters actually pick fights when they arrive.
  const meta = mobMeta(mob);
  if (meta?.aggro === "territorial" || meta?.aggro === "hunter") {
    try {
      const inRoom = await queryByLocation(dest);
      const player = inRoom.find((o) => o.flags?.has?.("player"));
      if (player) {
        const { ensureEncounter, autoJoinTarget } = await import("./auto.ts");
        const u = await makeHookSdk(player, dest);
        const enc = await ensureEncounter(u, player);
        if (enc) await autoJoinTarget(u, enc, mob);
      }
    } catch { /* swallow */ }
  }

  // -------------------------------------------------------------------------
  // Ambient flavor broadcast (every ~3rd tick per zone, skipping combat rooms
  // and empty rooms).
  // -------------------------------------------------------------------------
  try {
    const prev = flavorTicks.get(zoneId) ?? 0;
    const next = prev + 1;
    flavorTicks.set(zoneId, next);
    if (z.flavorEnabled !== false && next % 3 === 0) {
      const { pickFlavor } = await import("./flavor.ts");
      const line = pickFlavor(z.theme);
      if (line) {
        // Find candidate rooms: have at least one player, no active encounter.
        const candidateRooms: string[] = [];
        for (const rid of z.roomIds) {
          if (await roomHasActiveEncounter(rid)) continue;
          const inRoom = await queryByLocation(rid);
          const hasPlayer = inRoom.some((o) => o.flags?.has?.("player"));
          if (hasPlayer) candidateRooms.push(rid);
        }
        const room = pickRandom(candidateRooms);
        if (room) {
          const { send, sessions } = await import("@ursamu/ursamu");
          const inRoom = await queryByLocation(room);
          const ids = inRoom
            .filter((o) => o.flags?.has?.("player"))
            .map((o) => o.id);
          if (ids.length > 0) {
            // deno-lint-ignore no-explicit-any
            const targets = sessions.list().filter((s: any) => ids.includes(s.actorId))
              // deno-lint-ignore no-explicit-any
              .map((s: any) => s.socketId);
            if (targets.length > 0) send(targets, line, {});
          }
        }
      }
    }
  } catch { /* swallow */ }
}

export function startWander(zoneId: string, intervalMs: number): void {
  stopWander(zoneId);
  const handle = setInterval(() => {
    tickZone(zoneId).catch(() => { /* swallow */ });
  }, intervalMs);
  // Allow the Deno process / test runner to exit cleanly even if intervals
  // are still armed. Deno's timer handles support unref via the global
  // Deno.unrefTimer helper.
  try { Deno.unrefTimer(handle); } catch { /* not in Deno or unsupported */ }
  intervals.set(zoneId, handle);
}

export function stopWander(zoneId: string): void {
  const handle = intervals.get(zoneId);
  if (handle !== undefined) {
    clearInterval(handle);
    intervals.delete(zoneId);
  }
}

export function stopAllWanderers(): void {
  for (const h of intervals.values()) clearInterval(h);
  intervals.clear();
}

/** Re-arm intervals at engine:ready for every enabled zone. */
export async function rearmAllWanderers(): Promise<void> {
  const zones = await listZones();
  for (const z of zones) {
    if (z.wanderEnabled) startWander(z.id, z.wanderIntervalMs);
  }
}

// ---------------------------------------------------------------------------
// Spawn helper
// ---------------------------------------------------------------------------

/**
 * Spawn one mob into the zone using dbojs directly. Shared by /populate and
 * the respawn tick. Returns the created object's id, or null on failure.
 */
async function spawnOneMob(
  zone: Zone,
  archetypeKey: string,
  aggro: MobAggro,
): Promise<string | null> {
  if (zone.roomIds.length === 0) return null;
  const { getArchetype, sheetFromArchetype } = await import(
    "../npc/archetypes.ts"
  );
  const archetype = getArchetype(archetypeKey);
  if (!archetype) return null;

  const homeRoomId = pickRandom(zone.roomIds)!;
  const sheet = sheetFromArchetype(archetype, archetype.tier, {
    aiArchetype: "beshilu-swarmer",
  });
  // deno-lint-ignore no-explicit-any
  (sheet.npc as any).zoneId = zone.id;
  // deno-lint-ignore no-explicit-any
  (sheet.npc as any).aggro = aggro;
  // deno-lint-ignore no-explicit-any
  (sheet.npc as any).homeRoomId = homeRoomId;
  // deno-lint-ignore no-explicit-any
  (sheet.npc as any).wanderRange = 1;

  // createObj signature: (flagsStr, data) -> IDBOBJ[]. It generates the id
  // and emits the proper engine events. Swallows failures so a single bad
  // spawn doesn't break a respawn pass.
  try {
    const created = await createObj("npc thing", {
      name: archetype.label,
      location: homeRoomId,
      state: { cofd: sheet },
      contents: [],
    });
    const npcObj = (created as unknown as Array<{ id: string }>)?.[0];
    return npcObj?.id ?? null;
  } catch { return null; }
}

/**
 * Spawn `count` mobs of the given archetype into random rooms of the zone.
 * Each gets sheet.npc.{zoneId, aggro, homeRoomId, wanderRange} stamped on.
 * Returns the ids of created objects. (The IUrsamuSDK arg is kept for the
 * existing /populate caller signature, but the create itself goes through
 * dbojs so respawn from the tick can share the path.)
 */
export async function spawnMobs(
  _u: IUrsamuSDK,
  zone: Zone,
  archetypeKey: string,
  count: number,
  aggro: MobAggro,
): Promise<string[]> {
  const created: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = await spawnOneMob(zone, archetypeKey, aggro);
    if (id) created.push(id);
  }
  return created;
}

/**
 * One pass of the respawn check. For each spawn rule, count live (not
 * incapacitated) zone-tagged mobs of that archetype and refill any deficit
 * up to the rule's count. Throttled by `respawnCooldownMs`. Returns the
 * number of mobs respawned, or 0 if cooldown not elapsed.
 */
/**
 * Atomically claim the respawn cooldown window for a zone. Returns true if
 * this caller won the CAS race and may proceed with the respawn pass.
 * Two concurrent invocations will see exactly one true return -- the loser
 * sees the winner's updated lastRespawnAt and the cooldown check trips.
 *
 * Returns false if respawn is disabled (no cooldown set) or the cooldown
 * window has not elapsed.
 */
export async function claimRespawn(zoneId: string): Promise<boolean> {
  let won = false;
  try {
    await zoneDb.atomicModify(zoneId, (cur) => {
      won = false;
      if (!cur.respawnCooldownMs) return cur;
      const last = cur.lastRespawnAt ?? 0;
      if (Date.now() - last < cur.respawnCooldownMs) return cur;
      won = true;
      return { ...cur, lastRespawnAt: Date.now() };
    });
  } catch { return false; }
  return won;
}

async function runRespawnPass(zone: Zone): Promise<number> {
  if (!zone.respawnCooldownMs || zone.spawnRules.length === 0) return 0;
  // Atomically claim the cooldown window; a parallel tick that lost the
  // race here will see the updated lastRespawnAt and return 0.
  const won = await claimRespawn(zone.id);
  if (!won) return 0;

  const live = await mobsInZone(zone);
  const liveByArch = new Map<string, number>();
  for (const m of live) {
    // Skip mobs that are incapacitated. They count as "down" for respawn.
    // deno-lint-ignore no-explicit-any
    const sheet = m.state?.cofd as any;
    const h = sheet?.health ?? { bashing: 0, lethal: 0, aggravated: 0 };
    const size = sheet?.advantages?.size ?? 5;
    const stam = sheet?.attributes?.stamina ?? sheet?.attributes?.Stamina ?? 1;
    const filled = (h.bashing ?? 0) + (h.lethal ?? 0) + (h.aggravated ?? 0);
    if (filled >= size + stam) continue;
    const key = mobArchetypeKey(m);
    if (!key) continue;
    liveByArch.set(key, (liveByArch.get(key) ?? 0) + 1);
  }

  // Collapse stacked rules: if staff added the same archetype twice, take
  // the MAX of the counts (and the aggro from that rule) rather than
  // summing -- prevents unbounded growth via rule stacking (H2).
  const collapsed = new Map<string, { count: number; aggro: MobAggro }>();
  for (const rule of zone.spawnRules) {
    const cur = collapsed.get(rule.archetype);
    if (!cur || rule.count > cur.count) {
      collapsed.set(rule.archetype, { count: rule.count, aggro: rule.aggro });
    }
  }

  let spawned = 0;
  for (const [archetypeKey, { count, aggro }] of collapsed) {
    if (spawned >= MAX_RESPAWN_PER_TICK) break;
    const have = liveByArch.get(archetypeKey) ?? 0;
    const deficit = Math.min(count - have, MAX_RESPAWN_PER_TICK - spawned);
    for (let i = 0; i < deficit; i++) {
      const id = await spawnOneMob(zone, archetypeKey, aggro);
      if (id) spawned += 1;
    }
  }

  // lastRespawnAt was already advanced by claimRespawn; no extra write needed.
  return spawned;
}
