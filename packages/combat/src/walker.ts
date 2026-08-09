/**
 * Ports-based turn walker.
 *
 * Pumps the encounter forward, running brains for each NPC until a
 * live PC turn, all NPCs out, manual AI, or maxRounds safety cap.
 */
import { shouldResolveEncounter } from "./encounter.ts";
import type { Encounter, Participant } from "./types.ts";
import {
  decideAction,
  isManualAiKey,
  type BrainCtx,
} from "./brains.ts";
import {
  requireCombatPorts,
  type CombatAction,
  type CombatActionResult,
  type CombatActorView,
  type CombatPorts,
} from "./ports.ts";
import {
  getEncounterStore,
  type EncounterStore,
} from "./store.ts";
import { getCombatConfig } from "./config.ts";
import { applyActionResult } from "./action-result.ts";

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

function engineHandledResult(
  action: CombatAction,
  slot: Participant,
): CombatActionResult | null {
  switch (action.type) {
    case "flee":
      return {
        ok: true,
        logLine: `${slot.name} flees.`,
        actorOut: true,
        actorPatch: {
          aiState: { ...(slot.aiState ?? {}), fled: true },
        },
        endedTurn: action.endsTurn !== false,
      };
    case "move":
      return {
        ok: true,
        logLine: action.note
          ? `${slot.name} moves (${action.note}).`
          : `${slot.name} moves.`,
        actorPatch: { movedThisRound: true },
        endedTurn: action.endsTurn !== false,
      };
    case "posture":
      return {
        ok: true,
        logLine: `${slot.name} takes a defensive posture.`,
        actorPatch: { reactionPosture: action.posture },
        endedTurn: action.endsTurn !== false,
      };
    case "wait":
      return {
        ok: true,
        logLine: action.note
          ? `${slot.name} waits (${action.note}).`
          : `${slot.name} waits.`,
        endedTurn: action.endsTurn !== false,
      };
    case "defend":
      return {
        ok: true,
        logLine: `${slot.name} defends.`,
        actorPatch: { isDodging: true },
        endedTurn: action.endsTurn !== false,
      };
    case "hold":
    case "delay":
      return {
        ok: true,
        logLine: `${slot.name} holds action.`,
        actorPatch: { delayed: true },
        endedTurn: action.endsTurn !== false,
      };
    case "aim":
      return {
        ok: true,
        logLine: action.targetId
          ? `${slot.name} aims.`
          : `${slot.name} aims carefully.`,
        endedTurn: action.endsTurn !== false,
      };
    default:
      return null;
  }
}

/**
 * Run one action: engine builtins or ports.executeAction, then
 * apply CombatActionResult (threat / log / out).
 * Returns whether the turn should advance.
 */
