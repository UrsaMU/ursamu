/**
 * Sprawl carried gear as real UrsaMU Things (state.sprawl_item).
 * Native get/drop/give/use + inventory:show / object:use hooks.
 */
import type { IDBObj, IUrsamuSDK } from "@ursamu/mush";
import type {
  ILoadItem,
  ISprawlChar,
  SprawlBonusWhen,
  SprawlItemData,
  SprawlItemKind,
  SprawlModInstall,
} from "../db/schemas.ts";
import { overloadFrom, sumLoad } from "../db/schemas.ts";
import { rollNd6 } from "./dice.ts";
import { ensureMag } from "./mags.ts";
import {
  combatBonusActive,
  parseStatMods,
  shortStat,
} from "./worn-gear.ts";
import {
  ARMOR,
  FIREARMS,
  HEAVY,
  MARKET,
  MELEE,
  type Row,
} from "./catalog.ts";

export type ItemSource = {
  slug: string;
  name?: string;
  kind?: string;
  load?: number | unknown;
  bonus?: number | unknown;
  notes?: string | unknown;
  uses?: number | unknown;
  usesDice?: string | unknown;
  unit?: string | unknown;
  useEffect?: string | unknown;
  blurb?: string | unknown;
  /** kind=mod: when bonus applies (aim/shot/burst/…). */
  tags?: string[] | unknown;
  /** kind=mod: host kinds that accept this. */
  hostKinds?: string[] | unknown;
  /** Pre-installed mods (seed / mint host with attachments). */
  mods?: SprawlModInstall[] | unknown;
  /** Worn power armor / suits — stat adds while worn. */
  statMods?: unknown;
  modStat?: unknown;
  mod?: unknown;
  loadoutMult?: number | unknown;
  loadoutBonus?: number | unknown;
  bonusWhen?: SprawlBonusWhen | string | unknown;
  /** Vehicle hull. */
  ds?: number | unknown;
  dsMax?: number | unknown;
  chassis?: string | unknown;
  category?: string | unknown;
  ammoSlug?: string | unknown;
  rangeM?: number | unknown;
  /** Override magazine (tests / showcases). */
  mag?: number | unknown;
  magMax?: number | unknown;
};

export function isSprawlItem(obj: IDBObj): boolean {
  const d = obj.state?.sprawl_item as SprawlItemData | undefined;
  return !!(d && typeof d.slug === "string" && d.slug.length > 0);
}

export function itemData(obj: IDBObj): SprawlItemData | null {
  const d = obj.state?.sprawl_item as SprawlItemData | undefined;
  if (!d?.slug) return null;
  return d;
}

const CAT_TO_KIND: Record<string, SprawlItemKind> = {
  firearm: "firearm",
  firearms: "firearm",
  gun: "firearm",
  melee: "melee",
  heavy: "heavy",
  armor: "armor",
  armour: "armor",
  weapon: "weapon",
};

/** Match market/belonging slugs to combat catalog rows. */
function matchCombatRow(
  slug: string,
  name?: string,
): { row: Row; kind: SprawlItemKind } | null {
  const s = slug.toLowerCase().trim();
  if (!s) return null;
  const tables: Array<[SprawlItemKind, readonly Row[]]> = [
    ["firearm", FIREARMS],
    ["melee", MELEE],
    ["heavy", HEAVY],
    ["armor", ARMOR],
  ];
  for (const [kind, table] of tables) {
    const exact = table.find((r) => r.slug === s);
    if (exact) return { row: exact, kind };
  }
  // Market: charon-pkd-45-… → pkd-45
  for (const [kind, table] of tables) {
    const hit = table.find((r) =>
      s.includes(r.slug) ||
      (r.slug.length >= 4 && s.includes(r.slug))
    );
    if (hit) return { row: hit, kind };
  }
  // Street market row (Machine Link etc. not on firearms table)
  const mkt = MARKET.find((r) => r.slug === s) ??
    MARKET.find((r) =>
      name &&
      String(r.name).toLowerCase() === name.toLowerCase()
    );
  if (mkt) {
    const cat = String(mkt.category ?? "").toLowerCase();
    const kind = CAT_TO_KIND[cat];
    if (kind) {
      return {
        row: {
          ...mkt,
          bonus: mkt.bonus ?? (kind === "armor" ? 1 : 1),
        },
        kind,
      };
    }
  }
  if (name) {
    const tokens = name.toLowerCase()
      .replace(/®/g, "")
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3);
    let best: { row: Row; kind: SprawlItemKind; score: number } |
      null = null;
    for (const [kind, table] of tables) {
      for (const r of table) {
        const blob = `${r.slug} ${r.name}`.toLowerCase();
        let score = 0;
        for (const t of tokens) {
          if (blob.includes(t)) score++;
        }
        if (score >= 2 && (!best || score > best.score)) {
          best = { row: r, kind, score };
        }
      }
    }
    if (best) return { row: best.row, kind: best.kind };
  }
  return null;
}

