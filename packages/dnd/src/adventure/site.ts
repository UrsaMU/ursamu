/**
 * Materialize / reset adventure site instances in the world DB.
 */
import { createObj, dbojs, DBO } from "@ursamu/ursamu";
import { defaultSheet, migrateSheet } from "../stats/dnd_sheet.ts";
import { NPC_TEMPLATES } from "../combat/npc-templates.ts";
import { attacksFromTemplate } from "../combat/npc-attacks.ts";
import { noGetData } from "../world/interact.ts";
import { getSeedRecord } from "../world/seed.ts";
import {
  adventureBySlug,
  listAdventures,
} from "./catalog.ts";
import { skinBySlug, listSkins } from "./skins.ts";
import {
  generateFromSkin,
  makeRunSlug,
} from "./generate.ts";
import type {
  AdventureDef,
  AdventureInstance,
  AdvMobDef,
  AdvPropDef,
} from "./types.ts";

const instDb = new DBO<AdventureInstance>("dnd.adventures");

function flagStr(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw instanceof Set) return [...raw].map(String).join(" ");
  if (Array.isArray(raw)) return raw.map(String).join(" ");
  return String(raw ?? "");
}

async function createRoom(
  name: string,
  description: string,
  slug: string,
  key: string,
): Promise<string> {
  const made = await createObj("room safe", {
    name,
    description,
    dndAdventure: slug,
    dndAdvRoom: key,
  });
  const id = made[0]?.id;
  if (!id) throw new Error(`room ${name}`);
  return id;
}

async function createExit(
  fromId: string,
  toId: string,
  name: string,
  slug: string,
): Promise<void> {
  const made = await createObj("exit", {
    name,
    destination: toId,
    dndAdventure: slug,
  });
  const id = made[0]?.id;
  if (!id) return;
  await dbojs.modify({ id }, "$set", { location: fromId });
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

async function spawnMob(
  roomId: string,
  def: AdvMobDef,
  slug: string,
): Promise<string> {
  const t = NPC_TEMPLATES[def.template.toLowerCase()];
  const sheet = migrateSheet(defaultSheet());
  sheet.class = "Monster";
  sheet.species = "NPC";
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
    // deno-lint-ignore no-explicit-any
    (sheet as any).drops = t.drops ?? [];
    // deno-lint-ignore no-explicit-any
    if (t.cr) (sheet as any).cr = t.cr;
  } else {
    sheet.hp = { max: 10, current: 10, temp: 0 };
  }
  // deno-lint-ignore no-explicit-any
  (sheet as any).aiKey = "aggressive";
  // deno-lint-ignore no-explicit-any
  (sheet as any).npcTemplate = def.template.toLowerCase();
  // Attacks on sheet for AI — never inventory items (no loot bites).
  // deno-lint-ignore no-explicit-any
  (sheet as any).attacks = attacksFromTemplate(t);

  const made = await createObj("thing npc", {
    name: def.name,
    description: t
      ? `A ${t.name} (CR ${t.cr ?? "?"}).`
      : "A foe.",
    dndAdventure: slug,
    dnd: sheet,
    owner: "1",
  });
  const id = made[0]?.id;
  if (!id) throw new Error(def.name);
  await dbojs.modify({ id }, "$set", { location: roomId });
  return id;
}

async function spawnChest(
  roomId: string,
  name: string,
  table: string,
  slug: string,
  description?: string,
): Promise<string> {
  const made = await createObj("thing", noGetData({
    name: `${name};chest;coffer;box`,
    description: description ??
      "A sturdy container. The %chlid%cn looks ready to %chopen%cn.",
    dndAdventure: slug,
    dnd: {
      type: "chest",
      table,
      opened: false,
      noGet: true,
    },
    // Softcode open attrs (core open verb)
    OPEN: "You lift the lid.",
    OOPEN: "opens the chest.",
    owner: "1",
  }));
  const id = made[0]?.id;
  if (!id) throw new Error(name);
  await dbojs.modify({ id }, "$set", {
    location: roomId,
    "data.locks": { basic: "flag(wizard)" },
    "data.dnd.noGet": true,
  });
  return id;
}