export async function runCombatAction(
  ports: CombatPorts,
  store: EncounterStore,
  enc: Encounter,
  slot: Participant,
  view: CombatActorView,
  action: CombatAction,
): Promise<{ enc: Encounter | null; endedTurn: boolean }> {
  const ctx = {
    encounter: enc,
    actor: view,
    participant: slot,
  };

  // Old-school cadence: banner → intent → crunch block.
  const flavor = (action.flavor ?? "").trim();
  const wpnTag = (view.tags ?? []).find((t) =>
    t.toLowerCase().startsWith("weapon:")
  );
  const wpn = wpnTag
    ? wpnTag.slice("weapon:".length)
    : typeof view.meta?.weapon === "string"
    ? String(view.meta.weapon)
    : "";
  const banner =
    `%cw${"=".repeat(60)}%cn\r\n` +
    `  %ch%cy${slot.name}%cn%cw's turn%cn` +
    (wpn ? `  %cw[%cn%cc${wpn}%cn%cw]%cn` : "") +
    `  %cw(R${enc.round})%cn\r\n` +
    `%cw${"=".repeat(60)}%cn`;
  ports.broadcast(enc.roomId, banner);
  if (flavor) {
    ports.broadcast(enc.roomId, `  %cm${flavor}%cn`);
  }

  let result: CombatActionResult;
  const builtin = engineHandledResult(action, slot);
  if (builtin) {
    result = builtin;
    if (builtin.logLine && builtin.logLine !== flavor) {
      ports.broadcast(enc.roomId, `  %cw*%cn ${builtin.logLine}`);
    }
  } else {
    result = await ports.executeAction(slot.actorId, action, ctx);
    const roomBlock = result.meta &&
        typeof result.meta.roomBlock === "string"
      ? String(result.meta.roomBlock)
      : "";
    if (!result.ok && result.message) {
      ports.broadcast(enc.roomId, result.message);
    } else if (roomBlock) {
      ports.broadcast(enc.roomId, roomBlock);
    } else if (result.logLine && result.logLine !== flavor) {
      ports.broadcast(enc.roomId, result.logLine);
    } else if (result.message && result.message !== flavor) {
      ports.broadcast(enc.roomId, result.message);
    }
  }

  // Encounter log: short mechanical line only.
  if (flavor && result.ok && !result.logLine) {
    result = { ...result, logLine: flavor };
  }

  return await applyActionResult(enc.id, result, {
    actorId: slot.actorId,
    action,
    store,
  });
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

    if (shouldResolveEncounter(enc)) {
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

    const cfg = getCombatConfig();
    const metaKey = slot.meta && typeof slot.meta.aiKey === "string"
      ? String(slot.meta.aiKey)
      : undefined;
    const stateKey = slot.aiState &&
        typeof slot.aiState.aiKey === "string"
      ? String(slot.aiState.aiKey)
      : undefined;
    const mergedMeta = {
      ...(view.meta ?? {}),
      ...(slot.meta ?? {}),
    };
    const wpnTag = typeof mergedMeta.weapon === "string"
      ? `weapon:${mergedMeta.weapon}`
      : undefined;
    const tags = [
      ...(view.tags ?? []),
      ...(wpnTag && !(view.tags ?? []).some((t) =>
          t.startsWith("weapon:")
        )
        ? [wpnTag]
        : []),
    ];
    // Prefer explicit participant meta/aiState over loadActor default
    // (loadActor may default NPCs to "aggressive").
    const resolvedKey = metaKey || stateKey || view.aiKey ||
      cfg.defaultAiKey || undefined;
    const selfView: CombatActorView = {
      ...view,
      aiKey: resolvedKey,
      aiState: slot.aiState ?? view.aiState,
      threat: slot.threat ?? view.threat,
      isOut: slot.isOut || view.isOut,
      side: view.side ?? slot.side,
      tags: tags.length ? tags : view.tags,
      resources: view.resources,
      meta: mergedMeta,
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

    let legal: CombatAction[] | undefined;
    if (ports.listActions) {
      try {
        const listed = await ports.listActions({
          encounter: enc,
          actor: selfView,
          participant: slot,
        });
        if (Array.isArray(listed) && listed.length) {
          legal = listed;
        }
      } catch { /* host listActions optional */ }
    }

    const action = await decideAction(brainCtx, legal);
    if (!action) {
      // No brain claimed this key → ST control.
      return enc;
    }

    let endedTurn = true;
    try {
      const applied = await runCombatAction(
        ports,
        store,
        enc,
        slot,
        selfView,
        action,
      );
      endedTurn = applied.endedTurn;
      if (applied.enc) enc = applied.enc;
    } catch (_err) {
      ports.broadcast(enc.roomId, `${slot.name} hesitates.`);
    }

    if (ports.afterAction) {
      const mid = await store.get(encounterId);
      if (mid) await ports.afterAction(encounterId, mid);
    }

    const fresh = await store.get(encounterId);
    if (fresh && shouldResolveEncounter(fresh)) {
      if (ports.onResolved) {
        return (await ports.onResolved(fresh)) ?? fresh;
      }
      return fresh;
    }

    if (endedTurn) {
      await store.advanceTurn(enc.id);
    }
    // If endedTurn is false, same actor may act again (bonus
    // economy). Safety counter still increments.
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
