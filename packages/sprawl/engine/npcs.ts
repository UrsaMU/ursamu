/**
 * Sprawl NPCs as room Things (flag npc + state.sprawl_npc).
 * Book p.26: DS is also Resilience; DS 0 = dead.
 * Room listings use &short-desc with live DS.
 */
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import { ANTAGONISTS, find, findByName, type Row } from "./catalog.ts";

export type NpcDot = {
  kind: string;
  rounds: number;
  dmg: number;
};

export type SprawlNpcData = {
  slug: string;
  name: string;
  ds: number;
  dsMax: number;
  loadout?: string;
  /** Flavor line from template (no DS). */
  shortDesc?: string;
  dead?: boolean;
  /** Stacked identical corpses in one object. */
  stack?: number;
  at: number;
  /** Fire/acid clocks (specialty ammo). */
  dots?: NpcDot[];
  /** Auto-gig principal markers. */
  gigBoss?: boolean;
  gigMinion?: boolean;
  gigId?: string;
  ownerId?: string;
};

type Attr = { name: string; value: string; setter?: string };

export function isSprawlNpc(obj: IDBObj | null | undefined): boolean {
  if (!obj) return false;
  if (obj.flags?.has?.("npc")) return true;
  return !!npcData(obj);
}

export function npcData(obj: IDBObj): SprawlNpcData | null {
  const st = obj.state as Record<string, unknown> | undefined;
  const raw = st?.sprawl_npc as SprawlNpcData | undefined;
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.ds !== "number") return null;
  return raw;
}

export function catalogNpc(q: string): Row | undefined {
  const n = q.toLowerCase().trim();
  if (!n) return undefined;
  return find("antagonist", n) ??
    findByName(ANTAGONISTS, n) ??
    ANTAGONISTS.find((a) =>
      a.slug.includes(n) ||
      String(a.name).toLowerCase().includes(n)
    );
}

/** NPCs in a room (contents already hydrated preferred). */
export function npcsInRoom(contents: IDBObj[]): IDBObj[] {
  return contents.filter((o) => isSprawlNpc(o) && !npcData(o)?.dead);
}

/** Load living NPCs in a room via DB (contents may be stale). */
export async function loadRoomNpcs(
  u: IUrsamuSDK,
  roomId?: string,
): Promise<IDBObj[]> {
  const id = roomId ?? u.here?.id ?? u.me.location;
  if (!id) {
    return npcsInRoom((u.here?.contents ?? []) as IDBObj[]);
  }
  const found = await u.db.search({ location: id });
  return npcsInRoom(found as IDBObj[]);
}

/** True when NPC can still be fought. */
export function isLiveNpc(obj: IDBObj): boolean {
  const d = npcData(obj);
  return !!d && !d.dead && d.ds > 0;
}

/**
 * Prefer the first living match; only return a corpse
 * if no live candidate exists.
 */
function preferLive(candidates: IDBObj[]): IDBObj | null {
  if (!candidates.length) return null;
  const live = candidates.filter((o) => isLiveNpc(o));
  if (live.length) return live[0] ?? null;
  return candidates[0] ?? null;
}