async function spawnProp(
  roomId: string,
  prop: AdvPropDef,
  slug: string,
): Promise<string> {
  if (prop.kind === "chest") {
    return spawnChest(
      roomId,
      prop.name,
      prop.table || "scrap",
      slug,
      prop.description,
    );
  }
  const aliases = prop.kind === "altar"
    ? ";altar;shrine;idol"
    : prop.kind === "view"
    ? ";view;vista;lookout;window"
    : prop.kind === "campfire"
    ? ";campfire;fire;firepit;hearth"
    : ";scenery";
  const descBase = (prop.description || prop.name.split(";")[0])
    .trim();
  const cue = prop.kind === "altar"
    ? " You might %chtouch%cn the stone."
    : prop.kind === "campfire"
    ? " The coals invite you to %chuse%cn them and rest."
    : prop.kind === "view"
    ? " A quiet place to %chlook%cn longer."
    : "";
  const made = await createObj("thing", noGetData({
    name: `${prop.name}${aliases}`,
    description: `${descBase}${cue}`,
    dndAdventure: slug,
    dnd: {
      type: prop.kind,
      interact: prop.kind === "altar" ||
        prop.kind === "campfire",
      noGet: true,
    },
    USE: prop.kind === "campfire"
      ? "You warm your hands."
      : "You lay a hand on the stone.",
    OUSE: prop.kind === "campfire"
      ? "warms themself by the fire."
      : "touches the altar.",
    owner: "1",
  }));
  const id = made[0]?.id;
  if (!id) throw new Error(prop.name);
  await dbojs.modify({ id }, "$set", {
    location: roomId,
    "data.locks": { basic: "flag(wizard)" },
    "data.dnd.noGet": true,
  });
  return id;
}

export async function getInstance(
  slug: string,
): Promise<AdventureInstance | null> {
  const row = await instDb.queryOne({ id: slug });
  return row ?? null;
}

export async function listInstances(): Promise<
  AdventureInstance[]
> {
  return await instDb.all();
}

/**
 * Start a fresh procedural run from a skin (random rooms).
 * partySize scales fodder and boss guards (PCs + hirelings).
 */
export async function startDelve(
  skinRaw: string,
  opts: { partySize?: number } = {},
): Promise<{
  ok: boolean;
  message: string;
  instance?: AdventureInstance;
  def?: AdventureDef;
}> {
  const skin = skinBySlug(skinRaw);
  if (!skin) {
    return {
      ok: false,
      message:
        `Unknown skin "${skinRaw}". Try +adv/skins.`,
    };
  }
  const partySize = Math.max(1, opts.partySize ?? 1);
  const runSlug = makeRunSlug(skin.slug);
  const def = generateFromSkin(skin, runSlug, { partySize });
  const inst = await buildSite(def);
  await linkToWorld(def, inst);
  const n = def.rooms.length;
  const props = def.props?.length ?? 0;
  const foes = def.mobs.length;
  return {
    ok: true,
    message:
      `${def.name} delve: ${n} rooms, ${foes} foes ` +
      `(party ${partySize}), boss at end, ` +
      `${props} props (${runSlug}).`,
    instance: inst,
    def,
  };
}

/**
 * Ensure a fixed adventure.json site exists, or treat slug
 * as a skin and start a delve when unknown as fixed.
 */
export async function ensureAdventure(
  slug: string,
  opts: { reset?: boolean } = {},
): Promise<{
  ok: boolean;
  message: string;
  instance?: AdventureInstance;
  def?: AdventureDef;
}> {
  const fixed = adventureBySlug(slug);
  if (!fixed) {
    // Skin name → new procedural run
    if (skinBySlug(slug)) return startDelve(slug);
    return { ok: false, message: `Unknown adventure "${slug}".` };
  }

  let inst = await getInstance(fixed.slug);
  const needBuild = !inst ||
    !(await roomAlive(inst.entryId));

  if (needBuild || !inst) {
    inst = await buildSite(fixed);
  } else if (opts.reset || inst.cleared) {
    inst = await resetMobsAndChests(fixed, inst);
  }

  if (!inst) {
    return {
      ok: false,
      message: `Failed to materialize ${fixed.name}.`,
    };
  }

  await linkToWorld(fixed, inst);
  return {
    ok: true,
    message: `${fixed.name} ready (entry #${inst.entryId}).`,
    instance: inst,
    def: fixed,
  };
}

async function roomAlive(id: string): Promise<boolean> {
  const o = await dbojs.queryOne({ id });
  return !!(o && flagStr(o.flags).includes("room"));
}

async function buildSite(
  def: AdventureDef,
): Promise<AdventureInstance> {
  const rooms: Record<string, string> = {};
  for (const r of def.rooms) {
    rooms[r.key] = await createRoom(
      r.name,
      r.description,
      def.slug,
      r.key,
    );
  }
  for (const e of def.exits) {
    const a = rooms[e.from];
    const b = rooms[e.to];
    if (a && b) await createExit(a, b, e.name, def.slug);
  }

  const mobIds: string[] = [];
  for (const m of def.mobs) {
    const rid = rooms[m.room];
    if (rid) mobIds.push(await spawnMob(rid, m, def.slug));
  }

  const chestIds: string[] = [];
  const propIds: string[] = [];
  if (def.props?.length) {
    for (const p of def.props) {
      const rid = rooms[p.room];
      if (!rid) continue;
      const id = await spawnProp(rid, p, def.slug);
      propIds.push(id);
      if (p.kind === "chest") chestIds.push(id);
    }
  } else {
    for (const c of def.chests ?? []) {
      const rid = rooms[c.room];
      if (rid) {
        chestIds.push(
          await spawnChest(rid, c.name, c.table, def.slug),
        );
      }
    }
  }

  const entryId = rooms[def.entryKey];
  const inst: AdventureInstance = {
    id: def.slug,
    slug: def.slug,
    at: Date.now(),
    rooms,
    mobIds,
    chestIds,
    propIds,
    entryId,
    cleared: false,
    skin: def.skin,
    kind: def.kind,
  };
  await instDb.update({ id: def.slug }, inst);
  return inst;
}

