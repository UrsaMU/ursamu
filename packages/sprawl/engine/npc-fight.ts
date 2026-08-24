/**
 * Live NPC fight tracking.
 * Book p.26: NPC DS is also their Resilience; DS 0 = dead.
 * Stored on the attacker sheet (same pattern as hordes) so
 * multi-round fights keep damage without room DB wiring.
 */
import type { ISprawlChar } from "../db/schemas.ts";

export type SceneNpc = {
  key: string;
  name: string;
  slug?: string;
  /** Current DS / Resilience. */
  ds: number;
  /** Starting DS. */
  dsMax: number;
  at: number;
};

export type SceneNpcMap = Record<string, SceneNpc>;

function bag(c: ISprawlChar): SceneNpcMap {
  const raw = (c as { sceneNpcs?: SceneNpcMap }).sceneNpcs;
  if (!raw || typeof raw !== "object") return {};
  return { ...raw };
}

function write(
  c: ISprawlChar,
  next: SceneNpcMap,
): ISprawlChar {
  const out = { ...c } as ISprawlChar & {
    sceneNpcs?: SceneNpcMap;
  };
  if (Object.keys(next).length) out.sceneNpcs = next;
  else delete out.sceneNpcs;
  return out;
}

export function npcKey(raw: string): string {
  return String(raw ?? "").toLowerCase().trim()
    .replace(/\s+/g, "-");
}

/** Catalog or ad-hoc NPC currently in the fight. */
export function getSceneNpc(
  c: ISprawlChar,
  keyRaw: string,
): SceneNpc | null {
  const k = npcKey(keyRaw);
  if (!k) return null;
  return bag(c)[k] ?? null;
}

export function listSceneNpcs(c: ISprawlChar): SceneNpc[] {
  return Object.values(bag(c)).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

/**
 * Resolve live DS for a fight token. Spawns a tracker on first
 * touch if seedDs is provided.
 */
export function ensureSceneNpc(
  c: ISprawlChar,
  opts: {
    key: string;
    name: string;
    slug?: string;
    seedDs: number;
  },
): { next: ISprawlChar; npc: SceneNpc; fresh: boolean } {
  const k = npcKey(opts.key);
  const have = bag(c)[k];
  if (have && have.ds > 0) {
    return { next: c, npc: have, fresh: false };
  }
  const npc: SceneNpc = {
    key: k,
    name: opts.name,
    slug: opts.slug,
    ds: Math.max(1, Math.floor(opts.seedDs)),
    dsMax: Math.max(1, Math.floor(opts.seedDs)),
    at: Date.now(),
  };
  const nextBag = bag(c);
  nextBag[k] = npc;
  return { next: write(c, nextBag), npc, fresh: true };
}

export type NpcHitResult = {
  next: ISprawlChar;
  before: number;
  after: number;
  dropped: number;
  dead: boolean;
  npc: SceneNpc | null;
};

/**
 * Apply attack margin (and specialty) as Resilience/DS damage.
 */
export function hitSceneNpc(
  c: ISprawlChar,
  keyRaw: string,
  damage: number,
): NpcHitResult | null {
  const k = npcKey(keyRaw);
  const have = bag(c)[k];
  if (!have) return null;
  const dmg = Math.max(0, Math.floor(damage));
  const before = have.ds;
  const after = Math.max(0, before - dmg);
  const dropped = before - after;
  const nextBag = bag(c);
  if (after <= 0) {
    delete nextBag[k];
    return {
      next: write(c, nextBag),
      before,
      after: 0,
      dropped,
      dead: true,
      npc: null,
    };
  }
  const npc = { ...have, ds: after, at: Date.now() };
  nextBag[k] = npc;
  return {
    next: write(c, nextBag),
    before,
    after,
    dropped,
    dead: false,
    npc,
  };
}

export function clearSceneNpcs(c: ISprawlChar): ISprawlChar {
  return write(c, {});
}

export function clearOneSceneNpc(
  c: ISprawlChar,
  keyRaw: string,
): ISprawlChar {
  const k = npcKey(keyRaw);
  const nextBag = bag(c);
  delete nextBag[k];
  return write(c, nextBag);
}
