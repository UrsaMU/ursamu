/**
 * D&D adapter for @ursamu/combat — second-system proof.
 */
import {
  type CombatActorView,
  type CombatPorts,
  type Encounter,
  type EncounterStore,
  type Participant,
  jsonStrategyBrain,
  registerCombatBrain,
  registerEncounterStore,
  unregisterEncounterStore,
} from "@ursamu/combat";
import { DBO, type IDBObj, type IUrsamuSDK } from "@ursamu/ursamu";
import {
  executeDndAttack,
  healthFrac,
  isIncapacitated,
  sheetOf,
} from "./resolve.ts";

// deno-lint-ignore no-explicit-any
type Q = any;

/** Isolated from cofd.encounters / combat.encounters. */
export const dndEncounterDb = new DBO<Encounter>("dnd.encounters");

export const dndEncounterStore: EncounterStore = {
  async get(id) {
    return (await dndEncounterDb.findOne({ id } as Q)) ?? null;
  },
  async advanceTurn(id) {
    return await advanceTurnOn(id);
  },
  async patchParticipant(encounterId, actorId, patch) {
    return await patchOn(encounterId, actorId, patch);
  },
};

async function advanceTurnOn(
  encounterId: string,
): Promise<Encounter | null> {
  const enc = await dndEncounterDb.findOne({ id: encounterId } as Q);
  if (!enc || enc.status !== "active") return enc ?? null;
  const count = enc.participants.length;
  if (count === 0) return enc;
  let nextIdx = enc.turnIdx + 1;
  let round = enc.round;
  let participants = enc.participants;
  if (nextIdx >= count) {
    nextIdx = 0;
    round += 1;
    participants = participants.map((p) => ({
      ...p,
      appliedDefense: 0,
      isDodging: false,
      actionUsed: false,
      movedThisRound: false,
      ran: false,
      delayed: false,
    }));
  }
  const updated = {
    ...enc,
    turnIdx: nextIdx,
    round,
    participants,
  };
  await dndEncounterDb.update({ id: encounterId } as Q, updated);
  return updated;
}

async function patchOn(
  encounterId: string,
  actorId: string,
  patch: Partial<Participant>,
): Promise<Encounter | null> {
  const enc = await dndEncounterDb.findOne({ id: encounterId } as Q);
  if (!enc) return null;
  const participants = enc.participants.map((p) =>
    p.actorId === actorId ? { ...p, ...patch } : p
  );
  const updated = { ...enc, participants };
  await dndEncounterDb.update({ id: encounterId } as Q, updated);
  return updated;
}

export async function createDndEncounter(
  roomId: string,
  name?: string,
): Promise<Encounter> {
  const now = Date.now();
  const enc: Encounter = {
    id: `dnd-enc-${now}-${Math.floor(Math.random() * 1e6)}`,
    roomId,
    round: 0,
    turnIdx: 0,
    participants: [],
    status: "intent",
    createdAt: now,
    name,
  };
  await dndEncounterDb.create(enc);
  return enc;
}

export async function addDndParticipant(
  encounterId: string,
  actor: IDBObj,
  initiative = 0,
): Promise<Encounter | null> {
  const enc = await dndEncounterDb.findOne({ id: encounterId } as Q);
  if (!enc) return null;
  if (enc.participants.some((p) => p.actorId === actor.id)) {
    return enc;
  }
  const flags = flagsSet(actor.flags);
  const kind = flags.has("npc") ? "npc" : "pc";
  const slot: Participant = {
    actorId: actor.id,
    name: actor.name ?? actor.id,
    initiative,
    appliedDefense: 0,
    isDodging: false,
    isOut: false,
    kind,
  };
  const updated = {
    ...enc,
    participants: [...enc.participants, slot],
  };
  await dndEncounterDb.update({ id: encounterId } as Q, updated);
  return updated;
}

function flagsSet(raw: unknown): Set<string> {
  if (raw instanceof Set) return raw as Set<string>;
  if (Array.isArray(raw)) return new Set(raw as string[]);
  if (typeof raw === "string") {
    return new Set(raw.split(/\s+/).filter(Boolean));
  }
  return new Set();
}

async function loadDb(
  u: IUrsamuSDK,
  id: string,
): Promise<IDBObj | null> {
  // deno-lint-ignore no-explicit-any
  const found = await u.db.search({ id } as any);
  return found[0] ?? null;
}

export function actorToView(actor: IDBObj): CombatActorView {
  const flags = flagsSet(actor.flags);
  const kind = flags.has("npc") ? "npc" : "pc";
  const sheet = sheetOf(actor);
  // deno-lint-ignore no-explicit-any
  const rawKey = (actor.state as any)?.dnd?.aiKey;
  const aiKey = String(
    rawKey ?? (kind === "npc" ? "aggressive" : ""),
  ).toLowerCase().trim();
  return {
    id: actor.id,
    name: actor.name ?? actor.id,
    kind,
    isOut: isIncapacitated(sheet),
    healthFrac: healthFrac(sheet),
    aiKey: kind === "npc" ? (aiKey || "aggressive") : undefined,
  };
}

export function makeDndPorts(u: IUrsamuSDK): CombatPorts {
  // deno-lint-ignore no-explicit-any
  const here = (u as any).here;

  return {
    async loadActor(id) {
      const a = await loadDb(u, id);
      return a ? actorToView(a) : null;
    },

    async executeAction(actorId, action, ctx) {
      if (action.type !== "attack" || !action.targetId) {
        return { ok: true };
      }
      const atk = await loadDb(u, actorId);
      const def = await loadDb(u, action.targetId);
      if (!atk || !def) {
        return { ok: false, message: "Missing combatant." };
      }
      const slot = ctx.encounter.participants.find(
        (p) => p.actorId === action.targetId,
      );
      if (!slot) return { ok: false };

      const result = await executeDndAttack(u, atk, def, slot);
      if (here?.broadcast) here.broadcast(result.message);
      else u.send(result.message);

      if (result.hit) {
        const fresh = await loadDb(u, action.targetId);
        if (fresh && isIncapacitated(sheetOf(fresh))) {
          await dndEncounterStore.patchParticipant(
            ctx.encounter.id,
            action.targetId,
            { isOut: true },
          );
          const msg =
            `%ch%ccD&D>>%cn ${slot.name} drops to 0 HP!`;
          if (here?.broadcast) here.broadcast(msg);
        }
      }
      return { ok: true };
    },

    broadcast(_roomId, msg) {
      if (here?.broadcast) here.broadcast(msg);
    },

    async onResolved(enc) {
      const resolved = { ...enc, status: "resolved" as const };
      await dndEncounterDb.update(
        { id: enc.id } as Q,
        resolved,
      );
      if (here?.broadcast) {
        here.broadcast("%ch%ccD&D>>%cn Encounter resolved.");
      }
      return resolved;
    },

    async afterAction(encounterId, enc) {
      for (const p of enc.participants) {
        const a = await loadDb(u, p.actorId);
        if (!a) continue;
        if (isIncapacitated(sheetOf(a)) && !p.isOut) {
          await dndEncounterStore.patchParticipant(
            encounterId,
            p.actorId,
            { isOut: true },
          );
        }
      }
    },
  };
}

export function initDndCombat(): void {
  registerEncounterStore(dndEncounterStore);
  registerCombatBrain(jsonStrategyBrain);
}

export function removeDndCombat(): void {
  unregisterEncounterStore();
}
