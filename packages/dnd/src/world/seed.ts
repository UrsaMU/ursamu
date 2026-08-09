/**
 * Idempotent Havenbrook starter world seed (engine:ready).
 */
import {
  createObj,
  dbojs,
  DBO,
  getConfig,
  setConfig,
} from "@ursamu/ursamu";
import { defaultSheet, migrateSheet } from "../stats/dnd_sheet.ts";
import { NPC_TEMPLATES } from "../combat/npc-templates.ts";
import type {
  SeedRecord,
  StarterWorldDef,
  TownDef,
  WorldNpcDef,
  WorldVendorDef,
} from "./types.ts";
import {
  seedTownMapOverlays,
  validateTownMap,
} from "./map-seed.ts";
import worldJson from "../../resources/starter-world.json" with {
  type: "json",
};

export const WORLD: StarterWorldDef = worldJson as StarterWorldDef;
export type { TownDef };

const seedDb = new DBO<SeedRecord>("dnd.world_seed");
const SEED_ID = "starter";

export type SeedResult = {
  ok: boolean;
  skipped?: boolean;
  message: string;
  record?: SeedRecord;
};

function flagStr(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw instanceof Set) return [...raw].map(String).join(" ");
  if (Array.isArray(raw)) return raw.map(String).join(" ");
  return String(raw ?? "");
}

async function findOocLounge(): Promise<string | null> {
  const rooms = await dbojs.query({ flags: /room/i });
  for (const r of rooms) {
    const n = String(
      (r.data as { name?: string } | undefined)?.name ?? "",
    ).toLowerCase();
    if (n.includes("ooc") || n.includes("lounge")) {
      return r.id;
    }
  }
  // Default engine start room
  const one = await dbojs.queryOne({ id: "1" });
  if (one && flagStr(one.flags).includes("room")) return "1";
  return null;
}

async function roomExists(id: string): Promise<boolean> {
  const o = await dbojs.queryOne({ id });
  return !!(o && flagStr(o.flags).includes("room"));
}

async function createRoom(
  name: string,
  description: string,
  key: string,
  townId: string = WORLD.id,
): Promise<string> {
  const made = await createObj("room safe", {
    name,
    description,
    dndStarter: townId,
    dndRoomKey: key,
    dndTown: townId,
  });
  const id = made[0]?.id;
  if (!id) throw new Error(`Failed to create room ${name}`);
  return id;
}

export async function createExit(
  fromId: string,
  toId: string,
  name: string,
  townId: string = WORLD.id,
): Promise<string> {
  const made = await createObj("exit", {
    name,
    destination: toId,
    dndStarter: townId,
  });
  const id = made[0]?.id;
  if (!id) throw new Error(`Failed exit ${name}`);
  await dbojs.modify({ id }, "$set", { location: fromId });
  return id;
}

async function exitExists(
  fromId: string,
  toId: string,
): Promise<boolean> {
  const exits = await dbojs.query({
    location: fromId,
    flags: /exit/i,
  });
  return exits.some((e) => {
    const d = e.data as { destination?: string } | undefined;
    return String(d?.destination ?? "") === toId;
  });
}

function vendorPayload(
  def: WorldVendorDef,
  townId: string,
  faction?: string,
) {
  return {
    inventory: def.inventory ?? [],
    desc: def.description ?? "",
    faction: faction ?? townId,
  };
}

async function seedVendor(
  roomId: string,
  def: WorldVendorDef,
  townId: string,
  faction?: string,
): Promise<string> {
  const made = await createObj("thing", {
    name: def.name,
    description: def.description ?? "",
    dndStarter: townId,
    dndFaction: faction ?? townId,
    vendor: vendorPayload(def, townId, faction),
    owner: "1",
  });
  const id = made[0]?.id;
  if (!id) throw new Error(`vendor ${def.name}`);
  // Force thing flag + vendor blob (Tags may have dropped "thing"
  // before it was registered; always re-assert for shops).
  await dbojs.modify({ id }, "$set", {
    location: roomId,
    flags: "thing",
    "data.vendor": vendorPayload(def, townId, faction),
    "data.description": def.description ?? "",
    "data.dndStarter": townId,
    "data.dndFaction": faction ?? townId,
  });
  return id;
}

