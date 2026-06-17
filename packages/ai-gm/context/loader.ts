import { DBO } from "ursamu";
import type { IGMMemory, IGMReveal } from "../schema.ts";
import { gmMemory, gmReveals } from "../db.ts";
import { jobs } from "ursamu/jobs";
import type { IJob } from "ursamu/jobs";

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

export async function loadSessionSnapshot(
  charCollection = "server.playbooks",
): Promise<ISessionSnapshot> {
  const sheets = new DBO<ICharSheet>(charCollection);
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
    sheets.all() as Promise<ICharSheet[]>,
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
      c.status === "approved" || c.chargenState === "approved"
    ),
    npcs: allNpcs,
    orgs: allOrgs,
    fronts: allFronts.filter((f) => f.status === "active"),
    memories: allMemories,
    reveals: allReveals.filter((r) => !r.fired),
    openJobs: allJobs.filter((j) => j.status === "new" || j.status === "open"),
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

export async function loadRoomContext(
  roomId: string,
  snapshot: ISessionSnapshot,
  playerIds: string[],
  recentExchangeTexts: string[],
): Promise<IRoomContext> {
  const scene =
    await (scenes.queryOne({ id: roomId }) as Promise<IScene | null>);
  const playersInRoom = snapshot.characters.filter((c) =>
    playerIds.includes(c.playerId)
  );
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