async function resetMobsAndChests(
  def: AdventureDef,
  inst: AdventureInstance,
): Promise<AdventureInstance> {
  const kill = [
    ...inst.mobIds,
    ...inst.chestIds,
    ...(inst.propIds ?? []),
  ];
  for (const id of kill) {
    try {
      await dbojs.delete({ id });
    } catch { /* gone */ }
  }

  const mobIds: string[] = [];
  for (const m of def.mobs) {
    const rid = inst.rooms[m.room];
    if (rid) mobIds.push(await spawnMob(rid, m, def.slug));
  }
  const chestIds: string[] = [];
  const propIds: string[] = [];
  if (def.props?.length) {
    for (const p of def.props) {
      const rid = inst.rooms[p.room];
      if (!rid) continue;
      const id = await spawnProp(rid, p, def.slug);
      propIds.push(id);
      if (p.kind === "chest") chestIds.push(id);
    }
  } else {
    for (const c of def.chests ?? []) {
      const rid = inst.rooms[c.room];
      if (rid) {
        chestIds.push(
          await spawnChest(rid, c.name, c.table, def.slug),
        );
      }
    }
  }

  const next: AdventureInstance = {
    ...inst,
    mobIds,
    chestIds,
    propIds,
    cleared: false,
    at: Date.now(),
  };
  await instDb.update({ id: def.slug }, next);
  return next;
}

async function linkToWorld(
  def: AdventureDef,
  inst: AdventureInstance,
): Promise<void> {
  if (!def.linkFromWorld) return;
  const world = await getSeedRecord();
  const anchor = world?.rooms?.[def.linkFromWorld];
  if (!anchor || !inst.entryId) return;

  const toName = def.exitNameToSite || "In;Adventure";
  const fromName = def.exitNameFromSite || "Out";
  if (!(await exitExists(anchor, inst.entryId))) {
    await createExit(anchor, inst.entryId, toName, def.slug);
  }
  if (!(await exitExists(inst.entryId, anchor))) {
    await createExit(inst.entryId, anchor, fromName, def.slug);
  }
  inst.anchorId = anchor;
  await instDb.update({ id: def.slug }, {
    ...inst,
    anchorId: anchor,
  });
}

/** Count living adventure mobs in instance rooms. */
export async function countLivingMobs(
  inst: AdventureInstance,
): Promise<number> {
  let n = 0;
  for (const id of inst.mobIds) {
    const o = await dbojs.queryOne({ id });
    if (!o) continue;
    // deno-lint-ignore no-explicit-any
    const dnd = (o.data as any)?.dnd;
    const hp = dnd?.hp?.current;
    if (typeof hp === "number" && hp <= 0) continue;
    // Dead flag / corpse rename
    const nm = String(o.data?.name ?? o.name ?? "")
      .toLowerCase();
    if (nm.includes("corpse") || nm.includes("remains")) {
      continue;
    }
    n += 1;
  }
  return n;
}

export async function markClearedIfDone(
  slug: string,
): Promise<boolean> {
  const inst = await getInstance(slug);
  if (!inst || inst.cleared) return !!inst?.cleared;
  const left = await countLivingMobs(inst);
  if (left > 0) return false;
  const next = { ...inst, cleared: true };
  await instDb.update({ id: slug }, next);
  return true;
}

export function catalogSummary(): string[] {
  const lines: string[] = [
    "  %chSkins%cn (procedural — +adv/delve <slug>):",
  ];
  for (const s of listSkins()) {
    lines.push(
      `  ${s.slug.padEnd(16)} T${s.tier} ${s.kind}  ` +
        `${s.name} — ${s.summary}`,
    );
  }
  const fixed = listAdventures();
  if (fixed.length) {
    lines.push("  %chFixed sites%cn (+adv/enter <slug>):");
    for (const a of fixed) {
      lines.push(
        `  ${a.slug.padEnd(16)} T${a.tier}  ` +
          `${a.name} — ${a.summary}`,
      );
    }
  }
  return lines;
}

export { listAdventures, adventureBySlug, listSkins, skinBySlug };