/** All objects with this exact display name (any room). */
async function findAllByName(name: string): Promise<string[]> {
  const rows = await dbojs.query({
    "data.name": new RegExp(
      `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
      "i",
    ),
  });
  return rows.map((o) => String(o.id));
}

/**
 * Repair / re-stock existing seed vendors so +list finds them and
 * inventory matches world JSON (idempotent). Match by name (global
 * search), not array index — new stalls must not overwrite others.
 */
async function ensureSeededVendors(
  roomIds: Record<string, string>,
  vendorIds: string[],
  townId: string,
  faction: string,
  defs: WorldVendorDef[] = WORLD.vendors ?? [],
): Promise<string[]> {
  const out: string[] = [];
  const used = new Set<string>();

  for (const def of defs) {
    const rid = roomIds[def.room];
    if (!rid) continue;

    // Collect every object with this name; keep one, delete extras
    // (earlier index-based repair could leave duplicates).
    const candidates = new Set<string>();
    for (const vid of vendorIds) {
      if (!vid || used.has(vid)) continue;
      const obj = await dbojs.queryOne({ id: vid });
      if (!obj) continue;
      const n = String(
        (obj.data as { name?: string } | undefined)?.name ?? "",
      ).toLowerCase();
      if (n === def.name.toLowerCase()) candidates.add(vid);
    }
    for (const id of await findAllByName(def.name)) {
      if (!used.has(id)) candidates.add(id);
    }

    let id = [...candidates][0];
    if (!id) {
      id = await seedVendor(rid, def, townId, faction);
      out.push(id);
      used.add(id);
      continue;
    }

    // Destroy name-colliding extras so +list is not doubled
    for (const extra of candidates) {
      if (extra === id) continue;
      try {
        await dbojs.delete({ id: extra });
      } catch {
        /* ignore */
      }
    }

    const obj = await dbojs.queryOne({ id });
    const data = (obj?.data ?? {}) as Record<string, unknown>;
    const flags = flagStr(obj?.flags);
    const nextFlags = /\bthing\b/i.test(flags)
      ? flags
      : (flags ? `${flags} thing` : "thing").trim();
    await dbojs.modify({ id }, "$set", {
      location: rid,
      flags: nextFlags,
      "data.name": def.name,
      "data.vendor": vendorPayload(def, townId, faction),
      "data.description": def.description ??
        String(data.description ?? ""),
      "data.dndStarter": townId,
      "data.dndFaction": faction,
    });
    out.push(id);
    used.add(id);
  }
  return out;
}

async function seedNpc(
  roomId: string,
  def: WorldNpcDef,
  townId: string,
): Promise<string> {
  const t = NPC_TEMPLATES[def.template.toLowerCase()];
  const sheet = migrateSheet(defaultSheet());
  sheet.class = "Monster";
  sheet.species = "NPC";
  sheet.background = "None";
  if (t) {
    sheet.hp = { max: t.hp, current: t.hp, temp: 0 };
    sheet.ac = t.ac;
    sheet.xp = t.xp;
    sheet.abilities = {
      strength: t.abilities.strength ?? 10,
      dexterity: t.abilities.dexterity ?? 10,
      constitution: t.abilities.constitution ?? 10,
      intelligence: t.abilities.intelligence ?? 10,
      wisdom: t.abilities.wisdom ?? 10,
      charisma: t.abilities.charisma ?? 10,
    };
    if (t.spells?.length) sheet.spells = [...t.spells];
    // deno-lint-ignore no-explicit-any
    (sheet as any).drops = t.drops ?? [];
    // deno-lint-ignore no-explicit-any
    if (t.cr) (sheet as any).cr = t.cr;
    // deno-lint-ignore no-explicit-any
    (sheet as any).npcTemplate = def.template.toLowerCase();
  } else {
    sheet.hp = { max: 10, current: 10, temp: 0 };
  }
  // deno-lint-ignore no-explicit-any
  (sheet as any).aiKey = "aggressive";

  const made = await createObj("thing npc", {
    name: def.name,
    description: t
      ? `A ${t.name} (CR ${t.cr ?? "?"}).`
      : "A creature.",
    dndStarter: townId,
    dnd: sheet,
    owner: "1",
  });
  const id = made[0]?.id;
  if (!id) throw new Error(`npc ${def.name}`);
  await dbojs.modify({ id }, "$set", { location: roomId });

  if (t?.weapon) {
    const wpn = await createObj("thing", {
      name: t.weapon.name,
      dndStarter: townId,
      dnd: {
        type: "weapon",
        damage: t.weapon.damage,
        damageType: t.weapon.damageType,
        properties: t.weapon.finesse ? ["finesse"] : [],
        weaponType: t.weapon.ranged ? "ranged" : "melee",
        equipped: true,
      },
      owner: id,
    });
    const wid = wpn[0]?.id;
    if (wid) {
      await dbojs.modify({ id: wid }, "$set", {
        location: id,
      });
    }
  }
  return id;
}

/**
 * Validate world JSON graph (no DB). Used by tests.
 */
export function validateWorldGraph(
  w: StarterWorldDef = WORLD,
): string[] {
  const errs: string[] = [];
  const keys = new Set(w.rooms.map((r) => r.key));
  if (!keys.has(w.playerStartKey)) {
    errs.push(`playerStartKey missing: ${w.playerStartKey}`);
  }
  for (const e of w.exits) {
    if (!keys.has(e.from)) errs.push(`exit from unknown ${e.from}`);
    if (!keys.has(e.to)) errs.push(`exit to unknown ${e.to}`);
  }
  for (const v of w.vendors ?? []) {
    if (!keys.has(v.room)) errs.push(`vendor room ${v.room}`);
  }
  for (const n of w.npcs ?? []) {
    if (!keys.has(n.room)) errs.push(`npc room ${n.room}`);
    if (!NPC_TEMPLATES[n.template.toLowerCase()]) {
      errs.push(`npc template missing: ${n.template}`);
    }
  }
  errs.push(...validateTownMap(w));
  return errs;
}

export async function getSeedRecord(): Promise<SeedRecord | null> {
  const row = await seedDb.queryOne({ id: SEED_ID });
  return row || null;
}

/** Seed record for any town (starter id or town:<id>). */
export async function getTownSeed(
  townId: string,
): Promise<SeedRecord | null> {
  if (
    townId === WORLD.id || townId === "havenbrook-v1" ||
    townId === "starter" || townId === "havenbrook"
  ) {
    return getSeedRecord();
  }
  const sid = townId.startsWith("town:")
    ? townId
    : `town:${townId}`;
  const row = await seedDb.queryOne({ id: sid });
  return (row as SeedRecord) || null;
}

export async function listTownSeeds(): Promise<SeedRecord[]> {
  const all = await seedDb.all();
  return all as SeedRecord[];
}

export { exitExists, createRoom, seedDb };

/**
 * Seed Havenbrook once. force=true recreates only if prior
 * rooms are gone; otherwise no-ops when record exists.
 */
export async function seedStarterWorld(
  opts: { force?: boolean } = {},
): Promise<SeedResult> {
  const graphErrs = validateWorldGraph(WORLD);
  if (graphErrs.length) {
    return {
      ok: false,
      message: `Invalid world graph: ${graphErrs.join("; ")}`,
    };
  }

  const existing = await getSeedRecord();
  if (existing && !opts.force) {
    const startId = existing.rooms[WORLD.playerStartKey];
    if (startId && (await roomExists(startId))) {
      // Repair shops + map overlays without rebuilding rooms.
      let rec = existing;
      const faction = WORLD.map?.faction?.toLowerCase() ??
        "havenbrook";
      const fixedVendors = await ensureSeededVendors(
        existing.rooms,
        existing.vendors ?? [],
        WORLD.id,
        faction,
        WORLD.vendors ?? [],
      );
      rec = { ...rec, vendors: fixedVendors };

      if (!existing.map?.tiles?.length && WORLD.map) {
        const mapR = await seedTownMapOverlays(
          WORLD,
          existing.rooms,
        );
        rec = {
          ...rec,
          map: {
            realm: WORLD.map.realm ?? "default",
            origin: {
              x: WORLD.map.origin.x,
              y: WORLD.map.origin.y,
              z: WORLD.map.origin.z ?? 0,
            },
            tiles: mapR.tiles,
            skipped: mapR.skipped,
          },
        };
        await seedDb.update({ id: SEED_ID }, rec);
        return {
          ok: true,
          skipped: true,
          message:
            `Starter world already seeded ` +
            `(${WORLD.name}, start #${startId}). ` +
            `Vendors repaired: ${fixedVendors.length}. ` +
            (mapR.skipped
              ? `Map: ${mapR.skipped}.`
              : `Map: ${mapR.placed} tiles.`),
          record: rec,
        };
      }
      await seedDb.update({ id: SEED_ID }, rec);
      return {
        ok: true,
        skipped: true,
        message:
          `Starter world already seeded ` +
          `(${WORLD.name}, start #${startId}). ` +
          `Vendors repaired: ${fixedVendors.length}.`,
        record: rec,
      };
    }
  }

  const roomIds: Record<string, string> = {};

  // Reuse intact rooms from a broken prior seed when force.
  if (existing?.rooms && opts.force) {
    for (const [k, id] of Object.entries(existing.rooms)) {
      if (await roomExists(id)) roomIds[k] = id;
    }
  }

  const tid = WORLD.id;
  const faction = WORLD.map?.faction?.toLowerCase() ??
    "havenbrook";
  for (const r of WORLD.rooms) {
    if (roomIds[r.key]) continue;
    roomIds[r.key] = await createRoom(
      r.name,
      r.description,
      r.key,
      tid,
    );
  }

  for (const e of WORLD.exits) {
    const from = roomIds[e.from];
    const to = roomIds[e.to];
    if (!from || !to) continue;
    if (await exitExists(from, to)) continue;
    await createExit(from, to, e.name, tid);
  }

  // OOC lounge link both ways
  if (WORLD.linkOoc !== false) {
    const ooc = await findOocLounge();
    const start = roomIds[WORLD.playerStartKey];
    if (ooc && start && ooc !== start) {
      if (!(await exitExists(ooc, start))) {
        await createExit(ooc, start, "IC;Havenbrook;Out", tid);
      }
      if (!(await exitExists(start, ooc))) {
        await createExit(
          start,
          ooc,
          "OOC;Lounge;Out-of-Character",
          tid,
        );
      }
    }
  }

  // Vendors/NPCs only on first install (or force when none recorded).
  const needActors = !existing?.vendors?.length ||
    (opts.force && !(existing?.vendors?.length));
  let vendorIds = existing?.vendors ? [...existing.vendors] : [];
  let npcIds = existing?.npcs ? [...existing.npcs] : [];
  if (needActors || !existing) {
    vendorIds = [];
    npcIds = [];
    for (const v of WORLD.vendors ?? []) {
      const rid = roomIds[v.room];
      if (!rid) continue;
      vendorIds.push(await seedVendor(rid, v, tid, faction));
    }
    for (const n of WORLD.npcs ?? []) {
      const rid = roomIds[n.room];
      if (!rid) continue;
      npcIds.push(await seedNpc(rid, n, tid));
    }
  }

  const startId = roomIds[WORLD.playerStartKey];
  if (startId) {
    try {
      const cur = getConfig<string>("game.playerStart", "1");
      // Only retarget default / missing start
      if (!cur || cur === "1") {
        setConfig("game.playerStart", startId);
      }
    } catch {
      // config may be unavailable in unit tests
    }
  }

  const mapR = await seedTownMapOverlays(WORLD, roomIds);
  const mapBlock = WORLD.map
    ? {
      realm: WORLD.map.realm ?? "default",
      origin: {
        x: WORLD.map.origin.x,
        y: WORLD.map.origin.y,
        z: WORLD.map.origin.z ?? 0,
      },
      tiles: mapR.tiles,
      skipped: mapR.skipped,
    }
    : undefined;

  const record: SeedRecord = {
    id: SEED_ID,
    worldId: WORLD.id,
    at: Date.now(),
    rooms: roomIds,
    vendors: vendorIds,
    npcs: npcIds,
    playerStart: startId,
    map: mapBlock,
  };

  const prior = await seedDb.queryOne({ id: SEED_ID });
  if (prior) {
    await seedDb.update({ id: SEED_ID }, record);
  } else {
    await seedDb.create(record);
  }

  const mapNote = mapR.skipped
    ? ` Map: ${mapR.skipped}.`
    : mapR.placed
    ? ` Map: ${mapR.placed} tiles @ ` +
      `${mapBlock?.realm}:(${mapBlock?.origin.x},` +
      `${mapBlock?.origin.y}).`
    : "";

  return {
    ok: true,
    message:
      `Seeded ${WORLD.name}: ${Object.keys(roomIds).length} rooms, ` +
      `${vendorIds.length} vendors, ${npcIds.length} NPCs` +
      (startId ? ` (start #${startId})` : "") +
      "." + mapNote,
    record,
  };
}