/**
 * Repair mint bugs: market guns as kind=gear, missing bonus,
 * no mag. Pure — does not write DB.
 */
export function repairItemData(
  d: SprawlItemData,
  opts: { name?: string } = {},
): { data: SprawlItemData; changed: boolean } {
  let next = { ...d };
  let changed = false;
  const k0 = String(next.kind ?? "gear");
  const match = matchCombatRow(next.slug, opts.name);
  if (match) {
    if (
      next.kind !== match.kind &&
      (k0 === "gear" || k0 === "weapon")
    ) {
      next = { ...next, kind: match.kind };
      changed = true;
    }
    if (
      match.kind !== "armor" &&
      (next.bonus == null || Number(next.bonus) === 0)
    ) {
      const b = match.row.bonus != null
        ? Number(match.row.bonus)
        : 1;
      if (b > 0) {
        next = { ...next, bonus: b };
        changed = true;
      }
    }
    if (
      !next.category &&
      match.row.category != null
    ) {
      next = {
        ...next,
        category: String(match.row.category),
      };
      changed = true;
    }
    if (
      next.rangeM == null &&
      match.row.rangeM != null
    ) {
      next = {
        ...next,
        rangeM: Number(match.row.rangeM),
      };
      changed = true;
    }
  }
  const k = String(next.kind ?? "");
  if (
    (k === "firearm" || k === "melee" || k === "heavy" ||
      k === "weapon") &&
    (next.bonus == null || Number(next.bonus) === 0)
  ) {
    next = { ...next, bonus: 1 };
    changed = true;
  }
  if (k === "firearm" || k === "heavy" || k === "weapon") {
    const withMag = ensureMag(next);
    if (
      withMag.mag !== next.mag ||
      withMag.magMax !== next.magMax
    ) {
      next = withMag;
      changed = true;
    }
  }
  return { data: next, changed };
}

/** Read + repair sprawl_item (in-memory on obj.state). */
export function itemDataRepaired(obj: IDBObj): SprawlItemData | null {
  const d = itemData(obj);
  if (!d) return null;
  const { data, changed } = repairItemData(d, {
    name: String(obj.name ?? ""),
  });
  if (changed) {
    obj.state = { ...obj.state, sprawl_item: data };
  }
  return data;
}

export function displayName(obj: IDBObj): string {
  return obj.name ?? itemData(obj)?.slug ?? "thing";
}

/** Parse "1d6" | "2d6" | "3d6" | "d6" into a rolled total. */
export function rollUsesDice(
  expr: string,
  rng = () => 1 + Math.floor(Math.random() * 6),
): number {
  const m = String(expr).trim().toLowerCase().match(
    /^(?:(\d)?d6)$/,
  );
  if (!m) return 1;
  const n = m[1] ? Number(m[1]) : 1;
  return rollNd6(Math.max(1, Math.min(6, n)), rng);
}

