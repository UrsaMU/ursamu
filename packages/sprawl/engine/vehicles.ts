/**
 * Owned vehicles (kind=vehicle Things) + Metal Express mods.
 * Garage lives on the player; activeVehicleId is boarded hull.
 */
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import type {
  ISprawlChar,
  SprawlItemData,
  SprawlModInstall,
  SprawlOccupant,
} from "../db/schemas.ts";
import {
  createItem,
  displayName,
  itemData,
  itemModLines,
  shortPartName,
  writeItemData,
  type ItemSource,
} from "./items.ts";
import { getChar, saveChar } from "./sheet-io.ts";
import { applyResilience } from "./action.ts";

export function isVehicle(d: SprawlItemData | null): boolean {
  return !!d && String(d.kind) === "vehicle";
}

export function isVehicleMod(d: SprawlItemData | null): boolean {
  return !!d && String(d.kind) === "vehicle-mod";
}

/** Personal loadout ignores hulls and loose vehicle parts. */
export function isPersonalGear(d: SprawlItemData | null): boolean {
  if (!d) return false;
  const k = String(d.kind);
  return k !== "vehicle" && k !== "vehicle-mod";
}

export async function ownedVehicles(
  u: IUrsamuSDK,
  ownerId: string,
): Promise<IDBObj[]> {
  const contents = await u.db.search({ location: ownerId });
  return (contents as IDBObj[]).filter((o) =>
    isVehicle(itemData(o))
  );
}