/** Resolve by #id, slug, or name substring among room NPCs. */
export function resolveNpcInRoom(
  contents: IDBObj[],
  ref: string,
): IDBObj | null {
  const raw = ref.trim();
  if (!raw) return null;
  const all = contents.filter((o) => isSprawlNpc(o));
  if (/^#?\d+$/.test(raw)) {
    const id = raw.replace(/^#/, "");
    // Explicit #id still honors corpses (loot / look)
    return all.find((o) => o.id === id) ?? null;
  }
  const lc = raw.toLowerCase();

  const bySlug = all.filter((o) => npcData(o)?.slug === lc);
  const slugHit = preferLive(bySlug);
  if (slugHit) return slugHit;

  const byNameExact = all.filter((o) => {
    const d = npcData(o);
    const on = String(o.name ?? "").toLowerCase();
    const dn = String(d?.name ?? "").toLowerCase();
    const base = bodyBaseName(String(d?.name ?? o.name ?? ""))
      .toLowerCase();
    return on === lc || dn === lc || base === lc;
  });
  const nameHit = preferLive(byNameExact);
  if (nameHit) return nameHit;

  const partial = all.filter((o) => {
    const d = npcData(o);
    const nm = String(o.name ?? "").toLowerCase();
    const dn = String(d?.name ?? "").toLowerCase();
    const base = bodyBaseName(String(d?.name ?? o.name ?? ""))
      .toLowerCase();
    // Skip "dead …" prefix noise for partial "goon" hits
    const bare = nm.replace(/^dead\s+/u, "").replace(
      /\s*\(×\d+\)\s*$/u,
      "",
    );
    return nm.includes(lc) ||
      dn.includes(lc) ||
      base.includes(lc) ||
      bare.includes(lc) ||
      (d?.slug ?? "").includes(lc);
  });
  return preferLive(partial);
}

/** Strip " 1" / " #2" suffixes for stack matching. */
export function bodyBaseName(name: string): string {
  return String(name ?? "")
    .replace(/\s+#?\d+\s*$/u, "")
    .trim() || "body";
}

/** Same slug (+ base name) stacks as one corpse pile. */
export function bodyStackKey(data: SprawlNpcData): string {
  const slug = (data.slug || "body").toLowerCase();
  const base = bodyBaseName(data.name).toLowerCase();
  return `${slug}::${base}`;
}

/** Live short-desc for room Contents (includes current DS). */
export function formatNpcShortDesc(data: SprawlNpcData): string {
  const flavor = (data.shortDesc || data.loadout || data.name)
    .trim();
  const n = Math.max(1, data.stack ?? 1);
  if (data.dead || data.ds <= 0) {
    const who = bodyBaseName(data.name);
    if (n > 1) {
      return `DS0 DOWN · ${n}× dead ${who}`;
    }
    return `DS0/${data.dsMax} DOWN · ${flavor}`;
  }
  return `DS${data.ds}/${data.dsMax} · ${flavor}`;
}

/** Full look description (not short-desc). */
export function formatNpcDescription(data: SprawlNpcData): string {
  const n = Math.max(1, data.stack ?? 1);
  if (data.dead || data.ds <= 0) {
    const who = bodyBaseName(data.name);
    if (n > 1) {
      return (
        `A pile of ${n} dead ${who}. ` +
        `(DS0 — down)`
      );
    }
    return `The remains of ${who}. (DS0 — down)`;
  }
  return (
    `${data.name} (DS${data.ds}/${data.dsMax}` +
    (data.loadout ? ` · ${data.loadout}` : "") +
    `).`
  );
}

function withShortDescAttrs(
  state: Record<string, unknown>,
  shortDesc: string,
): Record<string, unknown> {
  const attrs = Array.isArray(state.attributes)
    ? [...(state.attributes as Attr[])]
    : [];
  const idx = attrs.findIndex((a) =>
    String(a?.name ?? "").toLowerCase() === "short-desc" ||
    String(a?.name ?? "").toLowerCase() === "shortdesc"
  );
  const entry: Attr = { name: "short-desc", value: shortDesc };
  if (idx >= 0) attrs[idx] = { ...attrs[idx], ...entry };
  else attrs.push(entry);
  return {
    ...state,
    attributes: attrs,
    "short-desc": shortDesc,
  };
}

export async function writeNpcData(
  u: IUrsamuSDK,
  obj: IDBObj,
  data: SprawlNpcData,
): Promise<void> {
  const sd = formatNpcShortDesc(data);
  const desc = formatNpcDescription(data);
  const n = Math.max(1, data.stack ?? 1);
  const base = bodyBaseName(data.name);
  const name = data.dead || data.ds <= 0
    ? (n > 1 ? `dead ${base} (×${n})` : `dead ${base}`)
    : data.name;
  const nextState = withShortDescAttrs(
    {
      ...(obj.state as Record<string, unknown>),
      sprawl_npc: data,
      name,
      description: desc,
    },
    sd,
  );
  await u.db.modify(obj.id, "$set", {
    "data.sprawl_npc": data,
    "data.name": name,
    "data.description": desc,
    "data.short-desc": sd,
    "data.attributes": nextState.attributes,
    name,
  });
  obj.name = name;
  obj.state = nextState;
  obj.name = name;
}

export type SpawnNpcOpts = {
  slug?: string;
  name?: string;
  ds?: number;
  loadout?: string;
  roomId?: string;
};

function rowShortDesc(row: Row | undefined): string | undefined {
  if (!row) return undefined;
  const r = row as Record<string, unknown>;
  const sd = r["short-desc"] ?? r.shortDesc ?? r.shortdesc;
  return typeof sd === "string" && sd.trim() ? sd.trim() : undefined;
}

/** Create an NPC Thing in a room. */
export async function spawnNpc(
  u: IUrsamuSDK,
  opts: SpawnNpcOpts,
): Promise<IDBObj | null> {
  const roomId = opts.roomId ?? u.here?.id ?? u.me.location;
  if (!roomId) return null;

  let slug = (opts.slug ?? "").toLowerCase().trim();
  let name = opts.name?.trim() ?? "";
  let ds = opts.ds;
  let loadout = opts.loadout;
  let shortDesc: string | undefined;
  let row: Row | undefined;

  if (slug || name) {
    row = catalogNpc(slug || name);
    if (row) {
      slug = String(row.slug);
      name = name || String(row.name ?? slug);
      if (ds == null && typeof row.ds === "number") {
        ds = row.ds as number;
      }
      if (!loadout && row.loadout) {
        loadout = String(row.loadout);
      }
      shortDesc = rowShortDesc(row);
    }
  }

  if (ds == null || !Number.isFinite(ds) || ds < 1) {
    ds = 10;
  }
  ds = Math.floor(ds);
  if (!name) name = slug ? slug.replace(/-/g, " ") : `DS${ds} foe`;
  if (!slug) slug = `ds-${ds}`;
  if (!shortDesc) {
    shortDesc = loadout || `${name} on the street.`;
  }

  const data: SprawlNpcData = {
    slug,
    name,
    ds,
    dsMax: ds,
    loadout,
    shortDesc,
    dead: false,
    at: Date.now(),
  };

  const sd = formatNpcShortDesc(data);
  const desc = formatNpcDescription(data);
  const obj = await u.db.create({
    name,
    flags: new Set(["thing", "npc"]),
    location: roomId,
    state: {
      sprawl_npc: data,
      description: desc,
      "short-desc": sd,
      attributes: [{ name: "short-desc", value: sd }],
    },
    contents: [],
  });
  return obj ?? null;
}

export type NpcObjHit = {
  before: number;
  after: number;
  dropped: number;
  dead: boolean;
  data: SprawlNpcData;
};

/**
 * Merge this fresh corpse into an existing same-type pile
 * in the room, or keep it as a new pile of 1.
 */
export async function stackDeadBody(
  u: IUrsamuSDK,
  corpse: IDBObj,
  data: SprawlNpcData,
): Promise<{
  data: SprawlNpcData;
  stackedInto?: string;
  destroyedId?: string;
}> {
  const roomId = corpse.location;
  if (!roomId) {
    const solo = {
      ...data,
      dead: true,
      ds: 0,
      stack: Math.max(1, data.stack ?? 1),
      name: bodyBaseName(data.name),
    };
    await writeNpcData(u, corpse, solo);
    return { data: solo };
  }
  const found = await u.db.search({ location: roomId });
  const key = bodyStackKey({
    ...data,
    name: bodyBaseName(data.name),
  });
  const pile = (found as IDBObj[]).find((o) => {
    if (o.id === corpse.id) return false;
    const od = npcData(o);
    if (!od || !(od.dead || od.ds <= 0)) return false;
    return bodyStackKey({
      ...od,
      name: bodyBaseName(od.name),
    }) === key;
  });

  if (!pile) {
    const solo = {
      ...data,
      dead: true,
      ds: 0,
      stack: Math.max(1, data.stack ?? 1),
      name: bodyBaseName(data.name),
    };
    delete solo.dots;
    await writeNpcData(u, corpse, solo);
    return { data: solo };
  }

  const pd = npcData(pile)!;
  const add = Math.max(1, data.stack ?? 1);
  const stack = Math.max(1, pd.stack ?? 1) + add;
  const merged: SprawlNpcData = {
    ...pd,
    dead: true,
    ds: 0,
    stack,
    name: bodyBaseName(pd.name || data.name),
    at: Date.now(),
  };
  delete merged.dots;
  await writeNpcData(u, pile, merged);
  try {
    // Pull corpse out of room contents, then destroy
    const room = (await u.db.search({ id: roomId }))[0] as
      | IDBObj
      | undefined;
    if (room?.contents && Array.isArray(room.contents)) {
      const nextC = room.contents.filter((c) => {
        // deno-lint-ignore no-explicit-any
        const raw = c as any;
        const id = typeof raw === "string"
          ? String(raw).replace(/^#/, "")
          : String(raw?.id ?? "");
        return id !== corpse.id;
      });
      await u.db.modify(roomId, "$set", { contents: nextC });
    }
    await u.db.destroy(corpse.id);
  } catch {
    /* best-effort destroy */
  }
  return {
    data: merged,
    stackedInto: pile.id,
    destroyedId: corpse.id,
  };
}

/** Apply margin damage to a room NPC object. */
export async function hitNpcObject(
  u: IUrsamuSDK,
  obj: IDBObj,
  damage: number,
): Promise<NpcObjHit | null> {
  const d = npcData(obj);
  if (!d || d.dead) return null;
  const dmg = Math.max(0, Math.floor(damage));
  const before = d.ds;
  const after = Math.max(0, before - dmg);
  const dropped = before - after;
  let next: SprawlNpcData = {
    ...d,
    ds: after,
    dead: after <= 0,
    at: Date.now(),
  };
  if (next.dead) {
    delete next.dots;
    const stacked = await stackDeadBody(u, obj, next);
    next = stacked.data;
  } else {
    await writeNpcData(u, obj, next);
  }
  return {
    before,
    after,
    dropped,
    dead: after <= 0,
    data: next,
  };
}

export type NpcDotTick = {
  hit: NpcObjHit | null;
  lines: string[];
  data: SprawlNpcData | null;
};

/** Tick fire/acid clocks on an NPC (DS damage). */
export async function tickNpcDots(
  u: IUrsamuSDK,
  obj: IDBObj,
): Promise<NpcDotTick> {
  const d = npcData(obj);
  if (!d || d.dead || !d.dots?.length) {
    return { hit: null, lines: [], data: d };
  }
  const lines: string[] = [];
  let ds = d.ds;
  const kept: NpcDot[] = [];
  let total = 0;
  for (const dot of d.dots) {
    const burn = Math.max(1, Math.floor(dot.dmg));
    ds = Math.max(0, ds - burn);
    total += burn;
    const left = dot.rounds - 1;
    lines.push(
      `${dot.kind} −${burn} DS` +
        (left > 0 ? ` (${left} left)` : " (ends)"),
    );
    if (left > 0) {
      kept.push({ ...dot, rounds: left });
    }
  }
  const before = d.ds;
  const after = ds;
  let next: SprawlNpcData = {
    ...d,
    ds: after,
    dead: after <= 0,
    dots: kept.length ? kept : undefined,
    at: Date.now(),
  };
  if (!kept.length) delete next.dots;
  if (next.dead) {
    delete next.dots;
    const stacked = await stackDeadBody(u, obj, next);
    next = stacked.data;
  } else {
    await writeNpcData(u, obj, next);
  }
  return {
    hit: {
      before,
      after,
      dropped: before - after,
      dead: after <= 0,
      data: next,
    },
    lines,
    data: next,
  };
}

/**
 * On hit with fire/acid ammo: stack DoT + immediate burn tick.
 */
export async function igniteNpcDot(
  u: IUrsamuSDK,
  obj: IDBObj,
  opts: {
    kind: string;
    rounds: number;
    dmg?: number;
  },
): Promise<NpcDotTick> {
  const d = npcData(obj);
  if (!d || d.dead) {
    return { hit: null, lines: [], data: d };
  }
  const kind = (opts.kind || "fire").toLowerCase();
  const rounds = Math.max(1, Math.floor(opts.rounds));
  const dmg = Math.max(1, Math.floor(opts.dmg ?? 1));
  const dots = [...(d.dots ?? [])];
  const i = dots.findIndex((x) => x.kind === kind);
  if (i >= 0) {
    dots[i] = {
      kind,
      rounds: Math.max(dots[i].rounds, rounds),
      dmg: Math.max(dots[i].dmg, dmg),
    };
  } else {
    dots.push({ kind, rounds, dmg });
  }
  await writeNpcData(u, obj, { ...d, dots });
  // Immediate first tick
  return tickNpcDots(u, obj);
}

/** Short look block for an NPC Thing. */
export function formatNpcLook(obj: IDBObj): string {
  const d = npcData(obj);
  if (!d) return "";
  if (d.dead || d.ds <= 0) {
    return formatNpcDescription(d);
  }
  const bits = [
    `${d.name}.`,
    `DS ${d.ds}/${d.dsMax}`,
  ];
  if (d.shortDesc) bits.push(d.shortDesc);
  else if (d.loadout) bits.push(d.loadout);
  bits.push(`(+attack ${d.slug})`);
  return bits.join(" ");
}
