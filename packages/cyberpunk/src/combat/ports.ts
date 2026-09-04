/**
 * CPR adapter for @ursamu/combat.
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
import { DBO, type IDBObj, type IUrsamuSDK } from
  "@ursamu/mush";
import {
  cprOf,
  executeCprAttack,
  healthFrac,
  isIncapacitated,
  npcOf,
} from "./resolve.ts";
import { rollD10Critical } from "../../engine/dice.ts";
import { woundActionPenalty } from
  "../../engine/character.ts";

// deno-lint-ignore no-explicit-any
type Q = any;

/** Isolated from dnd.encounters / combat.encounters. */
export const cprEncounterDb = new DBO<Encounter>("cpr.encounters");

export const cprEncounterStore: EncounterStore = {
  async get(id) {
    return (await cprEncounterDb.findOne({ id } as Q)) ?? null;
  },
  async create(enc) {
    await cprEncounterDb.create(enc);
  },
  async save(enc) {
    await cprEncounterDb.update({ id: enc.id } as Q, enc);
  },
  async findInRoom(roomId) {
    const rows = await cprEncounterDb.query({
      roomId,
      status: { $in: ["intent", "active"] },
    } as Q);
    if (!rows.length) return null;
    return (
      rows.find((e) => e.status === "active") ??
      rows[0] ??
      null
    );
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
  const enc = await cprEncounterDb.findOne({
    id: encounterId,
  } as Q);
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
  await cprEncounterDb.update({ id: encounterId } as Q, updated);
  return updated;
}

async function patchOn(
  encounterId: string,
  actorId: string,
  patch: Partial<Participant>,
): Promise<Encounter | null> {
  const enc = await cprEncounterDb.findOne({
    id: encounterId,
  } as Q);
  if (!enc) return null;
  const participants = enc.participants.map((p) =>
    p.actorId === actorId ? { ...p, ...patch } : p
  );
  const updated = { ...enc, participants };
  await cprEncounterDb.update({ id: encounterId } as Q, updated);
  return updated;
}

export async function createCprEncounter(
  roomId: string,
  name?: string,
): Promise<Encounter> {
  const now = Date.now();
  const enc: Encounter = {
    id: `cpr-enc-${now}-${Math.floor(Math.random() * 1e6)}`,
    roomId,
    round: 0,
    turnIdx: 0,
    participants: [],
    status: "intent",
    createdAt: now,
    name,
  };
  await cprEncounterDb.create(enc);
  return enc;
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

export function kindOfActor(actor: IDBObj): "pc" | "npc" {
  const flags = flagsSet(actor.flags);
  if (flags.has("npc")) return "npc";
  if (npcOf(actor)) return "npc";
  return "pc";
}

export function actorToView(actor: IDBObj): CombatActorView {
  const kind = kindOfActor(actor);
  const cpr = cprOf(actor);
  const npc = npcOf(actor);
  // deno-lint-ignore no-explicit-any
  const rawKey = (actor.state as any)?.cpr?.aiKey ??
    // deno-lint-ignore no-explicit-any
    (actor.state as any)?.cprNpc?.aiKey;
  const aiKey = String(
    rawKey ?? (kind === "npc" ? "aggressive" : ""),
  ).toLowerCase().trim();

  const tags: string[] = [];
  const ws = cpr?.woundState ?? npc?.woundState;
  if (ws) tags.push(String(ws));
  if (cpr?.role) tags.push(`role:${cpr.role}`);
  tags.push("melee", "ranged");

  const resources: Record<string, number> = {};
  if (cpr) {
    resources.luck = cpr.luckRemaining ?? cpr.stats?.luck ?? 0;
    resources.hp = cpr.hp?.current ?? 0;
    resources.eb = cpr.eurodollars ?? 0;
  } else if (npc) {
    resources.hp = npc.hp?.current ?? 0;
  }

  return {
    id: actor.id,
    name: actor.name ?? actor.id,
    kind,
    isOut: isIncapacitated(actor),
    healthFrac: healthFrac(actor),
    aiKey: kind === "npc" ? (aiKey || "aggressive") : undefined,
    tags,
    resources,
    meta: {
      weapon: npc?.weapon?.name ?? "weapon",
      role: cpr?.role,
    },
  };
}

export function makeCprPorts(u: IUrsamuSDK): CombatPorts {
  // deno-lint-ignore no-explicit-any
  const here = (u as any).here;

  return {
    async loadActor(id) {
      const a = await loadDb(u, id);
      return a ? actorToView(a) : null;
    },

    async rollInitiative(actorId) {
      const a = await loadDb(u, actorId);
      if (!a) return Math.floor(Math.random() * 10) + 1;
      const cpr = cprOf(a);
      const npc = npcOf(a);
      const ref = cpr?.stats?.ref ?? npc?.stats?.ref ?? 5;
      const { total: d10 } = rollD10Critical();
      const wound = cpr
        ? woundActionPenalty(cpr.woundState, cpr.cyberware)
        : 0;
      const kere = cpr?.cyberware?.some((cw) =>
        cw.name === "kerenzikov"
      )
        ? 2
        : 0;
      return ref + d10 + wound + kere;
    },

    async listActions(ctx) {
      if (ctx.actor.isOut) return [{ type: "wait" as const }];
      return [
        { type: "attack" as const, targetId: "" },
        { type: "wait" as const },
        { type: "flee" as const },
      ];
    },

    async executeAction(actorId, action, ctx) {
      if (action.type === "wait" || action.type === "hold") {
        return { ok: true, message: "Holds." };
      }
      if (action.type === "flee") {
        return {
          ok: true,
          message: "Attempts to flee.",
          endedTurn: true,
        };
      }
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

      const result = await executeCprAttack(u, atk, def);
      let targetOut = result.targetOut;
      if (targetOut) {
        await cprEncounterStore.patchParticipant(
          ctx.encounter.id,
          action.targetId,
          { isOut: true },
        );
      }
      return {
        ok: true,
        damageApplied: result.hit ? result.damage : 0,
        message: result.message,
        targetOut,
        targetId: action.targetId,
        actorOut: false,
        endedTurn: true,
      };
    },

    broadcast(_roomId, msg) {
      if (here && typeof here.broadcast === "function") {
        here.broadcast(msg);
        return;
      }
      if (typeof u.broadcast === "function") {
        u.broadcast(msg);
        return;
      }
      u.send(msg);
    },

    async onResolved(enc) {
      const resolved = { ...enc, status: "resolved" as const };
      await cprEncounterDb.update(
        { id: enc.id } as Q,
        resolved,
      );
      const say = (msg: string) => {
        if (here && typeof here.broadcast === "function") {
          here.broadcast(msg);
        } else if (typeof u.broadcast === "function") {
          u.broadcast(msg);
        } else {
          u.send(msg);
        }
      };
      const pcs = enc.participants.filter((p) => p.kind === "pc");
      const npcs = enc.participants.filter((p) =>
        p.kind === "npc"
      );
      const pcsDown = pcs.length > 0 && pcs.every((p) => p.isOut);
      const npcsDown = npcs.length > 0 &&
        npcs.every((p) => p.isOut);
      if (pcsDown && !npcsDown) {
        say("%ch%crEdgerunners down%cn — combat ends.");
      } else if (npcsDown) {
        say("%ch%cgHostiles down%cn — combat ends.");
      } else {
        say("Encounter resolved.");
      }
      return resolved;
    },

    async afterAction(encounterId, enc) {
      for (const p of enc.participants) {
        const a = await loadDb(u, p.actorId);
        if (!a) continue;
        if (isIncapacitated(a) && !p.isOut) {
          await cprEncounterStore.patchParticipant(
            encounterId,
            p.actorId,
            { isOut: true },
          );
        }
      }
    },
  };
}

export function initCprCombat(): void {
  registerEncounterStore(cprEncounterStore);
  registerCombatBrain(jsonStrategyBrain);
}

export function removeCprCombat(): void {
  unregisterEncounterStore();
}