/**
 * Seed any TownDef (rooms + optional map). Uses seed id =
 * town.id so multiple towns can coexist.
 */
export async function seedTown(
  town: TownDef,
  opts: { force?: boolean } = {},
): Promise<SeedResult> {
  if (town.id === WORLD.id || town.id === "havenbrook-v1") {
    return seedStarterWorld(opts);
  }

  const graphErrs = validateWorldGraph(town);
  if (graphErrs.length) {
    return {
      ok: false,
      message: `Invalid town: ${graphErrs.join("; ")}`,
    };
  }

  const sid = `town:${town.id}`;
  const existing = await seedDb.queryOne({ id: sid });
  if (existing && !opts.force) {
    return {
      ok: true,
      skipped: true,
      message: `Town ${town.name} already seeded.`,
      record: existing as SeedRecord,
    };
  }

  const tid = town.id;
  const faction = town.map?.faction?.toLowerCase() ??
    town.id.replace(/-v\d+$/, "");
  const roomIds: Record<string, string> = {};
  for (const r of town.rooms) {
    roomIds[r.key] = await createRoom(
      r.name,
      r.description,
      r.key,
      tid,
    );
  }
  for (const e of town.exits) {
    const from = roomIds[e.from];
    const to = roomIds[e.to];
    if (!from || !to) continue;
    if (!(await exitExists(from, to))) {
      await createExit(from, to, e.name, tid);
    }
  }

  const vendorIds: string[] = [];
  for (const v of town.vendors ?? []) {
    const rid = roomIds[v.room];
    if (rid) {
      vendorIds.push(await seedVendor(rid, v, tid, faction));
    }
  }
  const npcIds: string[] = [];
  for (const n of town.npcs ?? []) {
    const rid = roomIds[n.room];
    if (rid) npcIds.push(await seedNpc(rid, n, tid));
  }

  const mapR = await seedTownMapOverlays(town, roomIds);
  const startId = roomIds[town.playerStartKey];
  const record: SeedRecord = {
    id: sid,
    worldId: town.id,
    at: Date.now(),
    rooms: roomIds,
    vendors: vendorIds,
    npcs: npcIds,
    playerStart: startId,
    map: town.map
      ? {
        realm: town.map.realm ?? "default",
        origin: {
          x: town.map.origin.x,
          y: town.map.origin.y,
          z: town.map.origin.z ?? 0,
        },
        tiles: mapR.tiles,
        skipped: mapR.skipped,
      }
      : undefined,
  };
  await seedDb.update({ id: sid }, record);

  return {
    ok: true,
    message:
      `Seeded town ${town.name}: ` +
      `${Object.keys(roomIds).length} rooms` +
      (mapR.placed ? `, ${mapR.placed} map tiles` : "") +
      (mapR.skipped ? ` (${mapR.skipped})` : "") +
      ".",
    record,
  };
}
