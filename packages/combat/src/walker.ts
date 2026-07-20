/**
 * Ports-based turn walker.
 *
 * Pumps the encounter forward, running brains for each NPC until a
 * live PC turn, all NPCs out, manual AI, or maxRounds safety cap.
 */
import { allNpcsDown } from "./encounter.ts";
import type { Encounter, Participant } from "./types.ts";
import {
  decideAction,
  isManualAiKey,
  type BrainCtx,
} from "./brains.ts";
import {
  requireCombatPorts,
  type CombatAction,
  type CombatActorView,
  type CombatPorts,
} from "./ports.ts";
import {
  getEncounterStore,
  type EncounterStore,
} from "./store.ts";
import { getCombatConfig } from "./config.ts";

const DEFAULT_MAX_ROUNDS = 50;

export interface WalkerOptions {
  ports?: CombatPorts;
  store?: EncounterStore;
}

async function loadViews(
  ports: CombatPorts,
  parts: Participant[],
): Promise<Map<string, CombatActorView>> {
  const map = new Map<string, CombatActorView>();
  for (const p of parts) {
    const v = await ports.loadActor(p.actorId);
    if (v) map.set(p.actorId, v);
  }
  return map;
}

async function applyAction(
  ports: CombatPorts,
  store: EncounterStore,
  enc: Encounter,
  slot: Participant,
  view: CombatActorView,
  action: CombatAction,
): Promise<void> {
  const ctx = {
    encounter: enc,
    actor: view,
    participant: slot,
  };

  switch (action.type) {
    case "flee": {
      const aiState = { ...(slot.aiState ?? {}), fled: true };
      await store.patchParticipant(enc.id, slot.actorId, {
        isOut: true,
        aiState,
      });
      ports.broadcast(enc.roomId, `${slot.name} flees.`);
      return;
    }
    case "move": {
      await store.patchParticipant(enc.id, slot.actorId, {
        movedThisRound: true,
      });
      ports.broadcast(enc.roomId, `${slot.name} moves.`);
      return;
    }
    case "posture": {
      await store.patchParticipant(enc.id, slot.actorId, {
        reactionPosture: action.posture,
      });
      ports.broadcast(
        enc.roomId,
        `${slot.name} takes a defensive posture.`,
      );
      return;
    }
    case "wait": {
      ports.broadcast(enc.roomId, `${slot.name} waits.`);
      return;
    }
    case "attack":
    case "reload":
    case "custom":
    default: {
      const result = await ports.executeAction(
        slot.actorId,
        action,
        ctx,
      );
      if (!result.ok && result.message) {
        ports.broadcast(enc.roomId, result.message);
      }
    }
  }
}

/**
 * AI-aware turn walker. Returns final encounter (or null).
 */
export async function advanceTurnSmart(
  encounterId: string,
  options?: WalkerOptions,
): Promise<Encounter | null> {
  const ports = options?.ports ?? requireCombatPorts();
  const store = options?.store ?? getEncounterStore();

  let enc = await store.get(encounterId);
  if (!enc || enc.status !== "active") return enc ?? null;

  const maxRounds = enc.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const safetyMax = Math.max(
    1,
    maxRounds * Math.max(1, enc.participants.length),
  );
  let walked = 0;

  while (walked < safetyMax) {
    enc = await store.get(encounterId);
    if (!enc || enc.status !== "active") return enc ?? null;

    const slot = enc.participants[enc.turnIdx];
    if (!slot) break;

    if (allNpcsDown(enc)) {
      if (ports.onResolved) {
        return (await ports.onResolved(enc)) ?? enc;
      }
      return enc;
    }

    if (slot.kind !== "npc") {
      if (!slot.isOut) return enc;
      await store.advanceTurn(enc.id);
      walked += 1;
      continue;
    }

    if (slot.isOut) {
      await store.advanceTurn(enc.id);
      walked += 1;
      continue;
    }

    const view = await ports.loadActor(slot.actorId);
    if (!view) {
      await store.advanceTurn(enc.id);
      walked += 1;
      continue;
    }

    // Merge participant aiState/threat onto view for brains.
    const cfg = getCombatConfig();
    const selfView: CombatActorView = {
      ...view,
      aiKey: view.aiKey || cfg.defaultAiKey || undefined,
      aiState: slot.aiState ?? view.aiState,
      threat: slot.threat ?? view.threat,
      isOut: slot.isOut || view.isOut,
    };

    if (isManualAiKey(selfView.aiKey)) return enc;

    const views = await loadViews(ports, enc.participants);
    views.set(slot.actorId, selfView);
    const others = enc.participants.filter(
      (x) => x.actorId !== slot.actorId,
    );
    const brainCtx: BrainCtx = {
      encounter: enc,
      self: slot,
      selfView,
      others,
      views,
    };

    const action = await decideAction(brainCtx);
    if (!action) {
      // No brain claimed this key → ST control.
      return enc;
    }

    try {
      await applyAction(ports, store, enc, slot, selfView, action);
    } catch (_err) {
      ports.broadcast(enc.roomId, `${slot.name} hesitates.`);
    }

    if (ports.afterAction) {
      const mid = await store.get(encounterId);
      if (mid) await ports.afterAction(encounterId, mid);
    }

    const fresh = await store.get(encounterId);
    if (fresh && allNpcsDown(fresh)) {
      if (ports.onResolved) {
        return (await ports.onResolved(fresh)) ?? fresh;
      }
      return fresh;
    }

    await store.advanceTurn(enc.id);
    walked += 1;
  }

  const last = await store.get(encounterId);
  ports.broadcast(
    last?.roomId ?? enc?.roomId ?? "",
    `%cyCOMBAT>>%cn Safety cap (${maxRounds} rounds) ` +
      `reached; halting auto-resolve.`,
  );
  return last ?? null;
}

/**
 * Smart-advance the active encounter in a room (default store only).
 * With a custom EncounterStore, call advanceTurnSmart(id, opts) instead.
 */
export async function smartNext(
  roomId: string,
  options?: WalkerOptions,
): Promise<Encounter | null> {
  if (options?.store) return null;
  const { getEncounterForRoom } = await import("./encounter.ts");
  const enc = await getEncounterForRoom(roomId);
  if (!enc) return null;
  return await advanceTurnSmart(enc.id, options);
}