function cleanName(name: string): string {
  return name
    .replace(
      /\s*\((?:\d+d6|d6|\d+)\s+[^)]*\)\s*$/i,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function asStringList(v: unknown): string[] | undefined {
  if (!Array.isArray(v) || !v.length) return undefined;
  return v.map((x) => String(x));
}

export function buildItemData(
  src: ItemSource,
  rng?: () => number,
): SprawlItemData {
  const kind = String(src.kind ?? "gear") as SprawlItemKind;
  const defLoad = kind === "mod" ? 0 : 1;
  const loadRaw = src.load != null ? Number(src.load) : defLoad;
  const data: SprawlItemData = {
    slug: src.slug,
    kind,
    load: Number.isFinite(loadRaw) ? loadRaw : defLoad,
  };
  if (src.bonus != null && Number(src.bonus) !== 0) {
    data.bonus = Number(src.bonus);
  }
  const notes = src.notes ?? src.blurb;
  if (notes) data.notes = String(notes);

  let uses: number | undefined;
  if (src.usesDice) {
    uses = rollUsesDice(String(src.usesDice), rng);
  } else if (src.uses != null) {
    uses = Number(src.uses);
  }
  if (uses != null && uses > 0) {
    data.uses = uses;
    data.usesMax = uses;
  }
  if (src.unit) data.unit = String(src.unit);
  if (src.useEffect) data.useEffect = String(src.useEffect);
  const tags = asStringList(src.tags);
  if (tags) data.tags = tags;
  const hosts = asStringList(src.hostKinds);
  if (hosts) data.hostKinds = hosts;
  if (Array.isArray(src.mods) && src.mods.length) {
    data.mods = (src.mods as SprawlModInstall[]).map((m) => ({
      slug: String(m.slug),
      name: String(m.name ?? m.slug),
      ...(m.bonus != null && Number(m.bonus) > 0
        ? { bonus: Number(m.bonus) }
        : {}),
      ...(Array.isArray(m.tags) && m.tags.length
        ? { tags: m.tags.map(String) }
        : {}),
      ...(m.effect ? { effect: String(m.effect) } : {}),
    }));
  }
  const statMods = parseStatMods(
    src.statMods,
    src.modStat,
    src.mod,
  );
  if (statMods) data.statMods = statMods;
  if (src.loadoutMult != null) {
    const lm = Number(src.loadoutMult);
    if (Number.isFinite(lm) && lm !== 1) data.loadoutMult = lm;
  }
  if (src.loadoutBonus != null) {
    const lb = Number(src.loadoutBonus);
    if (Number.isFinite(lb) && lb !== 0) data.loadoutBonus = lb;
  }
  if (src.bonusWhen != null) {
    data.bonusWhen = String(src.bonusWhen) as SprawlBonusWhen;
  } else if (kind === "armor") {
    data.bonusWhen = "worn";
  }
  if (src.ds != null && Number.isFinite(Number(src.ds))) {
    data.ds = Number(src.ds);
    data.dsMax = src.dsMax != null
      ? Number(src.dsMax)
      : data.ds;
  }
  if (src.chassis) data.chassis = String(src.chassis);
  if (src.category) data.category = String(src.category);
  if (src.ammoSlug) data.ammoSlug = String(src.ammoSlug);
  if (src.rangeM != null && Number.isFinite(Number(src.rangeM))) {
    data.rangeM = Number(src.rangeM);
  }
  if (kind === "vehicle" || kind === "vehicle-mod") {
    data.load = 0;
  }
  if (kind === "firearm" || kind === "heavy" || kind === "weapon") {
    const withMag = ensureMag(data);
    if (src.magMax != null && Number.isFinite(Number(src.magMax))) {
      withMag.magMax = Number(src.magMax);
    }
    if (src.mag != null && Number.isFinite(Number(src.mag))) {
      withMag.mag = Number(src.mag);
    } else if (withMag.magMax != null) {
      withMag.mag = withMag.magMax;
    }
    return withMag;
  }
  return data;
}

export async function createItem(
  u: IUrsamuSDK,
  ownerId: string,
  src: ItemSource,
  opts: { name?: string; rng?: () => number } = {},
): Promise<IDBObj | null> {
  const data = buildItemData(src, opts.rng);
  const name = cleanName(
    opts.name ?? String(src.name ?? src.slug),
  );
  const obj = await u.db.create({
    name,
    flags: new Set(["thing"]),
    location: ownerId,
    state: { sprawl_item: data },
    contents: [],
  });
  return obj ?? null;
}

export async function destroyItem(
  u: IUrsamuSDK,
  id: string,
): Promise<void> {
  await u.db.destroy(id);
}

export async function carriedItems(
  u: IUrsamuSDK,
  ownerId: string,
): Promise<IDBObj[]> {
  const contents = await u.db.search({ location: ownerId });
  return (contents as IDBObj[]).filter(isSprawlItem);
}

export async function carriedData(
  u: IUrsamuSDK,
  ownerId: string,
): Promise<SprawlItemData[]> {
  const items = await carriedItems(u, ownerId);
  return items.map((o) => itemData(o)!).filter(Boolean);
}

/** One-line summary of an installed mod (no tree prefix). */
export function formatModInstall(m: SprawlModInstall): string {
  const name = (m.name || m.slug || "mod").trim();
  const bits: string[] = [];
  if (m.bonus != null && m.bonus > 0) bits.push(`+${m.bonus}`);
  if (m.tags?.length) bits.push(m.tags.join("/"));
  if (!bits.length && m.effect) {
    const e = String(m.effect).trim();
    if (e) bits.push(e.length > 28 ? e.slice(0, 25) + "…" : e);
  }
  return bits.length ? `${name} (${bits.join(" · ")})` : name;
}

/**
 * Nested inventory lines for mods installed on a host Thing.
 * Empty when none. Each line is ready to push under the host row
 * (includes leading indent + tree marker).
 */
export function itemModLines(obj: IDBObj): string[] {
  const d = itemData(obj);
  const mods = d?.mods;
  if (!mods?.length) return [];
  return mods.map((m) => `       └ ${formatModInstall(m)}`);
}

/** Host label only — attached mods use itemModLines(). */
export function itemLabel(obj: IDBObj): string {
  const d = itemData(obj);
  const base = displayName(obj);
  if (!d) return base;
  const bits: string[] = [];
  if (d.slot && d.slot !== "carried") bits.push(d.slot);
  if (d.kind === "mod") bits.push("mod");
  {
    const hb = hostCombatBonus(d);
    if (hb > 0) bits.push(`+${hb}`);
  }
  if (d.statMods?.length) {
    for (const sm of d.statMods) {
      const m = Number(sm.mod) || 0;
      if (!m) continue;
      bits.push(
        `${shortStat(String(sm.stat))}${m > 0 ? "+" : ""}${m}`,
      );
    }
  }
  if (d.loadoutMult != null && d.loadoutMult !== 1) {
    bits.push(`loadout×${d.loadoutMult}`);
  }
  if (d.loadoutBonus) {
    bits.push(
      `loadout${d.loadoutBonus > 0 ? "+" : ""}${d.loadoutBonus}`,
    );
  }
  if (d.uses != null) {
    const u = d.unit ? ` ${d.unit}` : "";
    const max = d.usesMax != null ? `/${d.usesMax}` : "";
    bits.push(`${d.uses}${max}${u}`);
  }
  if (d.magMax != null) {
    bits.push(`mag ${d.mag ?? 0}/${d.magMax}`);
  }
  if (d.ammoSlug) {
    bits.push(`ammo ${d.ammoSlug}`);
  }
  const nMods = d.mods?.length ?? 0;
  if (nMods > 0) bits.push(`${nMods} mod${nMods === 1 ? "" : "s"}`);
  bits.push(`load ${d.load || 0}`);
  return `${base} ${bits.length ? "(" + bits.join(" · ") + ")" : ""}`
    .trim();
}

/** Host row + nested mod rows for inv / sheet listings. */
export function itemDisplayLines(
  obj: IDBObj,
  opts: { index?: number } = {},
): string[] {
  const head = opts.index != null
    ? `#${opts.index} ${itemLabel(obj)}`
    : itemLabel(obj);
  return [head, ...itemModLines(obj)];
}

export async function setItemSlot(
  u: IUrsamuSDK,
  item: IDBObj,
  slot: "carried" | "worn" | "wielded",
): Promise<SprawlItemData | null> {
  const d = itemData(item);
  if (!d) return null;
  // One primary wielded weapon at a time.
  if (slot === "wielded") {
    const owner = String(
      (item as { location?: string }).location ?? "",
    );
    if (owner) {
      const pack = await carriedItems(u, owner);
      for (const o of pack) {
        if (o.id === item.id) continue;
        const od = itemData(o);
        if (od?.slot === "wielded") {
          await writeItemData(u, o, { ...od, slot: "carried" });
        }
      }
    }
  }
  const next = { ...d, slot };
  await writeItemData(u, item, next);
  return next;
}

/** Personal pack only — same order as +loadout / inv #n. */
export function personalGearItems(items: IDBObj[]): IDBObj[] {
  return items.filter((o) => {
    const k = String(itemData(o)?.kind ?? "");
    return k !== "vehicle" && k !== "vehicle-mod";
  });
}

/** Resolve by #1-based loadout index, id, slug, or name. */
export async function resolveItemRef(
  u: IUrsamuSDK,
  ownerId: string,
  ref: string,
): Promise<IDBObj | null> {
  const raw = ref.trim();
  if (!raw) return null;
  const all = await carriedItems(u, ownerId);
  // #n matches inv / +loadout numbering (personal gear only).
  const items = personalGearItems(all);
  if (!items.length && !all.length) return null;

  if (/^#?\d+$/.test(raw)) {
    const n = Number(raw.replace(/^#/, ""));
    if (n >= 1 && n <= items.length) return items[n - 1];
  }
  const pool = items.length ? items : all;
  const byId = pool.find((o) => o.id === raw) ??
    all.find((o) => o.id === raw);
  if (byId) return byId;

  const lc = raw.toLowerCase();
  const exactSlug = pool.find((o) => itemData(o)?.slug === lc);
  if (exactSlug) return exactSlug;

  const nameExact = pool.find(
    (o) => displayName(o).toLowerCase() === lc,
  );
  if (nameExact) return nameExact;

  const partial = pool.filter((o) => {
    const d = itemData(o);
    const nm = displayName(o).toLowerCase();
    return nm.includes(lc) || (d?.slug ?? "").includes(lc);
  });
  if (partial.length === 1) return partial[0];
  return null;
}

export async function writeItemData(
  u: IUrsamuSDK,
  item: IDBObj,
  data: SprawlItemData,
): Promise<void> {
  await u.db.modify(item.id, "$set", {
    "data.sprawl_item": data,
  });
  // Keep live object in sync for same-tick readers
  item.state = { ...item.state, sprawl_item: data };
}

export async function consumeUse(
  u: IUrsamuSDK,
  item: IDBObj,
): Promise<{ left: number; destroyed: boolean; data: SprawlItemData }> {
  const d = itemData(item);
  if (!d) {
    return {
      left: 0,
      destroyed: false,
      data: { slug: "?", kind: "gear", load: 1 },
    };
  }
  if (d.uses == null) {
    return { left: -1, destroyed: false, data: d };
  }
  const left = Math.max(0, d.uses - 1);
  if (left <= 0) {
    await destroyItem(u, item.id);
    return { left: 0, destroyed: true, data: { ...d, uses: 0 } };
  }
  const next = { ...d, uses: left };
  await writeItemData(u, item, next);
  return { left, destroyed: false, data: next };
}

export function loadFromItems(
  items: ReadonlyArray<SprawlItemData | IDBObj>,
): number {
  const rows = items.map((i) => {
    const d = "slug" in i && !("flags" in i)
      ? i as SprawlItemData
      : itemData(i as IDBObj);
    if (!d) return { load: 0 };
    const k = String(d.kind);
    // Vehicles / vehicle-mods never count toward personal load.
    if (k === "vehicle" || k === "vehicle-mod") {
      return { load: 0 };
    }
    return d;
  });
  return sumLoad(rows);
}

export function overloadFor(
  c: ISprawlChar,
  items: ReadonlyArray<SprawlItemData | IDBObj>,
): number {
  return overloadFrom(loadFromItems(items), c.loadoutMax);
}

const COMBAT_HOST_KINDS = new Set([
  "firearm",
  "melee",
  "armor",
  "weapon",
  "heavy",
  "gear",
]);
const WEAPON_HOST_KINDS = new Set([
  "firearm",
  "heavy",
  "melee",
  "weapon",
]);

export type CombatGearBonus = {
  total: number;
  parts: string[];
  /** Extra Upgrade dice from smart-targeting etc. */
  upgrade: number;
};

export type CombatGearOpts = {
  /**
   * Attack-mode tags the roll is using (aim, shot, burst…).
   * Default `["shot"]` — standard fire / default attack.
   */
  actionTags?: string[];
};

/**
 * Map +attack/<mode> to mod tags that should apply.
 * shot = default weapon attack (grips); aim/burst/auto are exclusive.
 */
export function attackModeTags(mode: string): string[] {
  const m = (mode ?? "").toLowerCase().trim();
  if (m === "melee") return ["melee", "shot"];
  if (m === "burst") return ["burst"];
  if (m === "auto" || m === "fullauto") return ["auto"];
  if (m === "pb" || m === "pointblank") return ["shot", "pb"];
  if (m.startsWith("aim")) return ["aim"];
  if (m === "fastdraw") return ["shot", "fastdraw"];
  return ["shot"];
}

function modTagsMatch(
  modTags: string[] | undefined,
  actionTags: ReadonlySet<string>,
): boolean {
  if (!modTags?.length) return true;
  return modTags.some((t) => actionTags.has(t.toLowerCase()));
}

/**
 * True for ranged attack modes. Melee mode lists "shot" as a
 * default-weapon tag but is not ranged (no upgrade-shot).
 */
export function isRangedAction(
  actionTags: readonly string[],
): boolean {
  const s = new Set(actionTags.map((t) => t.toLowerCase()));
  return !s.has("melee");
}

function hostLabel(
  // deno-lint-ignore no-explicit-any
  raw: any,
  d: SprawlItemData,
): string {
  if (raw && typeof raw === "object" && "flags" in raw) {
    return displayName(raw as IDBObj);
  }
  return (d as { name?: string }).name ?? d.slug;
}

/**
 * Short tag for attack/drive mod lines.
 * Prefer last slug segment: targeting-scope → scope,
 * mecha-weapons-bay → bay, kr-16 → kr-16.
 */
export function shortPartName(
  name: string,
  slug?: string,
): string {
  const sl = String(slug ?? "").trim().toLowerCase();
  if (sl) {
    const segs = sl.split("-").filter(Boolean);
    const last = segs[segs.length - 1] ?? sl;
    // Weak tails (link, gun, rifle) → two-segment tag
    if (
      last.length >= 2 && last.length <= 8 &&
      segs.length >= 2 &&
      /^(link|gun|rifle|pistol|smg|mod|kit)$/i.test(last)
    ) {
      return segs.slice(-2).join("-");
    }
    if (last.length >= 2 && last.length <= 8) return last;
    if (segs[0] && segs[0].length <= 12) return segs[0];
    if (sl.length <= 14) return sl;
    return sl.slice(0, 12);
  }
  const s = String(name ?? "").trim();
  if (!s) return "?";
  if (s.length <= 14) return s;
  const tok = s.split(/\s+/).pop() ?? s;
  if (tok.length >= 2 && tok.length <= 14) return tok;
  return s.slice(0, 12) + "…";
}

function isWeaponKind(k: string): boolean {
  return WEAPON_HOST_KINDS.has(k);
}

/**
 * Host weapon/armor bonuses + installed mods whose tags match
 * the current attack mode. Loose kind=mod Things never count.
 * Weapons: prefer wielded only (else all matching hosts).
 */
export function combatGearBonusFromItems(
  // deno-lint-ignore no-explicit-any
  items: ReadonlyArray<any>,
  opts: CombatGearOpts = {},
): CombatGearBonus {
  const tags = (opts.actionTags?.length
    ? opts.actionTags
    : ["shot"]).map((t) => t.toLowerCase());
  const actionSet = new Set(tags);
  const ranged = isRangedAction(tags);
  const parts: string[] = [];
  let total = 0;
  let upgrade = 0;

  type GearRow = { raw: unknown; d: SprawlItemData };
  const rows: GearRow[] = [];
  for (const raw of items) {
    let d: SprawlItemData | null = null;
    if (raw && typeof raw === "object" && "flags" in raw) {
      d = itemDataRepaired(raw as IDBObj);
    } else if (raw && typeof raw === "object") {
      const base = raw as SprawlItemData;
      if (base?.slug) {
        d = repairItemData(base).data;
      }
    }
    if (d?.slug) rows.push({ raw, d });
  }

  const wieldedWeapons = rows.filter((r) =>
    isWeaponKind(String(r.d.kind)) && r.d.slot === "wielded"
  );
  // One primary weapon unless several are wielded.
  let useWeapons = wieldedWeapons;
  if (!useWeapons.length) {
    const cands = rows.filter((r) => {
      const k = String(r.d.kind);
      return isWeaponKind(k) && hostCountsForAction(k, ranged);
    });
    const pref = cands.find((r) =>
      String(r.d.kind) === (ranged ? "firearm" : "melee")
    ) ?? cands.find((r) => String(r.d.kind) === "heavy") ??
      cands[0];
    useWeapons = pref ? [pref] : [];
  }

  for (const { raw, d } of rows) {
    const k = String(d.kind);
    if (!COMBAT_HOST_KINDS.has(k)) continue;
    const hostOk = hostCountsForAction(k, ranged);
    if (!hostOk) continue;

    // Skip non-selected weapons when something is wielded.
    if (isWeaponKind(k) && !useWeapons.some((w) => w.d === d)) {
      continue;
    }

    // Catalog/market guns often omit bonus — book weapons are +1.
    const b = hostCombatBonus(d);
    if (b > 0 && combatBonusActive(d)) {
      total += b;
      parts.push(
        `${shortPartName(hostLabel(raw, d), d.slug)}+${b}`,
      );
    } else if (
      isWeaponKind(k) &&
      combatBonusActive(d) &&
      useWeapons.some((w) => w.d === d)
    ) {
      // Still name the primary so +attack shows which gun fired
      parts.push(shortPartName(hostLabel(raw, d), d.slug));
    }

    if (!isWeaponKind(k) || !d.mods?.length) continue;
    for (const m of d.mods) {
      const mTags = m.tags ?? [];
      const mLower = mTags.map((t) => t.toLowerCase());
      if (
        ranged &&
        (mLower.includes("upgrade-shot") ||
          mLower.includes("upgrade"))
      ) {
        upgrade += 1;
        parts.push("upg");
      }
      const mb = m.bonus ?? 0;
      if (mb <= 0) continue;
      if (!modTagsMatch(mTags, actionSet)) continue;
      total += mb;
      parts.push(
        `${shortPartName(m.name || m.slug, m.slug)}+${mb}`,
      );
    }
  }
  return { total, parts, upgrade };
}

/** Armor/gear always; firearms on ranged; melee on melee. */
function hostCountsForAction(
  kind: string,
  ranged: boolean,
): boolean {
  if (kind === "armor" || kind === "gear") return true;
  if (kind === "weapon") return true;
  if (ranged) return kind === "firearm" || kind === "heavy";
  return kind === "melee";
}

/**
 * Effective attack bonus on a host item.
 * Firearms/melee/heavy default to +1 when unset or 0 (market
 * mint often wrote bonus:0 / kind:gear).
 */
export function hostCombatBonus(d: SprawlItemData): number {
  const k = String(d.kind ?? "");
  const isWpn =
    k === "firearm" || k === "melee" || k === "heavy" ||
    k === "weapon";
  if (d.bonus != null && Number.isFinite(Number(d.bonus))) {
    const b = Number(d.bonus);
    if (b === 0 && isWpn) return 1;
    return Math.max(0, b);
  }
  if (isWpn) return 1;
  // Catalog gun still stored as kind=gear
  const { data: fix, changed } = repairItemData(d);
  if (changed && isWeaponKind(String(fix.kind))) {
    return hostCombatBonus(fix);
  }
  return 0;
}

/** One-shot: legacy sheet loadout[] → Things, then clear array. */
export async function migrateLoadoutToThings(
  u: IUrsamuSDK,
  owner: IDBObj,
  c: ISprawlChar,
): Promise<ISprawlChar> {
  const legacy = c.loadout ?? [];
  if (!legacy.length) return c;
  const existing = await carriedItems(u, owner.id);
  if (existing.length > 0) {
    // Already on Things — just clear stale array
    const next = { ...c, loadout: [] as ILoadItem[] };
    await u.db.modify(owner.id, "$set", {
      "state.sprawl": next,
    });
    return next;
  }
  for (const row of legacy) {
    await createItem(u, owner.id, {
      slug: row.slug,
      name: row.name,
      kind: row.kind,
      load: row.load,
      bonus: row.bonus,
      notes: row.notes,
    });
  }
  const next = { ...c, loadout: [] as ILoadItem[] };
  await u.db.modify(owner.id, "$set", { "state.sprawl": next });
  return next;
}

/**
 * Infer useEffect/uses for market mints that only have a name
 * (Lazarus blister, hyperdex pack, cigarettes, …).
 */
export function inferConsumable(
  d: SprawlItemData,
  display = "",
): { data: SprawlItemData; changed: boolean } {
  const blob = `${d.slug} ${display}`.toLowerCase();
  let next = { ...d };
  let changed = false;

  const set = (
    patch: Partial<SprawlItemData>,
  ): void => {
    next = { ...next, ...patch };
    changed = true;
  };

  if (/lazarus/.test(blob)) {
    if (!next.useEffect) set({ useEffect: "lazarus" });
    if (next.uses == null) {
      set({ uses: 6, usesMax: 6, unit: next.unit ?? "patch" });
    } else if (!next.unit) set({ unit: "patch" });
    if (next.kind === "gear") set({ kind: "consumable" });
  } else if (/hyperdex/.test(blob)) {
    if (!next.useEffect) set({ useEffect: "drug:hyperdex" });
    if (next.uses == null) {
      set({ uses: 3, usesMax: 3, unit: next.unit ?? "dose" });
    }
    if (next.kind === "gear") set({ kind: "drug" });
  } else if (/destress|de-stress|destress-xpress/.test(blob)) {
    if (!next.useEffect) {
      set({ useEffect: "drug:destress-xpress" });
    }
    if (next.uses == null) {
      set({ uses: 6, usesMax: 6, unit: next.unit ?? "dose" });
    }
    if (next.kind === "gear") set({ kind: "drug" });
  } else if (/yeheyuan|cigarette/.test(blob)) {
    if (!next.useEffect) set({ useEffect: "narrative" });
    if (next.uses == null) {
      set({ uses: 20, usesMax: 20, unit: next.unit ?? "cigarette" });
    }
    if (next.kind === "gear") set({ kind: "consumable" });
  }

  return { data: next, changed };
}

export function isUsable(d: SprawlItemData): boolean {
  const fixed = inferConsumable(d).data;
  if (fixed.useEffect) return true;
  if (fixed.uses != null && fixed.uses > 0) return true;
  return false;
}
