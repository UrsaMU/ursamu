/**
 * Hackable room systems on gig sites (cams, cars, locks…).
 * Optional loot on any gig; required primary on hack-node finals.
 */
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import type { IActiveGig, ISprawlChar } from "../db/schemas.ts";
import {
  GIG_SYSTEMS,
  pickByRoll,
  rollD66,
  type Row,
} from "./catalog.ts";
import { grantAp } from "./advance-rules.ts";
import { dropGigToken } from "./gigs.ts";
import { isBossNode } from "./gig-run.ts";

export type GigSystemData = {
  gigId: string;
  ownerId: string;
  slug: string;
  name: string;
  ds: number;
  bityuan: number;
  ap: number;
  blurb?: string;
  /** Primary objective for hack-node gigs. */
  primary?: boolean;
  hacked?: boolean;
  at: number;
};

export function isGigSystem(
  obj: IDBObj | null | undefined,
): boolean {
  return !!gigSystemData(obj);
}

export function gigSystemData(
  obj: IDBObj | null | undefined,
): GigSystemData | null {
  if (!obj) return null;
  const raw = (obj.state as Record<string, unknown> | undefined)
    ?.sprawl_gig_system as GigSystemData | undefined;
  if (!raw || typeof raw !== "object") return null;
  if (!raw.gigId || typeof raw.ds !== "number") return null;
  return raw;
}

function pickSystem(rng?: () => number): Row {
  return pickByRoll(GIG_SYSTEMS, rollD66(rng)) ??
    GIG_SYSTEMS[0];
}

function rowToData(
  row: Row,
  gig: IActiveGig,
  ownerId: string,
  primary = false,
): GigSystemData {
  return {
    gigId: gig.id,
    ownerId,
    slug: String(row.slug),
    name: String(row.name ?? row.slug),
    ds: Math.max(6, Number(row.ds ?? 10)),
    bityuan: Math.max(0, Number(row.bityuan ?? 25)),
    ap: Math.max(0, Number(row.ap ?? 1)),
    blurb: row.blurb ? String(row.blurb) : undefined,
    primary,
    hacked: false,
    at: Date.now(),
  };
}

async function createSystemThing(
  u: IUrsamuSDK,
  roomId: string,
  data: GigSystemData,
): Promise<IDBObj | null> {
  const label = data.primary
    ? `${data.name} [OBJECTIVE]`
    : data.name;
  const longDesc = [
    `${data.name} — a live node on the site net.`,
    data.blurb ? String(data.blurb) : "",
    `Hack difficulty DS${data.ds}.` +
    (data.primary
      ? " This is the PRIMARY objective system."
      : " Side system — crack for extra b¥/AP."),
    data.hacked
      ? "Already compromised."
      : `+hack ${data.slug}  or  +hack ${data.ds}`,
    data.bityuan || data.ap
      ? `Payout ~${data.bityuan} b¥ / ${data.ap} AP.`
      : "",
  ].filter(Boolean).join(" ");
  const obj = await u.db.create({
    name: label,
    flags: new Set(["thing"]),
    location: roomId,
    state: {
      sprawl_gig_system: data,
      description: longDesc,
      "short-desc": data.hacked
        ? `hacked · DS${data.ds}`
        : `hack DS${data.ds}` +
          (data.primary ? " · OBJECTIVE" : ""),
      attributes: [{
        name: "short-desc",
        value: data.hacked
          ? `hacked · DS${data.ds}`
          : `hack DS${data.ds}` +
            (data.primary ? " · OBJECTIVE" : ""),
      }],
    },
    contents: [],
  });
  return obj ?? null;
}

/** How many side systems to sprinkle (not counting primary). */
function sideSystemCount(gig: IActiveGig): number {
  const t = gig.tier;
  if (t === "easy") return 1;
  if (t === "legend") return 3;
  if (t === "hard") return 2;
  return 1 + (Math.random() < 0.5 ? 1 : 0);
}

/**
 * Spawn hackable systems for current node into site room.
 * Final hack-node: always includes primary objective system.
 */
