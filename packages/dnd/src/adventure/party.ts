/**
 * Adventure party: PCs in the room + hired NPC companions.
 */
import type { IDBObj, IUrsamuSDK } from "@ursamu/mush";

export type PartyMember = {
  id: string;
  name: string;
  kind: "pc" | "hireling";
};

export type PartyInfo = {
  size: number;
  pcs: PartyMember[];
  hirelings: PartyMember[];
  /** All ids (leader first). */
  ids: string[];
};

function flagHas(o: IDBObj, name: string): boolean {
  const f = o.flags as unknown;
  if (f instanceof Set) return f.has(name);
  if (Array.isArray(f)) {
    return f.map(String).includes(name);
  }
  return String(f ?? "").split(/\s+/).includes(name);
}

function isPc(o: IDBObj): boolean {
  return flagHas(o, "player");
}

function isHireling(
  o: IDBObj,
  leaderIds: Set<string>,
): boolean {
  // deno-lint-ignore no-explicit-any
  const dnd = (o.state as any)?.dnd;
  if (!dnd || typeof dnd !== "object") return false;
  if (!dnd.hireling && !dnd.companion) return false;
  const leader = String(dnd.leaderId ?? "");
  const owner = String(
    // deno-lint-ignore no-explicit-any
    (o.state as any)?.owner ?? "",
  );
  if (leader && leaderIds.has(leader)) return true;
  if (owner && leaderIds.has(owner)) return true;
  return false;
}

/**
 * Count adventure party in the enactor's current room:
 * connected/other players + hirelings led by those PCs.
 */
export async function countParty(
  u: IUrsamuSDK,
): Promise<PartyInfo> {
  const roomId = u.here?.id ?? u.me.location ?? "";
  const pcs: PartyMember[] = [{
    id: u.me.id,
    name: u.me.name?.split(";")[0] ?? "You",
    kind: "pc",
  }];
  const leaderIds = new Set<string>([u.me.id]);

  let here: IDBObj[] = [];
  if (roomId) {
    try {
      here = await u.db.search({ location: roomId });
    } catch {
      here = [];
    }
  }

  for (const o of here) {
    if (o.id === u.me.id) continue;
    if (!isPc(o)) continue;
    // Prefer allies with a D&D sheet (skip pure OOC if no sheet)
    // deno-lint-ignore no-explicit-any
    const hasSheet = !!(o.state as any)?.dnd;
    if (!hasSheet) continue;
    pcs.push({
      id: o.id,
      name: (o.name ?? o.id).split(";")[0],
      kind: "pc",
    });
    leaderIds.add(o.id);
  }

  const hirelings: PartyMember[] = [];
  for (const o of here) {
    if (isPc(o)) continue;
    if (!isHireling(o, leaderIds)) continue;
    hirelings.push({
      id: o.id,
      name: (o.name ?? o.id).split(";")[0],
      kind: "hireling",
    });
  }

  const ids = [
    ...pcs.map((p) => p.id),
    ...hirelings.map((h) => h.id),
  ];
  return {
    size: Math.max(1, ids.length),
    pcs,
    hirelings,
    ids,
  };
}

/** Move hirelings (and optionally other PCs stay — only hirelings follow). */
export async function bringHirelings(
  u: IUrsamuSDK,
  destRoomId: string,
  hirelingIds: string[],
): Promise<number> {
  let n = 0;
  for (const id of hirelingIds) {
    try {
      await u.db.modify(id, "$set", { location: destRoomId });
      n += 1;
    } catch {
      /* skip */
    }
  }
  return n;
}

/**
 * Scale base fodder [min,max] per room by party size.
 * Solo ≈ table values; each extra member +50% (capped).
 */
export function scaleFodderRange(
  base: [number, number],
  partySize: number,
): [number, number] {
  const p = Math.max(1, Math.min(8, Math.floor(partySize)));
  const mult = 1 + (p - 1) * 0.5;
  const lo = Math.max(0, Math.floor(base[0] * mult));
  const hi = Math.max(lo, Math.ceil(base[1] * mult));
  // Large parties always face at least one foe in middle rooms
  if (p >= 3 && hi < 1) return [1, 1];
  return [lo, hi];
}

/**
 * Extra guards in the boss room from party size.
 * Solo: 0–1 · duo: 0–1 · 3–4: 1–2 · 5+: 2–3
 */
export function bossGuardCount(
  partySize: number,
  rng: () => number = Math.random,
): number {
  const p = Math.max(1, Math.floor(partySize));
  const base = Math.floor((p - 1) / 2); // 0,0,1,1,2,2,3…
  const bonus = rng() < 0.35 ? 1 : 0;
  return Math.min(5, Math.max(0, base + bonus));
}

/** Human-readable party line for +adv output. */
export function formatPartyLine(party: PartyInfo): string {
  const bits = [
    `${party.pcs.length} PC` +
    (party.pcs.length === 1 ? "" : "s"),
  ];
  if (party.hirelings.length) {
    bits.push(
      `${party.hirelings.length} hireling` +
        (party.hirelings.length === 1 ? "" : "s"),
    );
  }
  return `Party ${party.size} (${bits.join(", ")})`;
}
