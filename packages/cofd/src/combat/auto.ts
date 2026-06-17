// Combat auto-orchestration helpers shared by +attack, +throw, and +grapple.
//
// These collapse three player-facing rituals into the act of attacking:
//   1. ensureEncounter(...)      starts an encounter on the spot if none exists
//   2. autoJoinTarget(...)       slots NPC targets into the encounter on first
//                                involvement
//   3. resolveOrSpawnTarget(...) lets staff target a known archetype key (e.g.
//                                "beshilu") and have the NPC spawn into the
//                                room as a side effect
//   4. endTurnAndWalk(...)       runs the AI walker after the PC's instant
//                                action consumes their turn

import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import {
  addParticipant,
  createEncounter,
  ensureParticipant,
  getEncounterForRoom,
  rollInitiative,
} from "./encounter.ts";
import type { Encounter } from "./types.ts";
import { advanceTurnSmart } from "./walker.ts";
import {
  getArchetype,
  sheetFromArchetype,
} from "../npc/archetypes.ts";

/** Staff gate matches +npc internals. */
function isStaff(actor: IDBObj): boolean {
  const f = actor.flags as Set<string> | undefined;
  if (!f) return false;
  return f.has?.("superuser") || f.has?.("admin") ||
    f.has?.("wizard") || f.has?.("builder");
}

/** True when the actor has the npc flag. */
function isNpcFlag(actor: IDBObj): boolean {
  const f = actor.flags as Set<string> | undefined;
  return !!(f && typeof f.has === "function" && f.has("npc"));
}

/**
 * Look up the active encounter in the actor's room; if none exists, create
 * one, add the actor as a PC participant, and roll initiative so it begins
 * "active" immediately. Returns the live encounter or null on failure.
 */
export async function ensureEncounter(
  u: IUrsamuSDK,
  actor: IDBObj,
): Promise<Encounter | null> {
  const roomId = u.here?.id;
  if (!roomId) return null;

  const existing = await getEncounterForRoom(roomId);
  if (existing && existing.status === "active") return existing;
  if (existing) {
    // intent/paused -> activate via initiative roll.
    await addParticipant(existing.id, actor);
    const rolled = await rollInitiative(existing.id, u);
    if (rolled) {
      u.broadcast(
        "%cyCOMBAT>>%cn Combat begins! Initiative rolled.",
      );
    }
    return rolled;
  }

  // No encounter yet -- create + activate.
  const created = await createEncounter(roomId);
  await addParticipant(created.id, actor);
  const rolled = await rollInitiative(created.id, u);
  if (rolled) {
    u.broadcast(
      `%cyCOMBAT>>%cn ${actor.name ?? "Someone"} opens combat! Initiative rolled.`,
    );
  }
  return rolled;
}

/**
 * Slot the target into the encounter if not already a participant. Mutates
 * the passed-in encounter snapshot in place with the refreshed participants
 * and turnIdx so callers can keep using it without a refetch. Returns true
 * when a join occurred.
 */
export async function autoJoinTarget(
  u: IUrsamuSDK,
  enc: Encounter,
  target: IDBObj,
): Promise<boolean> {
  if (!isNpcFlag(target)) return false;
  if (enc.participants.some((p) => p.actorId === target.id)) return false;
  const updated = await ensureParticipant(u, enc.id, target);
  if (!updated) return false;
  enc.participants = updated.participants;
  enc.turnIdx = updated.turnIdx;
  u.broadcast(
    `%cyCOMBAT>>%cn ${target.name ?? "An NPC"} joins the fray.`,
  );
  return true;
}

/**
 * Resolve a target name. Order:
 *   1. u.util.target — normal name/dbref lookup
 *   2. If staff AND name matches a known NPC archetype key, spawn a fresh
 *      NPC in the actor's room from that archetype and return it.
 *
 * Returns null if neither resolves. The auto-spawn path emits a broadcast.
 */
export async function resolveOrSpawnTarget(
  u: IUrsamuSDK,
  actor: IDBObj,
  name: string,
): Promise<IDBObj | null> {
  const found = await u.util.target(actor, name, true);
  if (found) return found;

  if (!isStaff(actor)) return null;
  const roomId = u.here?.id;
  if (!roomId) return null;

  const archetype = getArchetype(name.toLowerCase());
  if (!archetype) return null;

  const sheet = sheetFromArchetype(archetype, archetype.tier, {
    aiArchetype: "beshilu-swarmer",
  });
  const spawnName = archetype.label;
  const npcObj = await u.db.create({
    name: spawnName,
    flags: new Set(["npc", "thing"]),
    location: roomId,
    state: { cofd: sheet },
    contents: [],
  });
  u.broadcast(
    `%cyCOMBAT>>%cn ${spawnName} appears! (auto-spawned by ${actor.name ?? "staff"})`,
  );
  return npcObj;
}

/**
 * Called by +attack / +throw / +grapple after the PC's instant action has
 * been recorded with setActionUsed. Runs the AI walker so NPC turns play
 * out without a manual +combat/next, halting at the next live PC or scene
 * resolution.
 */
export async function endTurnAndWalk(
  u: IUrsamuSDK,
  encounterId: string,
): Promise<void> {
  try {
    await advanceTurnSmart(encounterId, u);
  } catch {
    // Walker failures should never break the player's command.
  }
}