export async function spawnGigSystems(
  u: IUrsamuSDK,
  c: ISprawlChar,
  gig: IActiveGig,
  rng?: () => number,
): Promise<{ next: ISprawlChar; msgs: string[] }> {
  const roomId = gig.siteRoomId ?? u.here?.id ?? u.me.location;
  if (!roomId) {
    return { next: c, msgs: ["No room for systems."] };
  }
  // Already populated this node
  if ((gig.systemObjIds ?? []).length > 0) {
    return { next: c, msgs: [] };
  }

  const msgs: string[] = [];
  const ids: string[] = [];
  let primaryId: string | undefined = gig.primarySystemId;
  const ownerId = u.me.id;

  // Primary objective system on final hack-node
  if (
    isBossNode(gig) &&
    gig.objective === "hack-node" &&
    !gig.primaryHacked
  ) {
    const primaryRow: Row = {
      slug: gig.hackTargetSlug ?? "node-core",
      name: gig.hackTargetName ?? "Target node",
      ds: gig.hackDs ?? 12,
      bityuan: 80 + (gig.hackDs ?? 12) * 5,
      ap: 4 + Math.floor((gig.hackDs ?? 12) / 4),
      blurb: "Primary contract node — crack this.",
    };
    const data = rowToData(primaryRow, gig, ownerId, true);
    const obj = await createSystemThing(u, roomId, data);
    if (obj) {
      ids.push(obj.id);
      primaryId = obj.id;
      msgs.push(
        `Objective system: ${data.name} (DS${data.ds})`,
      );
    }
  }

  const n = sideSystemCount(gig);
  for (let i = 0; i < n; i++) {
    const row = pickSystem(rng);
    const data = rowToData(row, gig, ownerId, false);
    const obj = await createSystemThing(u, roomId, data);
    if (obj) {
      ids.push(obj.id);
      msgs.push(
        `${data.name} (hack DS${data.ds})`,
      );
    }
  }

  const nextGig: IActiveGig = {
    ...gig,
    systemObjIds: ids,
    primarySystemId: primaryId ?? gig.primarySystemId,
  };
  return {
    next: { ...c, activeGig: nextGig },
    msgs,
  };
}

