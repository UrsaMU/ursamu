/**
 * Attach / detach mods on host Things (weapons + vehicles).
 * Host holds mods[] — loose mod Things are consumed on attach.
 */
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import type {
  SprawlItemData,
  SprawlModInstall,
} from "../db/schemas.ts";
import { find, type Row } from "./catalog.ts";
import {
  createItem,
  destroyItem,
  displayName,
  itemData,
  resolveItemRef,
  writeItemData,
} from "./items.ts";
import { resolveVehicleRef } from "./vehicles.ts";

const WEAPON_HOSTS = new Set([
  "firearm",
  "heavy",
  "melee",
  "weapon",
]);
const VEHICLE_HOSTS = new Set(["vehicle"]);

export type ModOpOk = { ok: true; host: IDBObj; modName: string };
export type ModOpErr = { ok: false; error: string };
export type ModOpResult = ModOpOk | ModOpErr;

/** Parse `host=mod` or host-only. */
export function parseHostModArg(
  arg: string,
): { host: string; mod?: string } | null {
  const s = arg.trim();
  if (!s) return null;
  const eq = s.indexOf("=");
  if (eq < 0) return { host: s };
  const host = s.slice(0, eq).trim();
  const mod = s.slice(eq + 1).trim();
  if (!host) return null;
  return mod ? { host, mod } : { host };
}

function catalogForMod(
  slug: string,
  kind: string,
): Row | undefined {
  if (kind === "vehicle-mod") {
    return find("vehicleMod", slug);
  }
  return find("mod", slug) ?? find("vehicleMod", slug);
}

function hostKindsFor(
  d: SprawlItemData,
  cat?: Row,
): string[] {
  if (d.hostKinds?.length) {
    return d.hostKinds.map((h) => h.toLowerCase());
  }
  const raw = cat?.host;
  if (Array.isArray(raw)) {
    return raw.map((h) => String(h).toLowerCase());
  }
  if (d.kind === "vehicle-mod") return ["vehicle"];
  return ["firearm", "heavy", "melee"];
}

function chassisOk(
  host: SprawlItemData,
  cat?: Row,
): boolean {
  const need = cat?.chassis;
  if (!Array.isArray(need) || !need.length) return true;
  const ch = String(host.chassis ?? host.slug).toLowerCase();
  return need.map(String).some((c) => c.toLowerCase() === ch);
}

export function toModInstall(
  d: SprawlItemData,
  name: string,
  cat?: Row,
): SprawlModInstall {
  const tags = d.tags?.length
    ? [...d.tags]
    : Array.isArray(cat?.tags)
    ? (cat!.tags as unknown[]).map(String)
    : undefined;
  let bonus = d.bonus;
  if (bonus == null && cat?.bonus != null) {
    bonus = Number(cat.bonus);
  }
  const effect = d.notes ||
    (cat?.effect != null ? String(cat.effect) : undefined);
  const m: SprawlModInstall = {
    slug: d.slug,
    name: name || d.slug,
  };
  if (bonus != null && bonus !== 0) m.bonus = bonus;
  if (tags?.length) m.tags = tags;
  if (effect) m.effect = effect;
  return m;
}

function matchInstall(
  mods: SprawlModInstall[],
  ref: string,
): number {
  const lc = ref.toLowerCase().trim();
  if (!lc) return -1;
  let i = mods.findIndex((m) => m.slug === lc);
  if (i >= 0) return i;
  i = mods.findIndex(
    (m) => (m.name || "").toLowerCase() === lc,
  );
  if (i >= 0) return i;
  const hits = mods
    .map((m, idx) => ({ m, idx }))
    .filter(({ m }) =>
      m.slug.includes(lc) ||
      (m.name || "").toLowerCase().includes(lc)
    );
  return hits.length === 1 ? hits[0].idx : -1;
}

async function resolveHost(
  u: IUrsamuSDK,
  ownerId: string,
  hostRef: string,
  preferVehicle: boolean,
): Promise<IDBObj | null> {
  if (preferVehicle) {
    const v = await resolveVehicleRef(u, ownerId, hostRef);
    if (v) return v;
  }
  return await resolveItemRef(u, ownerId, hostRef);
}

