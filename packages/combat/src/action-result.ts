/**
 * Apply CombatActionResult side-effects onto an encounter
 * (threat, log, isOut, patches). Pure + store writes.
 */
import {
  appendEncounterLog,
  mergeMeta,
  type Encounter,
  type Participant,
} from "./types.ts";
import type { CombatAction, CombatActionResult } from "./ports.ts";
import { actionTargetId } from "./ports.ts";
import type { EncounterStore } from "./store.ts";

export interface ApplyResultOptions {
  /** Acting participant id. */
  actorId: string;
  /** Action that produced the result (for default targetId). */
  action: CombatAction;
  store: EncounterStore;
  /** Cap for encounter.log (default 50). */
  logCap?: number;
}

function bumpThreat(
  p: Participant,
  fromId: string,
  amount: number,
): Participant {
  if (!(amount > 0)) return p;
  const threat = { ...(p.threat ?? {}) };
  threat[fromId] = (threat[fromId] ?? 0) + amount;
  return { ...p, threat };
}

/**
 * Persist result effects. Returns fresh encounter (or null if gone)
 * and whether the walker should advance the turn.
 */
export async function applyActionResult(
  encounterId: string,
  result: CombatActionResult,
  opts: ApplyResultOptions,
): Promise<{ enc: Encounter | null; endedTurn: boolean }> {
  const endedTurn = result.endedTurn !== false;
  let enc = await opts.store.get(encounterId);
  if (!enc) return { enc: null, endedTurn };

  const actorId = opts.actorId;
  const targetId = result.targetId ?? actionTargetId(opts.action);

  // Log
  if (result.logLine) {
    enc = appendEncounterLog(enc, result.logLine, opts.logCap);
    await opts.store.save(enc);
  } else if (result.message && result.ok === false) {
    enc = appendEncounterLog(enc, result.message, opts.logCap);
    await opts.store.save(enc);
  }

  // Actor patch / out
  if (result.actorOut || result.actorPatch) {
    const patch: Partial<Participant> = {
      ...(result.actorPatch ?? {}),
    };
    if (result.actorOut) patch.isOut = true;
    if (result.meta && patch.meta === undefined) {
      const cur = enc.participants.find((p) => p.actorId === actorId);
      patch.meta = mergeMeta(cur?.meta, result.meta);
    }
    enc = (await opts.store.patchParticipant(
      encounterId,
      actorId,
      patch,
    )) ?? enc;
  }

  // Target threat / out / patch
  if (targetId) {
    const dmg = result.damageApplied ?? 0;
    const threatDelta = { ...(result.threatDelta ?? {}) };
    if (dmg > 0 && threatDelta[actorId] === undefined) {
      threatDelta[actorId] = dmg;
    }

    let targetPatch: Partial<Participant> = {
      ...(result.targetPatch ?? {}),
    };
    if (result.targetOut) targetPatch.isOut = true;

    if (Object.keys(threatDelta).length > 0) {
      const fresh = await opts.store.get(encounterId);
      const tgt = fresh?.participants.find(
        (p) => p.actorId === targetId,
      );
      if (tgt) {
        let next = tgt;
        for (const [from, amt] of Object.entries(threatDelta)) {
          next = bumpThreat(next, from, Number(amt) || 0);
        }
        targetPatch = {
          ...targetPatch,
          threat: next.threat,
        };
      }
    }

    if (Object.keys(targetPatch).length > 0) {
      enc = (await opts.store.patchParticipant(
        encounterId,
        targetId,
        targetPatch,
      )) ?? enc;
    }
  } else if (result.threatDelta) {
    // Apply threat deltas as actorId → amount on named keys that
    // look like participant ids present in the encounter.
    const fresh = await opts.store.get(encounterId);
    if (fresh) {
      for (const [tid, amt] of Object.entries(result.threatDelta)) {
        const tgt = fresh.participants.find((p) => p.actorId === tid);
        if (!tgt) continue;
        const next = bumpThreat(tgt, actorId, Number(amt) || 0);
        enc = (await opts.store.patchParticipant(
          encounterId,
          tid,
          { threat: next.threat },
        )) ?? enc;
      }
    }
  }

  enc = await opts.store.get(encounterId);
  return { enc, endedTurn };
}
