/**
 * Staff free catalog mint (Things, augs, shards, net).
 */
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import type { ISprawlChar } from "../db/schemas.ts";
import { createItem, displayName } from "./items.ts";
import { stockKind } from "./market-stock.ts";
import { equipConsole, installSoftware } from "./net.ts";
import type { GrantResult } from "./staff-grant.ts";
import {
  enrichRow,
  gearKind,
  resolveRow,
  trySheetGrant,
} from "./staff-mint-util.ts";

export async function grantCatalogGear(
  u: IUrsamuSDK,
  owner: IDBObj,
  c: ISprawlChar,
  rawSlug: string,
): Promise<GrantResult> {
  const arg = rawSlug.trim();
  if (!arg) {
    return { ok: false, reason: "Need a catalog slug." };
  }
  const row = resolveRow(arg);
  if (!row) {
    return {
      ok: false,
      reason: "Unknown stock. Try +market or +gear/catalog.",
    };
  }
  const netK = stockKind(row);
  if (netK === "console") {
    const eq = equipConsole(c, row.slug);
    if ("error" in eq) return { ok: false, reason: eq.error };
    return {
      ok: true,
      char: eq,
      note: `console ${row.name ?? row.slug}`,
    };
  }
  if (netK === "software") {
    const inst = installSoftware(c, row.slug);
    if ("error" in inst) {
      return { ok: false, reason: inst.error };
    }
    return {
      ok: true,
      char: inst,
      note: `software ${row.name ?? row.slug}`,
    };
  }
  const kind = gearKind(row);
  const sheet = trySheetGrant(c, row, kind);
  if (sheet) return sheet;

  const itemKind =
    kind === "aug-market" || kind === "shard-market" ||
        kind === "aug" || kind === "shard"
      ? "gear"
      : kind;
  const e = enrichRow(row, itemKind);
  const mintKind = String(e.kind ?? itemKind);
  const soft = mintKind === "gear" || mintKind === "ammo" ||
    mintKind === "mod";
  const obj = await createItem(u, owner.id, {
    slug: String(e.slug ?? row.slug),
    name: String(e.name ?? row.name),
    kind: mintKind,
    load: Number(
      e.load ?? row.load ?? (mintKind === "mod" ? 0 : 1),
    ),
    bonus: Number(e.bonus ?? (soft ? 0 : 1)),
    uses: e.uses ?? row.uses,
    usesDice: e.usesDice ?? row.usesDice,
    unit: e.unit ?? row.unit,
    useEffect: e.useEffect ?? row.useEffect,
    notes: mintKind === "mod" && (e.effect ?? row.effect)
      ? String(e.effect ?? row.effect)
      : e.notes != null
      ? String(e.notes)
      : row.notes != null
      ? String(row.notes)
      : undefined,
    tags: e.tags ?? row.tags,
    hostKinds: mintKind === "mod"
      ? (e.host ?? row.host)
      : undefined,
    category: e.category ?? row.category,
    ammoSlug: e.ammoSlug ?? row.ammoSlug,
    rangeM: e.rangeM ?? row.rangeM,
    statMods: e.statMods ?? row.statMods,
    modStat: e.modStat ?? row.modStat,
    mod: e.mod ?? row.mod,
    loadoutMult: e.loadoutMult ?? row.loadoutMult,
    loadoutBonus: e.loadoutBonus ?? row.loadoutBonus,
    bonusWhen: e.bonusWhen ?? row.bonusWhen ??
      (mintKind === "armor" ? "worn" : undefined),
  });
  if (!obj) {
    return { ok: false, reason: "Could not mint item." };
  }
  return {
    ok: true,
    char: { ...c, loadout: [] },
    note: displayName(obj),
  };
}
