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
import { DBO, type IDBObj, type IUrsamuSDK } from "@ursamu/mush";
import {
  executeDndAttack,
  healthFrac,
  isIncapacitated,
  sheetOf,
} from "./resolve.ts";
import { getAbilityMod } from "../stats/dnd_sheet.ts";

// deno-lint-ignore no-explicit-any
type Q = any;

/** Isolated from cofd.encounters / combat.encounters. */
export const dndEncounterDb = new DBO<Encounter>("dnd.encounters");

export const dndEncounterStore: EncounterStore = {
  async get(id) {
    return (await dndEncounterDb.findOne({ id } as Q)) ?? null;
  },
  async create(enc) {
    await dndEncounterDb.create(enc);
  },
  async save(enc) {
    await dndEncounterDb.update({ id: enc.id } as Q, enc);
  },
  async findInRoom(roomId) {
    const rows = await dndEncounterDb.query({
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

export function kindOfActor(actor: IDBObj): "pc" | "npc" {
  const flags = flagsSet(actor.flags);
  if (flags.has("npc")) return "npc";
  // deno-lint-ignore no-explicit-any
  const dnd = (actor.state as any)?.dnd;
  if (dnd?.class === "Monster" || dnd?.class === "Hireling") {
    return "npc";
  }
  return "pc";
}

export function actorToView(actor: IDBObj): CombatActorView {
  const flags = flagsSet(actor.flags);
  const kind = kindOfActor(actor);
  const sheet = sheetOf(actor);
  // deno-lint-ignore no-explicit-any
  const rawKey = (actor.state as any)?.dnd?.aiKey;
  const aiKey = String(
    rawKey ?? (kind === "npc" ? "aggressive" : ""),
  ).toLowerCase().trim();
  // Sheet attacks (Bite, Scimitar) — not inventory items
  // deno-lint-ignore no-explicit-any
  const attacks = ((sheet as any).attacks ?? []) as Array<{
    id?: string;
    name?: string;
    ranged?: boolean;
  }>;
  const primary = attacks[0];
  const wpnName = primary?.name ||
    (kind === "npc" ? "Strike" : "weapon");
  const tags: string[] = [`weapon:${wpnName}`];
  if (primary?.ranged) tags.push("ranged");
  else tags.push("melee");
  for (const a of attacks) {
    if (a.id) tags.push(`ability:${a.id}`);
  }
  return {
    id: actor.id,
    name: actor.name ?? actor.id,
    kind,
    isOut: isIncapacitated(sheet),
    healthFrac: healthFrac(sheet),
    aiKey: kind === "npc" ? (aiKey || "aggressive") : undefined,
    tags,
    meta: {
      weapon: wpnName,
      attacks,
    },
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

    async rollInitiative(actorId) {
      const a = await loadDb(u, actorId);
      if (!a) return Math.floor(Math.random() * 20) + 1;
      const sheet = sheetOf(a);
      const dex = getAbilityMod(sheet.abilities?.dexterity ?? 10);
      return Math.floor(Math.random() * 20) + 1 + dex;
    },

    async listActions(ctx) {
      const sheet = sheetOf(
        (await loadDb(u, ctx.actor.id)) ?? {
          id: ctx.actor.id,
          flags: new Set(),
          state: {},
          contents: [],
        },
      );
      // deno-lint-ignore no-explicit-any
      const attacks = ((sheet as any).attacks ?? []) as Array<{
        id?: string;
        name?: string;
      }>;
      if (!attacks.length) {
        return [{ type: "attack" as const, targetId: "" }];
      }
      return attacks.map((a) => ({
        type: "attack" as const,
        targetId: "",
        abilityId: a.id || a.name,
        note: a.name,
      }));
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

      const abilityId = action.abilityId ||
        (typeof action.weaponId === "string"
          ? action.weaponId
          : undefined);
      const result = await executeDndAttack(u, atk, def, slot, {
        abilityId,
      });
      // Do not broadcast here — walker prints message once.
      let message = result.message;
      let targetOut = false;
      if (result.hit) {
        const fresh = await loadDb(u, action.targetId);
        const sheet = fresh ? sheetOf(fresh) : null;
        if (fresh && sheet && isIncapacitated(sheet)) {
          targetOut = true;
          await dndEncounterStore.patchParticipant(
            ctx.encounter.id,
            action.targetId,
            { isOut: true },
          );
          if (!result.killed && (sheet.hp?.current ?? 0) <= 0) {
            message +=
              `\n%ch${slot.name}%cn drops to %ch0 HP%cn!`;
          }
        }
      }
      return {
        ok: true,
        damageApplied: result.hit ? result.damage : 0,
        message,
        targetOut,
        targetId: action.targetId,
        actorOut: false,
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
      await dndEncounterDb.update(
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
      const npcs = enc.participants.filter((p) => p.kind === "npc");
      const pcsDown = pcs.length > 0 && pcs.every((p) => p.isOut);
      const npcsDown = npcs.length > 0 &&
        npcs.every((p) => p.isOut);

      if (pcsDown && !npcsDown) {
        say("%ch%crThe party falls%cn — combat ends.");
        // Auto death saves → dead (underworld) or stable
        try {
          const { resolveEncounterDownedPcs } = await import(
            "../stats/downed-resolve.ts"
          );
          say("%chDeath saving throws%cn…");
          const lines = await resolveEncounterDownedPcs(
            u,
            enc.participants,
          );
          for (const ln of lines) say(ln);
        } catch (e: unknown) {
          console.error("[dnd] downed resolve:", e);
        }
      } else if (npcsDown) {
        say(
          "%ch%cgAll enemies defeated%cn — combat ends.",
        );
      } else {
        say("Encounter resolved.");
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
