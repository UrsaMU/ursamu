/**
 * Auto-gigs — roll, rewards, tokens, card (d66 tables).
 * Site run logic: engine/gig-run.ts
 */
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import type {
  GigObjective,
  GigTier,
  IActiveGig,
  ISprawlChar,
} from "../db/schemas.ts";
import {
  ANTAGONISTS,
  GIG_BOSSES,
  GIG_COMPLICATIONS,
  GIG_CONTRACTS,
  GIG_MINIONS,
  GIG_OBJECTIVES,
  GIG_REWARDS,
  GIG_ROOMS,
  GIG_TARGETS,
  GIG_VENUES,
  HACK_TARGETS,
  find,
  pickByRoll,
  rollD66,
  type Row,
} from "./catalog.ts";
import { grantAp } from "./advance-rules.ts";
import { catalogNpc } from "./npcs.ts";

export type GigTokenData = {
  gigId: string;
  ownerId: string;
  name: string;
  slug: string;
  blurb?: string;
  at: number;
};

export function isGigToken(obj: IDBObj | null | undefined): boolean {
  return !!gigTokenData(obj);
}

export function gigTokenData(
  obj: IDBObj | null | undefined,
): GigTokenData | null {
  if (!obj) return null;
  const raw = (obj.state as Record<string, unknown> | undefined)
    ?.sprawl_gig_token as GigTokenData | undefined;
  if (!raw || typeof raw !== "object") return null;
  if (!raw.gigId || !raw.ownerId) return null;
  return raw;
}

function pickTier(row: Row | undefined): GigTier {
  const t = String(row?.tier ?? "mod").toLowerCase();
  if (t === "easy" || t === "mod" || t === "hard" || t === "legend") {
    return t;
  }
  if (t === "moderate" || t === "challenging") return "mod";
  if (t === "formidable" || t === "extreme") return "hard";
  if (t === "impossible") return "legend";
  return "mod";
}

function pickObjective(row: Row | undefined): GigObjective {
  const o = String(
    row?.objective ?? row?.slug ?? "kill-boss",
  ).toLowerCase();
  if (o.includes("hack")) return "hack-node";
  if (o.includes("recover") || o.includes("grab")) return "recover";
  return "kill-boss";
}

function newGigId(): string {
  return `g${Date.now().toString(36)}${
    Math.floor(Math.random() * 1e4).toString(36)
  }`;
}

function pickRow(table: Row[], rng?: () => number): Row | undefined {
  return pickByRoll(table, rollD66(rng)) ??
    table[Math.floor((rng?.() ?? Math.random()) * table.length)] ??
    table[0];
}

function filterByTier(table: Row[], tier: GigTier): Row[] {
  const hit = table.filter((r) =>
    String(r.tier ?? "").toLowerCase() === tier
  );
  return hit.length ? hit : table;
}

function filterVenues(kinds: string[] | undefined): Row[] {
  if (!kinds?.length) return GIG_VENUES;
  const set = new Set(kinds.map((k) => k.toLowerCase()));
  const hit = GIG_VENUES.filter((v) =>
    set.has(String(v.kind ?? "").toLowerCase())
  );
  return hit.length ? hit : GIG_VENUES;
}

/** Nodes by tier (virtual dungeon depth). */
export function nodesForTier(tier: GigTier): number {
  if (tier === "easy") return 2;
  if (tier === "hard") return 4;
  if (tier === "legend") return 5;
  return 3;
}

function hackForTier(tier: GigTier, rng?: () => number): {
  ds: number;
  slug: string;
  name: string;
} {
  const want = tier === "easy"
    ? ["easy"]
    : tier === "mod"
    ? ["moderate", "challenging", "easy"]
    : tier === "hard"
    ? ["hard", "formidable", "challenging"]
    : ["extreme", "impossible", "formidable", "hard"];
  const pool = HACK_TARGETS.filter((h) =>
    want.includes(String(h.tier ?? "").toLowerCase())
  );
  const row = pickRow(pool.length ? pool : HACK_TARGETS, rng) ??
    HACK_TARGETS[0];
  return {
    ds: Number(row.ds ?? 12),
    slug: String(row.slug),
    name: String(row.name ?? row.slug),
  };
}

