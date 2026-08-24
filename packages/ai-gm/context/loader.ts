import { DBO, dbojs } from "@ursamu/mush";
import type { IGMMemory, IGMReveal } from "../schema.ts";
import { gmMemory, gmReveals } from "../db.ts";
import { jobs } from "@ursamu/jobs";
import type { IJob } from "@ursamu/jobs";

// ─── Minimal interfaces ────────────────────────────────────────────────────────
// Defined here so ai-gm has no hard dependency on specific game plugins.
// Any UrsaMU game with compatible collections will work.

export interface ICharSheet {
  id: string;
  playerId: string;
  name: string;
  playbook?: string;
  status?: string;
  /** SR4: approval state stored here instead of status */
  chargenState?: string;
  /** Generic game systems store stats here */
  data?: Record<string, unknown>;
  /** SR4: stores named attributes (Body, Agility, etc.) */
  attrs?: Record<string, number>;
  [key: string]: unknown;
}

export interface INPC {
  id: string;
  name: string;
  description?: string;
  faction?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface IOrg {
  id: string;
  name: string;
  circle?: string;
  description?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface IFront {
  id: string;
  name: string;
  status: string;
  description?: string;
  clocks?: unknown[];
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface IScene {
  id: string;
  roomId?: string;
  title?: string;
  description?: string;
  status?: string;
  participants?: string[];
  poses?: unknown[];
  [key: string]: unknown;
}

export interface IDowntimeAction {
  id: string;
  playerId: string;
  action: string;
  resolved: boolean;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

// ─── DBO references (collection names match urban-shadows defaults) ───────────
// Character sheets collection is configurable via charCollection parameter.
// Other collections remain at urban-shadows defaults.

const npcs = new DBO<INPC>("server.npcs");
const orgs = new DBO<IOrg>("server.orgs");
const fronts = new DBO<IFront>("server.fronts");
const scenes = new DBO<IScene>("server.scenes");
const downtimeActions = new DBO<IDowntimeAction>("server.downtime");

// ─── Full game state snapshot ─────────────────────────────────────────────────

export interface ISessionSnapshot {
  characters: ICharSheet[];
  npcs: INPC[];
  orgs: IOrg[];
  fronts: IFront[];
  memories: IGMMemory[];
  reveals: IGMReveal[];
  openJobs: IJob[];
  openDowntime: IDowntimeAction[];
  loadedAt: number;
}

/** Normalize dbref-ish ids: "#2" and "2" compare equal. */
export function bareId(id: unknown): string {
  return String(id ?? "").replace(/^#/, "").trim();
}

export function idsEqual(a: unknown, b: unknown): boolean {
  const x = bareId(a);
  const y = bareId(b);
  return !!x && !!y && x === y;
}

function flagsText(flags: unknown): string {
  if (flags instanceof Set) return [...flags].join(" ");
  if (Array.isArray(flags)) return flags.join(" ");
  return String(flags ?? "");
}

function cprFromPlayer(raw: Record<string, unknown>): Record<
  string,
  unknown
> | null {
  const data = raw.data as Record<string, unknown> | undefined;
  const state = raw.state as Record<string, unknown> | undefined;
  const cpr = (data?.cpr ?? state?.cpr) as
    | Record<string, unknown>
    | undefined;
  if (!cpr || typeof cpr !== "object") return null;
  return cpr;
}

function sheetFromCprPlayer(
  raw: Record<string, unknown>,
  cpr: Record<string, unknown>,
): ICharSheet {
  const pid = bareId(raw.id);
  const name = String(
    (raw.data as { name?: string } | undefined)?.name ??
      raw.name ??
      cpr.name ??
      pid,
  );
  return {
    id: `cpr-${pid}`,
    playerId: pid,
    name,
    playbook: String(cpr.role ?? "edgerunner"),
    status: "approved",
    system: "cyberpunk-red",
    data: {
      role: cpr.role,
      roleRank: cpr.roleRank,
      stats: cpr.stats,
      skills: cpr.skills,
      hp: cpr.hp,
      woundState: cpr.woundState,
      eurodollars: cpr.eurodollars,
      lifestyle: cpr.lifestyle,
      humanityLoss: cpr.humanityLoss,
      cyberware: Array.isArray(cpr.cyberware)
        ? cpr.cyberware.map((x: unknown) => {
          if (typeof x === "string") return x;
          if (x && typeof x === "object" &&
            "name" in (x as object)) {
            return String((x as { name?: string }).name ?? "?");
          }
          return "?";
        })
        : [],
      armorBody: cpr.armorBody,
      armorHead: cpr.armorHead,
      gear: cpr.gear,
      reputation: cpr.reputation,
    },
  };
}

/** CPR sheets live on player objects (data.cpr), not a sheet DBO. */
export async function loadCprPlayerSheets(): Promise<ICharSheet[]> {
  // Don't rely on flag-regex queries (Set vs string storage varies).
  const all = await dbojs.all();
  const out: ICharSheet[] = [];
  for (const p of all) {
    // deno-lint-ignore no-explicit-any
    const raw = p as any as Record<string, unknown>;
    const fl = flagsText(raw.flags);
    if (!/\bplayer\b/i.test(fl)) continue;
    const cpr = cprFromPlayer(raw);
    if (!cpr) continue;
    out.push(sheetFromCprPlayer(raw, cpr));
  }
  return out;
}

/** Load one CPR sheet by player id (for room injection fallback). */
export async function loadCprSheetForPlayer(
  playerId: string,
): Promise<ICharSheet | null> {
  const want = bareId(playerId);
  if (!want) return null;
  let row = await dbojs.queryOne({ id: want });
  if (!row) row = await dbojs.queryOne({ id: `#${want}` });
  if (!row) {
    const all = await dbojs.all();
    row = all.find((p) => idsEqual(p.id, want));
  }
  if (!row) return null;
  const cpr = cprFromPlayer(row as unknown as Record<string, unknown>);
  if (!cpr) return null;
  return sheetFromCprPlayer(
    row as unknown as Record<string, unknown>,
    cpr,
  );
}

export async function loadSessionSnapshot(
  charCollection = "server.playbooks",
): Promise<ISessionSnapshot> {
  const loadChars = charCollection === "cpr.players" ||
      charCollection === "cyberpunk-red"
    ? loadCprPlayerSheets()
    : (new DBO<ICharSheet>(charCollection).all() as Promise<
      ICharSheet[]
    >);

  const [
    allChars,
    allNpcs,
    allOrgs,
    allFronts,
    allMemories,
    allReveals,
    allJobs,
    allDowntime,
  ] = await Promise.all([
    loadChars,
    npcs.all() as Promise<INPC[]>,
    orgs.all() as Promise<IOrg[]>,
    fronts.all() as Promise<IFront[]>,
    gmMemory.all() as Promise<IGMMemory[]>,
    gmReveals.all() as Promise<IGMReveal[]>,
    jobs.all() as Promise<IJob[]>,
    downtimeActions.all() as Promise<IDowntimeAction[]>,
  ]);

  return {
    characters: allChars.filter((c) =>
      c.status === "approved" ||
      c.chargenState === "approved" ||
      c.system === "cyberpunk-red" ||
      c.system === "utopia"
    ),
    npcs: allNpcs,
    orgs: allOrgs,
    fronts: allFronts.filter((f) => f.status === "active"),
    memories: allMemories,
    reveals: allReveals.filter((r) => !r.fired),
    openJobs: allJobs.filter((j) =>
      j.status === "new" || j.status === "open"
    ),
    openDowntime: allDowntime.filter((a) => !a.resolved),
    loadedAt: Date.now(),
  };
}

// ─── Room-level context ───────────────────────────────────────────────────────

export interface IRoomContext {
  scene: IScene | null;
  playersInRoom: ICharSheet[];
  recentExchangeTexts: string[];
}

async function loadRoomObject(roomId: string): Promise<{
  id: string;
  name: string;
  desc: string;
} | null> {
  const want = bareId(roomId);
  let row = await dbojs.queryOne({ id: want });
  if (!row) row = await dbojs.queryOne({ id: `#${want}` });
  if (!row) {
    const all = await dbojs.all();
    row = all.find((o) => idsEqual(o.id, want));
  }
  if (!row) return null;
  // deno-lint-ignore no-explicit-any
  const raw = row as any;
  const name = String(raw?.data?.name ?? raw?.name ?? `Room ${want}`);
  const desc = String(
    raw?.data?.desc ??
      raw?.data?.description ??
      raw?.description ??
      "",
  ).trim();
  return { id: bareId(raw.id), name, desc };
}

export async function loadRoomContext(
  roomId: string,
  snapshot: ISessionSnapshot,
  playerIds: string[],
  recentExchangeTexts: string[],
): Promise<IRoomContext> {
  const wantRoom = bareId(roomId);
  let scene =
    await (scenes.queryOne({ id: roomId }) as Promise<IScene | null>);
  if (!scene) {
    scene = await (scenes.queryOne({ id: wantRoom }) as Promise<
      IScene | null
    >);
  }

  // Match players with # stripped (contrib ids vs sheet playerIds)
  let playersInRoom = snapshot.characters.filter((c) =>
    playerIds.some((pid) => idsEqual(pid, c.playerId))
  );

  // CPR fallback: pull sheets directly if snapshot missed them
  if (playersInRoom.length < playerIds.length) {
    const have = new Set(playersInRoom.map((c) => bareId(c.playerId)));
    for (const pid of playerIds) {
      if (have.has(bareId(pid))) continue;
      const sheet = await loadCprSheetForPlayer(pid);
      if (sheet) {
        playersInRoom = [...playersInRoom, sheet];
        have.add(bareId(pid));
      }
    }
  }

  // No formal scene record — synthesize from room object
  if (!scene) {
    const room = await loadRoomObject(roomId);
    if (room) {
      scene = {
        id: room.id,
        roomId: room.id,
        title: room.name,
        description: room.desc ||
          `${room.name}. A street in Night City — ` +
            `neon, rain-slick asphalt, distant sirens. ` +
            `The Time of the Red.`,
        status: "active",
      };
    } else {
      scene = {
        id: wantRoom,
        roomId: wantRoom,
        title: `Room ${wantRoom}`,
        description:
          `Night City street (room ${wantRoom}). Neon haze, ` +
          `wet pavement, traffic growl. Time of the Red, 2045. ` +
          `Fill in detail from the fiction as players act.`,
        status: "active",
      };
    }
  }

  return { scene, playersInRoom, recentExchangeTexts };
}

// ─── Wiki lore loader (hits wiki HTTP API) ────────────────────────────────────

export interface ILorePage {
  path: string;
  title: string;
  body?: string;
}

export async function loadLorePages(
  baseUrl = "http://localhost:4201",
): Promise<ILorePage[]> {
  try {
    const res = await fetch(`${baseUrl}/api/v1/wiki/lore`);
    if (!res.ok) return [];
    const data = await res.json() as {
      type?: string;
      children?: ILorePage[];
      path?: string;
      title?: string;
    };
    if (data.type === "directory" && Array.isArray(data.children)) {
      return data.children.filter((c: ILorePage) => c.path && c.title);
    }
    return [];
  } catch {
    return [];
  }
}