export async function attachMod(
  u: IUrsamuSDK,
  ownerId: string,
  hostRef: string,
  modRef: string,
  opts: { vehicle?: boolean } = {},
): Promise<ModOpResult> {
  const host = await resolveHost(
    u,
    ownerId,
    hostRef,
    !!opts.vehicle,
  );
  if (!host) return { ok: false, error: "Host not found." };
  const hd = itemData(host);
  if (!hd) return { ok: false, error: "Not a Sprawl item." };
  const hk = String(hd.kind).toLowerCase();
  const isVeh = VEHICLE_HOSTS.has(hk);
  const isWep = WEAPON_HOSTS.has(hk);
  if (!isVeh && !isWep) {
    return {
      ok: false,
      error: "Host must be a weapon or vehicle.",
    };
  }

  const loose = await resolveItemRef(u, ownerId, modRef);
  if (!loose) {
    return { ok: false, error: "Mod not in loadout (loose)." };
  }
  if (loose.id === host.id) {
    return { ok: false, error: "Cannot attach item to itself." };
  }
  const md = itemData(loose);
  const mk = String(md?.kind ?? "");
  if (!md || (mk !== "mod" && mk !== "vehicle-mod")) {
    return { ok: false, error: "That item is not a loose mod." };
  }
  if (isVeh && mk !== "vehicle-mod") {
    return {
      ok: false,
      error: "Vehicles need vehicle-mods (+vehicle/mod).",
    };
  }
  if (isWep && mk !== "mod") {
    return {
      ok: false,
      error: "Weapons need weapon mods (+gear/mod).",
    };
  }

  const cat = catalogForMod(md.slug, mk);
  const allowed = hostKindsFor(md, cat);
  if (
    !allowed.includes(hk) &&
    !(isWep && allowed.includes("weapon"))
  ) {
    return {
      ok: false,
      error: `Mod does not fit ${hk} hosts.`,
    };
  }
  if (isVeh && !chassisOk(hd, cat)) {
    return {
      ok: false,
      error: "Mod requires tanksuit/walker chassis.",
    };
  }

  const installed = [...(hd.mods ?? [])];
  const install = toModInstall(md, displayName(loose), cat);
  // Tough/Fragile (ds) may stack; other slugs once each.
  const stackDs = (install.tags ?? [])
    .map((t) => t.toLowerCase())
    .includes("ds");
  if (
    !stackDs &&
    installed.some((m) => m.slug === md.slug)
  ) {
    return { ok: false, error: "That mod is already on the host." };
  }

  installed.push(install);
  await writeItemData(u, host, { ...hd, mods: installed });
  await destroyItem(u, loose.id);
  return { ok: true, host, modName: install.name };
}

export async function detachMod(
  u: IUrsamuSDK,
  ownerId: string,
  hostRef: string,
  modRef: string,
  opts: { vehicle?: boolean } = {},
): Promise<ModOpResult> {
  const host = await resolveHost(
    u,
    ownerId,
    hostRef,
    !!opts.vehicle,
  );
  if (!host) return { ok: false, error: "Host not found." };
  const hd = itemData(host);
  if (!hd) return { ok: false, error: "Not a Sprawl item." };

  const installed = [...(hd.mods ?? [])];
  if (!installed.length) {
    return { ok: false, error: "No mods on that host." };
  }
  const idx = matchInstall(installed, modRef);
  if (idx < 0) {
    return { ok: false, error: "Mod not installed on host." };
  }

  const [gone] = installed.splice(idx, 1);
  const looseKind = String(hd.kind) === "vehicle"
    ? "vehicle-mod"
    : "mod";
  const cat = catalogForMod(gone.slug, looseKind);
  const nextMods = installed.length ? installed : undefined;
  const next: SprawlItemData = { ...hd };
  if (nextMods) next.mods = nextMods;
  else delete next.mods;
  await writeItemData(u, host, next);

  const tags = gone.tags ??
    (Array.isArray(cat?.tags)
      ? (cat!.tags as unknown[]).map(String)
      : undefined);
  const hosts = Array.isArray(cat?.host)
    ? (cat!.host as unknown[]).map(String)
    : looseKind === "vehicle-mod"
    ? ["vehicle"]
    : undefined;
  const loose = await createItem(u, ownerId, {
    slug: gone.slug,
    name: gone.name,
    kind: looseKind,
    load: 0,
    bonus: gone.bonus ?? 0,
    notes: gone.effect,
    tags,
    hostKinds: hosts,
  });
  if (!loose) {
    await writeItemData(u, host, hd);
    return { ok: false, error: "Could not mint loose mod." };
  }
  return { ok: true, host, modName: gone.name };
}

export function listHostMods(host: IDBObj): string[] {
  const d = itemData(host);
  if (!d?.mods?.length) return [];
  return d.mods.map(
    (m) =>
      `${m.slug}${
        m.name && m.name !== m.slug ? ` (${m.name})` : ""
      }`,
  );
}