function minionForTier(
  tier: GigTier,
  rng?: () => number,
): {
  slug: string;
  name: string;
  ds: number;
  count: number;
} {
  const pool = filterByTier(GIG_MINIONS, tier);
  const row = pickRow(pool, rng) ?? pool[0] ?? GIG_MINIONS[0];
  const antSlug = String(row.antagonist ?? "gang-member");
  const ant = catalogNpc(antSlug) ??
    find("antagonist", antSlug) ??
    ANTAGONISTS[0];
  return {
    slug: String(ant?.slug ?? antSlug),
    name: String(ant?.name ?? antSlug),
    ds: typeof ant?.ds === "number" ? ant.ds as number : 10,
    count: Math.max(1, Math.min(4, Number(row.count ?? 2))),
  };
}

/** Compose a fresh active gig from d66 tables. */
export function rollGig(
  rng: () => number = () => 1 + Math.floor(Math.random() * 6),
): IActiveGig {
  const contract = pickRow(GIG_CONTRACTS, rng) ?? GIG_CONTRACTS[0];
  const tier = pickTier(contract);
  const kinds = Array.isArray(contract.venueKinds)
    ? (contract.venueKinds as string[])
    : undefined;
  const venue = pickRow(filterVenues(kinds), rng) ??
    GIG_VENUES[0];
  const objective = pickObjective(pickRow(GIG_OBJECTIVES, rng));
  const bossPool = filterByTier(GIG_BOSSES, tier);
  const bossRow = pickRow(bossPool, rng) ?? bossPool[0];
  const antSlug = String(
    bossRow?.antagonist ?? bossRow?.name ?? "gang-member",
  );
  const ant = catalogNpc(antSlug) ??
    find("antagonist", antSlug) ??
    ANTAGONISTS[0];
  const target = pickRow(GIG_TARGETS, rng) ?? GIG_TARGETS[0];
  const mult = Number(contract.payoutMult ?? 1) || 1;
  const nodesMax = nodesForTier(tier);
  const room = pickRow(GIG_ROOMS, rng) ?? GIG_ROOMS[0];
  const minion = minionForTier(tier, rng);
  // ~2/3 of gigs get a complication
  const rollC = rng();
  const comp = rollC <= 4
    ? pickRow(GIG_COMPLICATIONS, rng)
    : undefined;
  const hack = objective === "hack-node"
    ? hackForTier(tier, rng)
    : undefined;

  return {
    id: newGigId(),
    title: String(contract.name ?? "Street Gig"),
    blurb: contract.blurb ? String(contract.blurb) : undefined,
    tier,
    objective,
    venueSlug: String(venue.slug),
    venueName: String(venue.name ?? venue.slug),
    venueBlurb: venue.description
      ? String(venue.description)
      : venue.blurb
      ? String(venue.blurb)
      : undefined,
    bossSlug: String(ant?.slug ?? antSlug),
    bossName: String(ant?.name ?? antSlug),
    bossDs: typeof ant?.ds === "number" ? ant.ds as number : 10,
    targetSlug: String(target.slug),
    targetName: String(target.name ?? target.slug),
    targetBlurb: target.blurb ? String(target.blurb) : undefined,
    status: "active",
    payoutMult: mult,
    at: Date.now(),
    nodesMax,
    node: 1,
    roomSlug: String(room.slug),
    roomName: String(room.name ?? room.slug),
    roomBlurb: room.blurb ? String(room.blurb) : undefined,
    roomDesc: room.description
      ? String(room.description)
      : room.blurb
      ? String(room.blurb)
      : undefined,
    nodeCleared: false,
    minionSlug: minion.slug,
    minionName: minion.name,
    minionDs: minion.ds,
    minionCount: minion.count,
    minionObjIds: [],
    complication: comp ? String(comp.name) : undefined,
    complicationBlurb: comp?.blurb
      ? String(comp.blurb)
      : undefined,
    hackDs: hack?.ds,
    hackTargetSlug: hack?.slug,
    hackTargetName: hack?.name,
  };
}

