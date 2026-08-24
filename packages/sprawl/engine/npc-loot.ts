/**
 * Street payouts when an NPC/horde goes down.
 * Book has no fixed kill table — scales from DS (threat).
 * AP is a trickle toward the 100-AP advance (p.38).
 */
import rules from "../data/npc-loot.json" with { type: "json" };
import type { ISprawlChar } from "../db/schemas.ts";
import type { SprawlNpcData } from "./npcs.ts";
import type { Row } from "./catalog.ts";
import { grantAp } from "./advance-rules.ts";

type LootRules = {
  bityuanPerDs?: number;
  bityuanFloor?: number;
  apPerDs?: number;
  apFloor?: number;
  apCeil?: number;
  hordeBityuanPerMember?: number;
  hordeApPerMember?: number;
};

const R = rules as LootRules;

export type KillLoot = {
  bityuan: number;
  ap: number;
  label: string;
};

function clampInt(n: number, lo: number, hi?: number): number {
  let v = Math.floor(n);
  if (v < lo) v = lo;
  if (hi != null && v > hi) v = hi;
  return v;
}

/** Optional catalog overrides: loot.bityuan / loot.ap */
export function catalogLootOverride(
  row: Row | undefined,
): Partial<KillLoot> {
  if (!row) return {};
  const loot = (row as Record<string, unknown>).loot;
  if (!loot || typeof loot !== "object") return {};
  const L = loot as Record<string, unknown>;
  const out: Partial<KillLoot> = {};
  if (typeof L.bityuan === "number" && L.bityuan >= 0) {
    out.bityuan = Math.floor(L.bityuan);
  }
  if (typeof L.ap === "number" && L.ap >= 0) {
    out.ap = Math.floor(L.ap);
  }
  return out;
}

/** Payout from NPC threat (dsMax) + optional catalog row. */
export function lootForNpc(
  data: Pick<SprawlNpcData, "dsMax" | "name" | "slug">,
  row?: Row,
): KillLoot {
  const ds = Math.max(1, Math.floor(data.dsMax || 1));
  const perBy = R.bityuanPerDs ?? 12;
  const floorBy = R.bityuanFloor ?? 25;
  const perAp = R.apPerDs ?? 0.5;
  const floorAp = R.apFloor ?? 1;
  const ceilAp = R.apCeil ?? 15;

  let bityuan = clampInt(ds * perBy, floorBy);
  let ap = clampInt(ds * perAp, floorAp, ceilAp);

  const ov = catalogLootOverride(row);
  if (ov.bityuan != null) bityuan = ov.bityuan;
  if (ov.ap != null) ap = ov.ap;

  return {
    bityuan,
    ap,
    label: data.name || data.slug || "NPC",
  };
}

/** Payout when a Hollywood horde is wiped. */
export function lootForHorde(
  sizeMax: number,
  name = "horde",
): KillLoot {
  const n = Math.max(1, Math.floor(sizeMax));
  const byMem = R.hordeBityuanPerMember ?? 8;
  const apMem = R.hordeApPerMember ?? 0.25;
  return {
    bityuan: clampInt(n * byMem, R.bityuanFloor ?? 25),
    ap: clampInt(n * apMem, R.apFloor ?? 1, R.apCeil ?? 15),
    label: name,
  };
}

/** Apply kill loot to sheet (immutable). */
export function applyKillLoot(
  c: ISprawlChar,
  loot: KillLoot,
): ISprawlChar {
  if (loot.bityuan <= 0 && loot.ap <= 0) return c;
  let next: ISprawlChar = {
    ...c,
    bityuan: (c.bityuan ?? 0) + Math.max(0, loot.bityuan),
  };
  if (loot.ap > 0) next = grantAp(next, loot.ap);
  return next;
}

/** One-line payout for attack result block. */
export function formatLootLine(loot: KillLoot): string {
  const bits: string[] = [];
  if (loot.bityuan > 0) bits.push(`+${loot.bityuan} b¥`);
  if (loot.ap > 0) bits.push(`+${loot.ap} AP`);
  if (!bits.length) return "";
  return `LOOT ${bits.join(" · ")} (${loot.label})`;
}
