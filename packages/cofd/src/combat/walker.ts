// Pass 2 AI-aware turn walker.
//
// advanceTurnSmart pumps the encounter forward, autonomously executing the
// AI archetype of every NPC slot until either (a) a non-out PC's turn
// arrives, (b) all NPCs are isOut (scene resolution), or (c) maxRounds
// safety cap fires.
//
// The walker constructs a synthetic IUrsamuSDK whose `me` is the NPC's
// IDBObj and whose `send` routes to the room broadcast -- so existing
// command bodies (executeAttack, gearReload) run unchanged when invoked
// with an NPC actor.

import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import {
  advanceTurn,
  encounterDb,
  getEncounterForRoom,
} from "./encounter.ts";
import type { Encounter } from "./types.ts";
import { getArchetype } from "./ai/index.ts";
import { executeAttack } from "../commands/attack.ts";
import { gearReload } from "../commands/gear.ts";
import type { CofdSheet } from "../stats/index.ts";
import {
  allNpcsDown,
  patchParticipant,
  resolveScene,
  syncIsOut,
} from "./resolution.ts";

// deno-lint-ignore no-explicit-any
type Q = any;

const DEFAULT_MAX_ROUNDS = 50;

/** Find the NPC's IDBObj by id via u.db.search. Returns null if missing. */
async function loadActor(u: IUrsamuSDK, id: string): Promise<IDBObj | null> {
  // deno-lint-ignore no-explicit-any
  const found = await u.db.search({ id } as any);
  return found[0] ?? null;
}

/**
 * Build a thin SDK proxy where `me` = the NPC actor, `send` posts to the
 * room broadcast, and everything else (db, util, canEdit, here) inherits
 * from the caller's SDK. The proxy must be flat -- existing code mutates
 * `cmd.args` via `(u as any).cmd = ...`.
 */
function makeNpcSdk(real: IUrsamuSDK, npc: IDBObj): IUrsamuSDK {
  // deno-lint-ignore no-explicit-any
  const here = (real as any).here;
  // Use prototype copy to keep methods intact while overriding fields.
  // deno-lint-ignore no-explicit-any
  const proxy: any = Object.assign({}, real);
  proxy.me = npc;
  // send -> route to broadcast so all participants see the NPC's actions.
  proxy.send = (msg: string, _socketId?: string) => {
    if (here && typeof here.broadcast === "function") {
      here.broadcast(msg);
    }
  };
  // broadcast still works.
  proxy.broadcast = (msg: string) => {
    if (here && typeof here.broadcast === "function") {
      here.broadcast(msg);
    }
  };
  // canEdit: NPC can edit any target (Storyteller-controlled).
  proxy.canEdit = () => Promise.resolve(true);
  // cmd: minimal stub; executeAttack overrides it.
  proxy.cmd = { name: "", original: "", args: ["", ""], switches: [] };
  return proxy as IUrsamuSDK;
}


/**
 * AI-aware turn walker. Pumps the encounter until the next live PC turn,
 * or until all NPCs are out, or maxRounds is reached.
 *
 * Returns the final encounter state (or null if not found).
 */