/** Resolve system in room by #id, slug, name, or DS number. */
export async function resolveGigSystem(
  u: IUrsamuSDK,
  gig: IActiveGig,
  ref: string,
): Promise<IDBObj | null> {
  const roomId = gig.siteRoomId ?? u.here?.id ?? u.me.location;
  if (!roomId) return null;
  const found = await u.db.search({ location: roomId });
  const systems = (found as IDBObj[]).filter(isGigSystem);
  if (!systems.length) return null;
  const raw = ref.trim();
  if (!raw) {
    // Prefer unhacked primary, else first unhacked
    const primary = systems.find((o) => {
      const d = gigSystemData(o);
      return d?.primary && !d.hacked;
    });
    if (primary) return primary;
    return systems.find((o) => !gigSystemData(o)?.hacked) ??
      null;
  }
  if (/^#?\d+$/.test(raw)) {
    const id = raw.replace(/^#/, "");
    return systems.find((o) => o.id === id) ?? null;
  }
  const lc = raw.toLowerCase();
  const asDs = Number(raw);
  if (Number.isFinite(asDs) && String(asDs) === raw) {
    const byDs = systems.filter((o) =>
      gigSystemData(o)?.ds === asDs &&
      !gigSystemData(o)?.hacked
    );
    if (byDs.length === 1) return byDs[0];
    const prim = byDs.find((o) => gigSystemData(o)?.primary);
    if (prim) return prim;
  }
  const hit = systems.find((o) => {
    const d = gigSystemData(o);
    if (!d || d.hacked) return false;
    return d.slug === lc ||
      d.name.toLowerCase() === lc ||
      d.name.toLowerCase().includes(lc) ||
      d.slug.includes(lc) ||
      String(o.name).toLowerCase().includes(lc);
  });
  return hit ?? null;
}

export type SystemHackResult = {
  next: ISprawlChar;
  notes: string[];
  /** Primary objective completed. */
  objectiveDone: boolean;
};

/** Apply successful hack to a gig system prop. */
export async function applyGigSystemHack(
  u: IUrsamuSDK,
  c: ISprawlChar,
  systemObj: IDBObj,
): Promise<SystemHackResult> {
  const gig = c.activeGig;
  const data = gigSystemData(systemObj);
  const notes: string[] = [];
  if (!gig || !data) {
    return { next: c, notes: [], objectiveDone: false };
  }
  if (data.gigId !== gig.id) {
    return { next: c, notes: [], objectiveDone: false };
  }
  // Crew may hack systems owned by the leader
  const crew = gig.crewIds ?? [];
  if (
    data.ownerId &&
    data.ownerId !== u.me.id &&
    gig.leaderId !== u.me.id &&
    !crew.includes(u.me.id)
  ) {
    return { next: c, notes: [], objectiveDone: false };
  }
  if (data.hacked) {
    return {
      next: c,
      notes: [`${data.name} already cracked.`],
      objectiveDone: false,
    };
  }

  const nextData: GigSystemData = {
    ...data,
    hacked: true,
    at: Date.now(),
  };
  await u.db.modify(systemObj.id, "$set", {
    "data.sprawl_gig_system": nextData,
    "data.name": `${data.name} [HACKED]`,
    "data.description":
      `${data.name} — cracked. Dead LEDs.`,
    "data.short-desc": "hacked",
  });
  systemObj.state = {
    ...systemObj.state,
    sprawl_gig_system: nextData,
  };

  let next: ISprawlChar = {
    ...c,
    bityuan: (c.bityuan ?? 0) + data.bityuan,
  };
  if (data.ap > 0) next = grantAp(next, data.ap);
  notes.push(
    `CRACKED ${data.name} · +${data.bityuan} b¥` +
      ` · +${data.ap} AP`,
  );

  let objectiveDone = false;
  let nextGig: IActiveGig = {
    ...(next.activeGig ?? gig),
    primaryHacked: data.primary
      ? true
      : (next.activeGig ?? gig).primaryHacked,
  };

  // Primary hack-node objective → token
  if (
    data.primary &&
    gig.objective === "hack-node" &&
    isBossNode(gig)
  ) {
    const dropped = await dropGigToken(u, {
      ...next,
      activeGig: nextGig,
    }, nextGig);
    next = dropped.next;
    nextGig = next.activeGig ?? nextGig;
    if (dropped.token) {
      notes.push(
        `OBJECTIVE complete — ${nextGig.targetName}` +
          ` (+gig/turnin)`,
      );
      objectiveDone = true;
      nextGig = {
        ...nextGig,
        nodeCleared: true,
        primaryHacked: true,
      };
    }
  }

  next = { ...next, activeGig: nextGig };
  return { next, notes, objectiveDone };
}

/**
 * After a successful +hack roll: try room system or
 * primary objective DS.
 */
export async function tryGigHackAfterRoll(
  u: IUrsamuSDK,
  c: ISprawlChar,
  dsUsed: number,
  targetRef: string,
): Promise<{ next: ISprawlChar; notes: string[] }> {
  const gig = c.activeGig;
  if (!gig) return { next: c, notes: [] };

  // Explicit or ambient system in room
  const sys = await resolveGigSystem(
    u,
    gig,
    targetRef || String(dsUsed),
  );
  if (sys && !gigSystemData(sys)?.hacked) {
    const d = gigSystemData(sys)!;
    // Must meet system DS
    if (dsUsed < d.ds) {
      return {
        next: c,
        notes: [
          `${d.name} needs DS${d.ds}+ ` +
            `(you rolled vs ${dsUsed}).`,
        ],
      };
    }
    const r = await applyGigSystemHack(u, c, sys);
    return { next: r.next, notes: r.notes };
  }

  // Legacy: bare DS match primary hack-node without prop
  if (
    gig.objective === "hack-node" &&
    isBossNode(gig) &&
    !gig.tokenId &&
    dsUsed >= (gig.hackDs ?? 12)
  ) {
    // Prefer requiring the prop if it exists
    if (gig.primarySystemId) {
      const found = await u.db.search({
        id: gig.primarySystemId,
      });
      const obj = (found as IDBObj[])[0];
      if (obj && isGigSystem(obj)) {
        const r = await applyGigSystemHack(u, c, obj);
        return { next: r.next, notes: r.notes };
      }
    }
    const dropped = await dropGigToken(u, c, gig);
    if (dropped.token) {
      return {
        next: {
          ...dropped.next,
          activeGig: {
            ...dropped.next.activeGig!,
            primaryHacked: true,
            nodeCleared: true,
          },
        },
        notes: [
          `GIG TARGET ${gig.targetName} cracked` +
            ` (+gig/turnin)`,
        ],
      };
    }
  }

  return { next: c, notes: [] };
}
