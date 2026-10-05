/** Catalog resolve + enrich for staff free mint. */
import type { IAugItem, ISprawlChar } from "../db/schemas.ts";
import {
  AMMO,
  ARMOR,
  AUGS,
  BELONGINGS,
  FIREARMS,
  HEAVY,
  MARKET,
  MELEE,
  SHARDS,
  allGearRows,
  find,
  findByName,
  type Row,
} from "./catalog.ts";
import { resolveStock } from "./market-stock.ts";
import type { GrantResult } from "./staff-grant.ts";

export function resolveRow(arg: string): Row | undefined {
  return resolveStock(arg) ??
    find("firearm", arg) ??
    find("melee", arg) ??
    find("armor", arg) ??
    find("heavy", arg) ??
    find("ammo", arg) ??
    find("mod", arg) ??
    find("drone", arg) ??
    find("aug", arg) ??
    find("shard", arg) ??
    find("market", arg) ??
    findByName(
      [...allGearRows(), ...MARKET, ...AUGS, ...SHARDS],
      arg,
    );
}

export function gearKind(row: Row): string {
  for (const k of [
    "firearm", "melee", "armor", "heavy", "drone",
    "ammo", "mod", "aug", "shard",
  ] as const) {
    if (find(k, row.slug)) return k;
  }
  const cat = String(row.category ?? "").toLowerCase();
  if (cat === "augmentation") return "aug-market";
  if (cat === "shardware") return "shard-market";
  if (
    ["firearm", "melee", "armor", "heavy", "ammo", "mod"]
      .includes(cat)
  ) {
    return cat;
  }
  return "gear";
}

export function enrichRow(row: Row, kind: string): Row {
  let out = row;
  const cat = String(row.category ?? kind ?? "").toLowerCase();
  const tables: Record<string, Row[]> = {
    firearm: FIREARMS as Row[],
    melee: MELEE as Row[],
    heavy: HEAVY as Row[],
    armor: ARMOR as Row[],
  };
  const table = tables[cat] ?? tables[kind];
  if (table) {
    const hit = table.find((t) => t.slug === row.slug);
    if (hit) out = { ...hit, ...row, ...hit };
  }
  if (!out.useEffect && out.uses == null && !out.usesDice) {
    const slug = String(out.slug ?? "").toLowerCase();
    const b = BELONGINGS.find((x) => {
      const bs = String(x.slug).toLowerCase();
      return slug.includes(bs) || bs.includes(slug);
    });
    if (b) {
      out = {
        ...b,
        ...out,
        slug: out.slug,
        name: out.name,
        useEffect: b.useEffect ?? out.useEffect,
        uses: b.uses ?? out.uses,
        usesDice: b.usesDice ?? out.usesDice,
        unit: b.unit ?? out.unit,
        kind: b.kind ?? out.kind,
        load: b.load ?? out.load ?? 1,
      };
    }
  }
  if (kind === "ammo" || String(out.category) === "ammo") {
    const a = find("ammo", String(out.slug)) ??
      findByName(AMMO, String(out.name ?? ""));
    out = {
      ...(a ?? {}),
      ...out,
      kind: "ammo",
      slug: String(out.slug),
      name: String(out.name ?? a?.name ?? out.slug),
      uses: out.uses ?? a?.uses ?? 1,
      unit: out.unit ?? "box",
      load: out.load ?? 1,
    };
  }
  return out;
}

export function trySheetGrant(
  c: ISprawlChar,
  row: Row,
  kind: string,
): GrantResult | null {
  if (kind === "aug" || kind === "aug-market") {
    const augRow = find("aug", row.slug) ??
      findByName(AUGS, String(row.name)) ??
      (kind === "aug" ? row : undefined);
    if (!augRow || !find("aug", augRow.slug)) return null;
    if (c.augs.some((a) => a.slug === augRow.slug)) {
      return { ok: false, reason: "Already installed." };
    }
    const item: IAugItem = {
      slug: augRow.slug,
      name: String(augRow.name),
      modStat: augRow.modStat
        ? String(augRow.modStat)
        : undefined,
      mod: augRow.mod != null
        ? Number(augRow.mod)
        : undefined,
    };
    return {
      ok: true,
      char: { ...c, augs: [...c.augs, item] },
      note: `aug ${item.name}`,
    };
  }
  if (kind === "shard" || kind === "shard-market") {
    const sh = find("shard", row.slug) ??
      findByName(SHARDS, String(row.name)) ??
      (kind === "shard" ? row : undefined);
    if (!sh || !find("shard", sh.slug)) return null;
    if (c.shards.includes(sh.slug)) {
      return { ok: false, reason: "Already jacked." };
    }
    return {
      ok: true,
      char: { ...c, shards: [...c.shards, sh.slug] },
      note: `shard ${sh.name ?? sh.slug}`,
    };
  }
  return null;
}