export async function resolveVehicleRef(
  u: IUrsamuSDK,
  ownerId: string,
  ref: string,
): Promise<IDBObj | null> {
  const raw = ref.trim();
  if (!raw) return null;
  const list = await ownedVehicles(u, ownerId);
  if (!list.length) return null;
  if (/^#?\d+$/.test(raw)) {
    const n = Number(raw.replace(/^#/, ""));
    if (n >= 1 && n <= list.length) return list[n - 1];
  }
  const lc = raw.toLowerCase();
  const byId = list.find((o) => o.id === raw);
  if (byId) return byId;
  const exact = list.find((o) => itemData(o)?.slug === lc);
  if (exact) return exact;
  const nameHit = list.filter((o) => {
    const nm = displayName(o).toLowerCase();
    const sl = itemData(o)?.slug ?? "";
    return nm === lc || nm.includes(lc) || sl.includes(lc);
  });
  return nameHit.length === 1 ? nameHit[0] : null;
}

export async function getActiveVehicle(
  u: IUrsamuSDK,
  owner: IDBObj,
  c: ISprawlChar,
): Promise<IDBObj | null> {
  const id = c.activeVehicleId;
  if (!id) return null;
  const list = await ownedVehicles(u, owner.id);
  return list.find((o) => o.id === id) ?? null;
}

export function vehicleLabel(obj: IDBObj): string {
  const d = itemData(obj);
  const base = displayName(obj);
  if (!d) return base;
  const bits: string[] = [];
  const ds = effectiveVehicleDs(d);
  if (ds != null) {
    const max = d.dsMax ?? d.ds;
    bits.push(
      max != null && max !== ds
        ? `DS${ds}/${max}`
        : `DS${ds}`,
    );
  }
  if (d.chassis) bits.push(d.chassis);
  const n = d.mods?.length ?? 0;
  if (n) bits.push(`${n} mod${n === 1 ? "" : "s"}`);
  const crew = d.occupants?.length ?? 0;
  if (crew) bits.push(`${crew} aboard`);
  return bits.length
    ? `${base} (${bits.join(" · ")})`
    : base;
}

export function listOccupants(d: SprawlItemData | null): string[] {
  if (!d?.occupants?.length) return [];
  return d.occupants.map((o) => {
    const role = o.role ? ` [${o.role}]` : "";
    const who = o.pc ? "PC" : `DS${o.ds}`;
    return `${o.name}${role} (${who})`;
  });
}

function occupantKey(o: SprawlOccupant): string {
  if (o.id) return `id:${o.id}`;
  if (o.slug) return `slug:${o.slug}`;
  return `name:${o.name.toLowerCase()}`;
}

/** Seat a PC or NPC on the hull (replaces same id/slug). */
export function seatOccupant(
  d: SprawlItemData,
  occ: SprawlOccupant,
): SprawlItemData {
  const crew = [...(d.occupants ?? [])];
  const key = occupantKey(occ);
  const next = crew.filter((o) => occupantKey(o) !== key);
  next.push({
    name: occ.name,
    ds: Math.max(0, Number(occ.ds) || 0),
    ...(occ.id ? { id: occ.id } : {}),
    ...(occ.role ? { role: occ.role } : {}),
    ...(occ.slug ? { slug: occ.slug } : {}),
    ...(occ.pc ? { pc: true } : {}),
  });
  return { ...d, occupants: next };
}

export function unseatOccupant(
  d: SprawlItemData,
  ref: string,
): { data: SprawlItemData; removed: SprawlOccupant | null } {
  const crew = [...(d.occupants ?? [])];
  if (!crew.length) {
    return { data: d, removed: null };
  }
  const lc = ref.toLowerCase().trim();
  let idx = crew.findIndex((o) => o.id === ref);
  if (idx < 0) {
    idx = crew.findIndex((o) =>
      (o.slug ?? "").toLowerCase() === lc ||
      o.name.toLowerCase() === lc ||
      o.name.toLowerCase().includes(lc)
    );
  }
  if (idx < 0 && /^#?\d+$/.test(lc)) {
    const n = Number(lc.replace(/^#/, ""));
    if (n >= 1 && n <= crew.length) idx = n - 1;
  }
  if (idx < 0) return { data: d, removed: null };
  const [removed] = crew.splice(idx, 1);
  const data: SprawlItemData = { ...d };
  if (crew.length) data.occupants = crew;
  else delete data.occupants;
  return { data, removed };
}

export function unseatByPlayerId(
  d: SprawlItemData,
  playerId: string,
): SprawlItemData {
  const crew = (d.occupants ?? []).filter((o) => o.id !== playerId);
  const data: SprawlItemData = { ...d };
  if (crew.length) data.occupants = crew;
  else delete data.occupants;
  return data;
}

export type OccupantFireLine = {
  name: string;
  ds: number;
  total: number;
  hit: boolean;
  margin: number;
  afterDs?: number;
  pcId?: string;
  down: boolean;
};

/**
 * Book p.32: same attack total vs each occupant DS.
 * Returns updated hull data (NPC ds reduced) + report lines.
 * PC resilience is applied by the caller via pcHits.
 */
export function resolveOccupantFire(
  d: SprawlItemData,
  attackTotal: number,
): {
  data: SprawlItemData;
  lines: OccupantFireLine[];
  pcHits: Array<{ id: string; margin: number; name: string }>;
} {
  const crew = [...(d.occupants ?? [])];
  const lines: OccupantFireLine[] = [];
  const pcHits: Array<{ id: string; margin: number; name: string }> =
    [];
  if (!crew.length) {
    return { data: d, lines, pcHits };
  }
  const nextCrew: SprawlOccupant[] = [];
  for (const o of crew) {
    const ods = Math.max(0, Number(o.ds) || 0);
    const hit = attackTotal >= ods && ods > 0;
    const margin = hit ? attackTotal - ods : 0;
    if (o.pc && o.id) {
      lines.push({
        name: o.name,
        ds: ods,
        total: attackTotal,
        hit,
        margin,
        pcId: o.id,
        down: false,
      });
      if (hit && margin > 0) {
        pcHits.push({ id: o.id, margin, name: o.name });
      }
      nextCrew.push(o);
      continue;
    }
    // NPC: reduce their DS pool
    let after = ods;
    let down = false;
    if (hit && margin > 0) {
      after = Math.max(0, ods - margin);
      down = after <= 0;
    }
    lines.push({
      name: o.name,
      ds: ods,
      total: attackTotal,
      hit,
      margin,
      afterDs: after,
      down,
    });
    if (!down) {
      nextCrew.push({ ...o, ds: after });
    }
    // down NPCs are removed from the seat (out of fight)
  }
  const data: SprawlItemData = { ...d };
  if (nextCrew.length) data.occupants = nextCrew;
  else delete data.occupants;
  return { data, lines, pcHits };
}

/** Hull DS after Tough / Fragile installs. */
export function effectiveVehicleDs(
  d: SprawlItemData,
): number | null {
  if (d.ds == null && !d.mods?.length) return null;
  let ds = Number(d.ds ?? 10);
  let tough = 0;
  let fragile = 0;
  for (const m of d.mods ?? []) {
    const tags = (m.tags ?? []).map((t) => t.toLowerCase());
    if (!tags.includes("ds")) continue;
    const b = Number(m.bonus ?? 0);
    if (b > 0) tough += b;
    if (b < 0) fragile += b;
  }
  tough = Math.min(3, tough);
  fragile = Math.max(-3, fragile);
  // 0 = wrecked hull; floor at 0 not 1.
  return Math.max(0, ds + tough + fragile);
}

export type VehicleActionBonus = {
  total: number;
  parts: string[];
  faster: boolean;
  upgrade: number;
  /** Hull has Armoured for Combat — needs heavy weapons. */
  armoured: boolean;
};

/**
 * Bonuses from boarded vehicle mods.
 * actionTags: drive | chase | ram | showoff | combat | mecha
 */
export function vehicleActionBonus(
  d: SprawlItemData | null,
  actionTags: string[] = ["drive"],
): VehicleActionBonus {
  const parts: string[] = [];
  let total = 0;
  let faster = false;
  let upgrade = 0;
  let armoured = false;
  if (!d) {
    return { total, parts, faster, upgrade, armoured };
  }
  const want = new Set(actionTags.map((t) => t.toLowerCase()));
  for (const m of d.mods ?? []) {
    const tags = (m.tags ?? []).map((t) => t.toLowerCase());
    if (tags.includes("armour") || tags.includes("armor")) {
      armoured = true;
    }
    if (tags.includes("fast") || tags.includes("turbo")) {
      faster = true;
    }
    if (
      tags.includes("upgrade-drive") ||
      tags.includes("upgrade-shot")
    ) {
      upgrade += 1;
    }
    const b = Number(m.bonus ?? 0);
    if (!b) continue;
    if (tags.includes("ds")) continue; // hull only
    const hit = tags.some((t) => want.has(t));
    if (!hit && tags.length) continue;
    if (!tags.length && !hit) continue;
    total += b;
    const sign = b > 0 ? "+" : "";
    parts.push(
      `${shortPartName(m.name || m.slug, m.slug)}${sign}${b}`,
    );
  }
  return { total, parts, faster, upgrade, armoured };
}

/** True if hull has Armoured for Combat ability. */
export function vehicleIsArmoured(
  d: SprawlItemData | null,
): boolean {
  if (!d?.mods?.length) return false;
  return d.mods.some((m) =>
    (m.tags ?? []).some((t) => {
      const x = t.toLowerCase();
      return x === "armour" || x === "armor";
    })
  );
}

/**
 * Apply fire margin to hull DS (book: limo DS12 − margin).
 * Writes current ds down; Tough/Fragile still apply on top.
 */
export function applyHullDamage(
  d: SprawlItemData,
  margin: number,
): {
  data: SprawlItemData;
  before: number;
  after: number;
  destroyed: boolean;
} {
  const before = effectiveVehicleDs(d) ?? Number(d.ds ?? 10);
  const dmg = Math.max(0, Math.floor(margin));
  const base = Number(d.ds ?? before);
  const nextBase = Math.max(0, base - dmg);
  const data: SprawlItemData = { ...d, ds: nextBase };
  const after = effectiveVehicleDs(data) ?? nextBase;
  return {
    data,
    before,
    after,
    destroyed: after <= 0,
  };
}

/** Catalog / chassis / showroom row → fight DS (no Thing). */
export function catalogVehicleDs(
  // deno-lint-ignore no-explicit-any
  row: Record<string, any> | undefined | null,
): number | null {
  if (!row || row.ds == null) return null;
  const n = Number(row.ds);
  return Number.isFinite(n) ? n : null;
}

export function vehicleSourceFromRow(
  row: Record<string, unknown>,
  chassis?: string,
): ItemSource {
  const ds = Number(row.ds ?? 10);
  return {
    slug: String(row.slug),
    name: String(row.name ?? row.slug),
    kind: "vehicle",
    load: 0,
    notes: row.blurb != null
      ? String(row.blurb).slice(0, 120)
      : row.tags != null
      ? String(row.tags)
      : undefined,
    ds,
    dsMax: ds,
    chassis: chassis ??
      (row.chassis != null ? String(row.chassis) : String(row.slug)),
  };
}

export function vehicleModSourceFromRow(
  row: Record<string, unknown>,
): ItemSource {
  return {
    slug: String(row.slug),
    name: String(row.name ?? row.slug),
    kind: "vehicle-mod",
    load: 0,
    bonus: row.bonus != null ? Number(row.bonus) : 0,
    notes: row.effect != null ? String(row.effect) : undefined,
    tags: row.tags,
    hostKinds: row.host ?? ["vehicle"],
    uses: row.uses,
    unit: row.unit,
  };
}

export async function mintVehicle(
  u: IUrsamuSDK,
  ownerId: string,
  row: Record<string, unknown>,
  opts: { chassis?: string; name?: string } = {},
): Promise<IDBObj | null> {
  const src = vehicleSourceFromRow(row, opts.chassis);
  return await createItem(u, ownerId, src, {
    name: opts.name ?? src.name,
  });
}

export async function boardVehicle(
  u: IUrsamuSDK,
  c: ISprawlChar,
  vehicle: IDBObj,
  actor: IDBObj,
  role = "driver",
): Promise<ISprawlChar> {
  // Leave any previous hull seat first.
  if (c.activeVehicleId && c.activeVehicleId !== vehicle.id) {
    const prev = await resolveVehicleRef(
      u,
      actor.id,
      c.activeVehicleId,
    );
    if (prev) {
      const pd = itemData(prev);
      if (pd) {
        await writeItemData(
          u,
          prev,
          unseatByPlayerId(pd, actor.id),
        );
      }
    }
  }
  const d = itemData(vehicle);
  if (d) {
    const seated = seatOccupant(d, {
      name: String(actor.name ?? c.name ?? "Pilot"),
      ds: c.resilience,
      id: actor.id,
      role,
      pc: true,
    });
    await writeItemData(u, vehicle, seated);
  }
  const next = { ...c, activeVehicleId: vehicle.id };
  await saveChar(u, next, actor.id);
  return next;
}

export async function disembarkVehicle(
  u: IUrsamuSDK,
  c: ISprawlChar,
  actor: IDBObj,
): Promise<ISprawlChar> {
  if (!c.activeVehicleId) return c;
  const v = await resolveVehicleRef(
    u,
    actor.id,
    c.activeVehicleId,
  );
  if (v) {
    const d = itemData(v);
    if (d) {
      await writeItemData(
        u,
        v,
        unseatByPlayerId(d, actor.id),
      );
    }
  }
  const next = { ...c };
  delete next.activeVehicleId;
  await saveChar(u, next, actor.id);
  return next;
}

/**
 * Apply PC occupant hits (margin → Resilience).
 * Returns report strings.
 */
export async function applyPcOccupantHits(
  u: IUrsamuSDK,
  pcHits: Array<{ id: string; margin: number; name: string }>,
): Promise<string[]> {
  const out: string[] = [];
  for (const h of pcHits) {
    const found = await u.db.search({}) as IDBObj[];
    const obj = found.find((o) => o.id === h.id) ?? null;
    if (!obj) {
      out.push(`${h.name}: (PC not found)`);
      continue;
    }
    await hurtPc(u, obj, h.margin, out);
  }
  return out;
}

async function hurtPc(
  u: IUrsamuSDK,
  obj: IDBObj,
  margin: number,
  out: string[],
): Promise<void> {
  const ch = getChar(obj);
  if (!ch) {
    out.push(`${obj.name}: no sheet`);
    return;
  }
  const next = applyResilience(ch, -margin);
  await saveChar(u, next, obj.id);
  out.push(
    `${obj.name ?? "PC"} Res ` +
      `${ch.resilience}→${next.resilience}` +
      (next.resilience <= 0 ? " DOWN" : ""),
  );
}

export function garageLines(
  vehicles: IDBObj[],
  activeId?: string,
): string[] {
  const lines: string[] = [];
  let n = 0;
  for (const o of vehicles) {
    n++;
    const active = o.id === activeId ? " ★" : "";
    lines.push(`  #${n} ${vehicleLabel(o)}${active}`);
    for (const m of itemModLines(o)) lines.push(m);
    const d = itemData(o);
    for (const seat of listOccupants(d)) {
      lines.push(`         · ${seat}`);
    }
  }
  if (!vehicles.length) lines.push("  (empty garage)");
  return lines;
}

/** Apply Tough/Fragile already in effectiveVehicleDs; expose for tests. */
export function sumDsMods(mods: SprawlModInstall[] = []): number {
  let n = 0;
  let tough = 0;
  let frag = 0;
  for (const m of mods) {
    const tags = (m.tags ?? []).map((t) => t.toLowerCase());
    if (!tags.includes("ds")) continue;
    const b = Number(m.bonus ?? 0);
    if (b > 0) tough += b;
    else frag += b;
  }
  n += Math.min(3, tough) + Math.max(-3, frag);
  return n;
}
