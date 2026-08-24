/**
 * Shared helpers for CPR combat + walker on @ursamu/combat.
 */
import {
  currentActor,
  endFight,
  type Encounter,
} from "@ursamu/combat";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import { rollD10Critical } from "../../engine/dice.ts";
import type { ICombatActor, ICombatState } from
  "../../db/schemas.ts";
import { npcOf } from "./resolve.ts";
import {
  cprEncounterStore,
  initCprCombat,
  kindOfActor,
  makeCprPorts,
} from "./ports.ts";
import { advanceTurnSmart } from "./walker.ts";
import { syncEncounterFromCombat } from "./sync.ts";

export function roomIdOf(u: IUrsamuSDK): string {
  const loc = u.me?.location;
  if (loc) return String(loc);
  // deno-lint-ignore no-explicit-any
  const here = (u as any).here;
  return String(here?.id ?? "");
}

export function portsOf(u: IUrsamuSDK) {
  initCprCombat();
  return makeCprPorts(u);
}

export function roomBroadcast(u: IUrsamuSDK, msg: string): void {
  // deno-lint-ignore no-explicit-any
  const here = (u as any).here;
  if (here && typeof here.broadcast === "function") {
    here.broadcast(msg);
    return;
  }
  if (typeof u.broadcast === "function") {
    u.broadcast(msg);
    return;
  }
  u.send(msg);
}

/** CPR NPCs (flag npc + state.cprNpc) in the room. */
export async function roomNpcs(
  u: IUrsamuSDK,
  roomId: string,
): Promise<IDBObj[]> {
  // deno-lint-ignore no-explicit-any
  const items = await u.db.search({ location: roomId } as any);
  const out: IDBObj[] = [];
  for (const item of items) {
    if (!npcOf(item)) continue;
    out.push(item);
  }
  return out;
}

export function npcInitTotal(actor: IDBObj): number {
  const npc = npcOf(actor);
  const ref = npc?.stats?.ref ?? 5;
  const { total: d10 } = rollD10Critical();
  return ref + d10;
}

/** Add room NPCs missing from the legacy combat queue. */
export async function joinRoomNpcsToCombat(
  u: IUrsamuSDK,
  combat: ICombatState,
): Promise<ICombatState> {
  const roomId = combat.roomId;
  const npcs = await roomNpcs(u, roomId);
  if (!npcs.length) return combat;
  const have = new Set(combat.queue.map((a) => a.actorId));
  let changed = false;
  const queue = [...combat.queue];
  for (const n of npcs) {
    if (have.has(n.id)) continue;
    const name = u.util.displayName(n, u.me).split(";")[0] ||
      n.name ||
      "NPC";
    const actor: ICombatActor = {
      actorId: n.id,
      name,
      initiative: npcInitTotal(n),
      held: false,
      acted: false,
      isNpc: true,
    };
    queue.push(actor);
    changed = true;
    roomBroadcast(
      u,
      `${name} joins combat — initiative ${actor.initiative}.`,
    );
  }
  if (!changed) return combat;
  return { ...combat, queue };
}

/** Run walker while current actor is an NPC. */
export async function walkIfNpc(
  u: IUrsamuSDK,
  enc: Encounter | null,
): Promise<Encounter | null> {
  if (!enc || enc.status !== "active") return enc;
  const first = currentActor(enc);
  if (first?.kind === "npc" && !first.isOut) {
    return (await advanceTurnSmart(enc.id, u)) ?? enc;
  }
  return enc;
}

/**
 * After legacy queue advances: mirror encounter + walk NPCs.
 * Caller must write encounter turn back to legacy combat.
 */
export async function syncAndWalk(
  u: IUrsamuSDK,
  combat: ICombatState,
): Promise<Encounter | null> {
  initCprCombat();
  const enc = await syncEncounterFromCombat(combat);
  return await walkIfNpc(u, enc);
}

export async function endEncounterFight(
  u: IUrsamuSDK,
  roomId: string,
): Promise<void> {
  initCprCombat();
  const enc = await cprEncounterStore.findInRoom?.(roomId) ?? null;
  if (!enc || enc.status === "resolved") return;
  await endFight(enc.id, {
    store: cprEncounterStore,
    ports: portsOf(u),
  });
}

export { kindOfActor, currentActor };
