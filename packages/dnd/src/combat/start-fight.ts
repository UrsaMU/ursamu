/**
 * Shared combat start + hostile-room helpers for delves.
 */
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import {
  announceTurn,
  beginOnly,
  endRoomFight,
  ensureEncounter,
  formatStartBanner,
  joinActor,
  roomCombatants,
  roomEncounter,
  roomIdOf,
  walkIfNpc,
} from "./session.ts";
import { sheetOf, isIncapacitated } from "./resolve.ts";

function flagHas(o: IDBObj, name: string): boolean {
  const f = o.flags as unknown;
  if (f instanceof Set) return f.has(name);
  if (Array.isArray(f)) {
    return f.map(String).includes(name);
  }
  return String(f ?? "").toLowerCase().includes(name);
}

/** Hostile = NPC sheet, not a hireling, still up. */
export function isHostileMob(o: IDBObj): boolean {
  // deno-lint-ignore no-explicit-any
  const dnd = (o.state as any)?.dnd;
  if (!dnd?.abilities) return false;
  if (dnd.hireling || dnd.companion) return false;
  if (flagHas(o, "player")) return false;
  const sheet = sheetOf(o);
  if (isIncapacitated(sheet) || sheet.hp.current <= 0) {
    return false;
  }
  // Monsters / hireable templates in combat
  if (dnd.class === "Monster" || dnd.class === "Hireling") {
    return dnd.class === "Monster";
  }
  return flagHas(o, "npc") || flagHas(o, "thing");
}

export async function listHostiles(
  u: IUrsamuSDK,
  roomId: string,
): Promise<IDBObj[]> {
  // deno-lint-ignore no-explicit-any
  const items = await u.db.search({ location: roomId } as any);
  return items.filter(isHostileMob);
}

export type StartFightResult = {
  ok: boolean;
  message?: string;
  hostileCount: number;
};

/**
 * Start (or restart) room combat: all D&D sheets join, begin, walk NPCs.
 * Pass roomId after teleport — u.here may still be the old room.
 */
export async function startRoomFight(
  u: IUrsamuSDK,
  opts: { quietBanner?: boolean; roomId?: string } = {},
): Promise<StartFightResult> {
  const roomId = opts.roomId || roomIdOf(u);
  if (!roomId) {
    return { ok: false, message: "Not in a room.", hostileCount: 0 };
  }
  // Keep SDK in sync so walkers / broadcast use the fight room.
  if (u.me) u.me.location = roomId;
  const combatants = await roomCombatants(u, roomId);
  const hostiles = combatants.filter(isHostileMob);
  if (combatants.length === 0) {
    return {
      ok: false,
      message: "No eligible combatants with D&D sheets here.",
      hostileCount: 0,
    };
  }
  if (hostiles.length === 0) {
    return {
      ok: false,
      message: "No hostiles here — nothing to fight.",
      hostileCount: 0,
    };
  }

  const existing = await roomEncounter(roomId);
  if (existing && existing.status !== "resolved") {
    await endRoomFight(u, existing, { quiet: true });
  }

  let enc = await ensureEncounter(u, roomId);
  for (const c of combatants) {
    enc = (await joinActor(enc.id, c, u)) ?? enc;
  }
  enc = (await beginOnly(u, enc.id)) ?? enc;
  if (!enc) {
    return {
      ok: false,
      message: "Failed to start combat.",
      hostileCount: hostiles.length,
    };
  }
  if (!opts.quietBanner) {
    u.send(formatStartBanner(enc));
  }
  enc = await walkIfNpc(u, enc);
  if (enc.status === "active") announceTurn(u, enc);
  return { ok: true, hostileCount: hostiles.length };
}

/** One-line tip when hostiles are present and no fight active. */
export async function hostileRoomTip(
  u: IUrsamuSDK,
): Promise<string | null> {
  const roomId = roomIdOf(u);
  if (!roomId) return null;
  const hostiles = await listHostiles(u, roomId);
  if (!hostiles.length) return null;
  const enc = await roomEncounter(roomId);
  if (enc && enc.status === "active") return null;
  const names = hostiles
    .slice(0, 4)
    .map((h) => (h.name ?? "?").split(";")[0])
    .join(", ");
  const more = hostiles.length > 4
    ? ` +${hostiles.length - 4}`
    : "";
  return (
    `%ch%cr${hostiles.length} foe(s)%cn here: ` +
    `${names}${more}. Try %ch+combat/start%cn to fight ` +
    `(or they engage when combat begins).`
  );
}