export type GigReward = {
  bityuan: number;
  ap: number;
  missionCredit: boolean;
};

export function rewardsForGig(gig: IActiveGig): GigReward {
  const R = GIG_REWARDS as Record<string, {
    bityuan?: number;
    ap?: number;
    missionCredit?: boolean;
  }>;
  const base = R[gig.tier] ?? R.mod ?? {
    bityuan: 100,
    ap: 4,
    missionCredit: true,
  };
  let mult = gig.payoutMult ?? 1;
  if (gig.complication) mult *= 1.15;
  const depth = gig.nodesMax ?? 1;
  if (depth >= 4) mult *= 1.1;
  return {
    bityuan: Math.max(
      25,
      Math.floor(Number(base.bityuan ?? 100) * mult),
    ),
    ap: Math.max(1, Math.floor(Number(base.ap ?? 4) * mult)),
    missionCredit: base.missionCredit !== false,
  };
}

export function applyGigComplete(
  c: ISprawlChar,
  gig: IActiveGig,
): { next: ISprawlChar; reward: GigReward } {
  const reward = rewardsForGig(gig);
  let next: ISprawlChar = {
    ...c,
    bityuan: (c.bityuan ?? 0) + reward.bityuan,
  };
  if (reward.ap > 0) next = grantAp(next, reward.ap);
  delete next.activeGig;
  return { next, reward };
}

export function abandonGig(c: ISprawlChar): ISprawlChar {
  const next = { ...c };
  delete next.activeGig;
  return next;
}

export function formatGigCard(gig: IActiveGig): string[] {
  const nodes = gig.nodesMax ?? 1;
  const node = gig.node ?? 1;
  const lines = [
    `  ${gig.title}`,
    `  Tier ${gig.tier.toUpperCase()}` +
    ` · ${gig.objective}` +
    ` · ${gig.venueName}`,
    `  Node ${node}/${nodes}` +
    (gig.roomName ? ` · ${gig.roomName}` : ""),
  ];
  if (gig.blurb) lines.push(`  ${gig.blurb}`);
  if (gig.roomBlurb) lines.push(`  Room: ${gig.roomBlurb}`);
  else if (gig.venueBlurb) lines.push(`  Site: ${gig.venueBlurb}`);
  if (gig.complication) {
    lines.push(`  Complication: ${gig.complication}`);
    if (gig.complicationBlurb) {
      lines.push(`  ${gig.complicationBlurb}`);
    }
  }
  if (gig.objective === "hack-node" && gig.hackDs != null) {
    lines.push(
      `  OBJECTIVE +hack DS${gig.hackDs}` +
      (gig.hackTargetName ? ` · ${gig.hackTargetName}` : "") +
      (gig.primaryHacked ? " · DONE" : ""),
    );
  }
  const onBoss = node >= nodes;
  if (onBoss && gig.objective !== "hack-node") {
    lines.push(`  Boss: ${gig.bossName} (DS${gig.bossDs})`);
  } else if (!onBoss || gig.objective === "hack-node") {
    lines.push(
      `  Hostiles: ${gig.minionCount ?? 2}×` +
      ` ${gig.minionName ?? "goons"}` +
      ` (DS${gig.minionDs ?? 10})`,
    );
  }
  lines.push(`  Systems: +hack cams/locks/cars in room`);
  lines.push(`  Target: ${gig.targetName}`);
  if (gig.targetBlurb) lines.push(`  ${gig.targetBlurb}`);
  const live = (gig.minionObjIds ?? []).length;
  const crewN = (gig.crewIds ?? []).length;
  lines.push(
    `  Status: ${gig.status}` +
    (gig.tokenId ? " · token" : "") +
    (live > 0 ? ` · ${live} minions up` : "") +
    (gig.nodeCleared && !onBoss ? " · node clear" : "") +
    (gig.siteRoomId ? " · on-site" : "") +
    (crewN > 1 ? ` · crew ${crewN}` : ""),
  );
  return lines;
}