export async function advanceTurnSmart(
  encounterId: string,
  u: IUrsamuSDK,
): Promise<Encounter | null> {
  let enc = await encounterDb.findOne({ id: encounterId } as Q);
  if (!enc || enc.status !== "active") return enc ?? null;

  const maxRounds = enc.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const safetyMax = Math.max(1, maxRounds * Math.max(1, enc.participants.length));
  let walked = 0;

  while (walked < safetyMax) {
    enc = await encounterDb.findOne({ id: encounterId } as Q);
    if (!enc || enc.status !== "active") return enc ?? null;

    const slot = enc.participants[enc.turnIdx];
    if (!slot) break;

    // Resolved? halt.
    if (allNpcsDown(enc)) {
      return await resolveScene(u, enc.id);
    }

    // Reached a live PC -- halt for player input.
    if (slot.kind !== "npc") {
      if (!slot.isOut) return enc;
      // Skip downed PC.
      await advanceTurn(enc.id, u);
      walked += 1;
      continue;
    }

    // Skip downed NPC.
    if (slot.isOut) {
      await advanceTurn(enc.id, u);
      walked += 1;
      continue;
    }

    // Load the NPC actor and its AI archetype.
    const npc = await loadActor(u, slot.actorId);
    if (!npc) {
      await advanceTurn(enc.id, u);
      walked += 1;
      continue;
    }
    const sheet = npc.state?.cofd as
      | (CofdSheet & { npc?: { aiArchetype?: string } })
      | undefined;
    const archetypeKey = sheet?.npc?.aiArchetype ?? "beshilu-swarmer";
    const archetype = getArchetype(archetypeKey);
    if (!archetype) {
      // Unknown archetype -- just wait.
      await advanceTurn(enc.id, u);
      walked += 1;
      continue;
    }

    const others = enc.participants.filter((p) => p.actorId !== slot.actorId);
    const decision = archetype({ self: slot, enc, selfActor: npc, others });
    const npcSdk = makeNpcSdk(u, npc);

    // deno-lint-ignore no-explicit-any
    const here = (u as any).here;
    const bc = (msg: string) => {
      if (here && typeof here.broadcast === "function") here.broadcast(msg);
    };

    try {
      switch (decision.action) {
        case "attack": {
          if (decision.targetId) {
            // Find target's name for the +attack string.
            const tgt = enc.participants.find((p) => p.actorId === decision.targetId);
            if (tgt) {
              await executeAttack(npcSdk, tgt.name);
            }
          }
          break;
        }
        case "reload": {
          try { await gearReload(npcSdk, ""); } catch { /* swallow */ }
          break;
        }
        case "move": {
          await patchParticipant(enc.id, slot.actorId, { movedThisRound: true });
          bc(`${slot.name} moves.`);
          break;
        }
        case "flee": {
          const aiState = { ...(slot.aiState ?? {}), fled: true };
          await patchParticipant(enc.id, slot.actorId, { isOut: true, aiState });
          bc(`${slot.name} flees.`);
          break;
        }
        case "posture": {
          await patchParticipant(enc.id, slot.actorId, {
            reactionPosture: decision.posture,
          });
          bc(`${slot.name} takes a defensive posture.`);
          break;
        }
        case "wait":
        default:
          bc(`${slot.name} waits.`);
          break;
      }
    } catch (_err) {
      // Any failure -- log via broadcast, do not abort the walker.
      bc(`${slot.name} hesitates.`);
    }

    // Sync isOut after a possible attack (NPC may have killed someone).
    for (const p of enc.participants) {
      await syncIsOut(u, enc.id, p.actorId);
    }

    // Check scene resolution before advancing.
    const fresh = await encounterDb.findOne({ id: encounterId } as Q);
    if (fresh && allNpcsDown(fresh)) {
      return await resolveScene(u, fresh.id);
    }

    await advanceTurn(enc.id, u);
    walked += 1;
  }

  // Safety cap hit.
  // deno-lint-ignore no-explicit-any
  const here2 = (u as any).here;
  if (here2 && typeof here2.broadcast === "function") {
    here2.broadcast(
      `%cyCOMBAT>>%cn Safety cap (${maxRounds} rounds) reached; halting auto-resolve.`,
    );
  }
  return (await encounterDb.findOne({ id: encounterId } as Q)) ?? null;
}

/** Convenience: smart-advance the active encounter in u.here. */
export async function smartNext(u: IUrsamuSDK): Promise<Encounter | null> {
  // deno-lint-ignore no-explicit-any
  const here = (u as any).here;
  const roomId = here?.id;
  if (!roomId) return null;
  const enc = await getEncounterForRoom(roomId);
  if (!enc) return null;
  return await advanceTurnSmart(enc.id, u);
}