/** Drop turn-in token into runner inventory. */
export async function dropGigToken(
  u: IUrsamuSDK,
  c: ISprawlChar,
  gig: IActiveGig,
): Promise<{ token: IDBObj | null; next: ISprawlChar }> {
  if (gig.tokenId) return { token: null, next: c };
  const data: GigTokenData = {
    gigId: gig.id,
    ownerId: u.me.id,
    name: gig.targetName,
    slug: gig.targetSlug,
    blurb: gig.targetBlurb,
    at: Date.now(),
  };
  const token = await u.db.create({
    name: gig.targetName,
    flags: new Set(["thing"]),
    location: u.me.id,
    state: {
      sprawl_gig_token: data,
      description:
        (gig.targetBlurb ?? gig.targetName) +
        ` [gig turn-in · +gig/turnin]`,
      "short-desc": `gig target · +gig/turnin`,
      attributes: [{
        name: "short-desc",
        value: `gig target · +gig/turnin`,
      }],
    },
    contents: [],
  });
  if (!token) return { token: null, next: c };
  return {
    token,
    next: {
      ...c,
      activeGig: {
        ...gig,
        tokenId: token.id,
        status: "token",
      },
    },
  };
}

export async function findGigToken(
  u: IUrsamuSDK,
  ownerId: string,
  gigId: string,
): Promise<IDBObj | null> {
  const found = await u.db.search({ location: ownerId });
  for (const o of found as IDBObj[]) {
    const t = gigTokenData(o);
    if (t?.gigId === gigId && t.ownerId === ownerId) return o;
  }
  return null;
}

export async function destroyGigToken(
  u: IUrsamuSDK,
  tokenId: string | undefined,
): Promise<void> {
  if (!tokenId) return;
  try {
    await u.db.destroy(tokenId);
  } catch {
    /* best-effort */
  }
}

export function isGigBossNpc(
  obj: IDBObj,
  gig: IActiveGig | undefined,
  runnerId: string,
): boolean {
  if (!gig) return false;
  const st = obj.state as Record<string, unknown> | undefined;
  const d = st?.sprawl_npc as Record<string, unknown> | undefined;
  if (!d) return false;
  if (d.gigBoss && d.gigId === gig.id) {
    // Party: any crew member can finish the boss
    const crew = gig.crewIds ?? [];
    const lead = gig.leaderId;
    if (
      d.ownerId &&
      String(d.ownerId) !== runnerId &&
      lead !== runnerId &&
      !crew.includes(runnerId)
    ) {
      return false;
    }
    return true;
  }
  if (gig.bossObjId && obj.id === gig.bossObjId) return true;
  return false;
}

export function isGigMinionNpc(
  obj: IDBObj,
  gig: IActiveGig | undefined,
  runnerId: string,
): boolean {
  if (!gig) return false;
  const st = obj.state as Record<string, unknown> | undefined;
  const d = st?.sprawl_npc as Record<string, unknown> | undefined;
  if (!d?.gigMinion || d.gigId !== gig.id) return false;
  const crew = gig.crewIds ?? [];
  const lead = gig.leaderId;
  if (
    d.ownerId &&
    String(d.ownerId) !== runnerId &&
    lead !== runnerId &&
    !crew.includes(runnerId)
  ) {
    return false;
  }
  return true;
}
