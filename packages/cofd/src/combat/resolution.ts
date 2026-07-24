// Scene-resolution helpers. attack.ts calls these without pulling the walker.
// Status flip uses combat endEncounter; loot/beats stay CofD (ports.onResolved).

import { allNpcsDown, endEncounter } from "@ursamu/combat";
import { healthMax } from "../health/index.ts";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import { cofdEncounterStore } from "./encounter.ts";
import type { Encounter, Participant } from "./types.ts";
import { dropLoot } from "./loot.ts";
import type { CofdSheet } from "../stats/index.ts";

export { allNpcsDown };

async function loadActor(u: IUrsamuSDK, id: string): Promise<IDBObj | null> {
  // deno-lint-ignore no-explicit-any
  const found = await u.db.search({ id } as any);
  return found[0] ?? null;
}

/**
 * Canonical participant patch for cofd.encounters.
 * cofdEncounterStore.patchParticipant delegates here — do not duplicate.
 * Persistence goes only through the store.
 */
export async function patchParticipant(
  encounterId: string,
  actorId: string,
  patch: Partial<Participant>,
): Promise<Encounter | null> {
  const enc = await cofdEncounterStore.get(encounterId);
  if (!enc) return null;
  const idx = enc.participants.findIndex((p) => p.actorId === actorId);
  if (idx < 0) return enc;
  const participants = [...enc.participants];
  participants[idx] = { ...participants[idx], ...patch };
  const updated = { ...enc, participants };
  await cofdEncounterStore.save(updated);
  return updated;
}

/** Award scene-resolution beats: 1 per surviving PC + 1 if no PC went down. */
export async function awardSceneBeats(
  u: IUrsamuSDK,
  enc: Encounter,
  reason: string,
): Promise<void> {
  const pcs = enc.participants.filter((p) => p.kind === "pc");
  const survivors = pcs.filter((p) => !p.isOut);
  const noPcDown = survivors.length === pcs.length;
  const beats = survivors.length + (noPcDown ? 1 : 0);
  if (beats <= 0) return;
  for (const pc of survivors) {
    try {
      const actor = await loadActor(u, pc.actorId);
      if (!actor) continue;
      const sheet = actor.state?.cofd as CofdSheet | undefined;
      if (!sheet) continue;
      const before = sheet.beats ?? 0;
      let updatedBeats = before + beats;
      let xp = sheet.experience ?? 0;
      while (updatedBeats >= 5) {
        xp += 1;
        updatedBeats -= 5;
      }
      const next = { ...sheet, beats: updatedBeats, experience: xp };
      await u.db.modify(pc.actorId, "$set", { "data.cofd": next });
      // deno-lint-ignore no-explicit-any
      const here = (u as any).here;
      if (here && typeof here.broadcast === "function") {
        here.broadcast(
          `%cyBEATS>>%cn ${pc.name} earns ${beats} Beat${beats === 1 ? "" : "s"} -- ${reason}.`,
        );
      }
    } catch { /* swallow */ }
  }
}

/** Trigger scene resolution: mark resolved, drop NPC loot, award beats. */
export async function resolveScene(
  u: IUrsamuSDK,
  encounterId: string,
): Promise<Encounter | null> {
  const enc = await cofdEncounterStore.get(encounterId);
  if (!enc) return null;
  if (enc.status === "resolved") return enc;

  // Engine marks status=resolved; host keeps loot + beats.
  const resolved = await endEncounter(encounterId, {
    store: cofdEncounterStore,
  });
  if (!resolved) return null;

  // Loot drops + despawn downed NPCs (CofD tables).
  for (const p of enc.participants) {
    if (p.kind !== "npc" || !p.isOut) continue;
    const actor = await loadActor(u, p.actorId);
    if (!actor) continue;
    const sheet = actor.state?.cofd as
      | (CofdSheet & { npc?: { aiArchetype?: string; lootTable?: string } })
      | undefined;
    const key = sheet?.npc?.lootTable ?? sheet?.npc?.aiArchetype;
    if (key) {
      try {
        await dropLoot(u, key, enc.roomId);
      } catch { /* swallow */ }
    }
    try {
      await u.db.destroy(p.actorId);
    } catch { /* swallow */ }
  }

  await awardSceneBeats(
    u,
    resolved,
    `Scene resolved: ${enc.name ?? "encounter"}`,
  );

  // deno-lint-ignore no-explicit-any
  const here = (u as any).here;
  if (here && typeof here.broadcast === "function") {
    here.broadcast(
      "The scene resolves. Survivors recover their bearings.",
    );
  }
  return resolved;
}

/** Recompute isOut for a participant from their sheet's incapacitated flag. */
export async function syncIsOut(
  u: IUrsamuSDK,
  encounterId: string,
  actorId: string,
): Promise<void> {
  const actor = await loadActor(u, actorId);
  if (!actor) return;
  const sheet = actor.state?.cofd as CofdSheet | undefined;
  if (!sheet) return;
  const max = healthMax(sheet);
  const h = sheet.health ?? { bashing: 0, lethal: 0, aggravated: 0 };
  const filled = (h.bashing ?? 0) + (h.lethal ?? 0) + (h.aggravated ?? 0);
  const isOut = filled >= max;
  await patchParticipant(encounterId, actorId, { isOut });
}

/**
 * Called from attack.ts after a target is incapacitated. Marks them out,
 * checks for scene resolution, and triggers it (awarding beats) if all
 * NPCs are down. Returns true when the scene resolved.
 */
export async function handleTargetIncapacitated(
  u: IUrsamuSDK,
  encounterId: string,
  targetActorId: string,
): Promise<boolean> {
  await syncIsOut(u, encounterId, targetActorId);
  const enc = await cofdEncounterStore.get(encounterId);
  if (!enc) return false;

  // Auto-destroy the downed NPC immediately.
  const p = enc.participants.find((x) => x.actorId === targetActorId);
  if (p && p.kind === "npc") {
    const actor = await loadActor(u, targetActorId);
    if (actor) {
      const sheet = actor.state?.cofd as
        | (CofdSheet & { npc?: { aiArchetype?: string; lootTable?: string } })
        | undefined;
      const key = sheet?.npc?.lootTable ?? sheet?.npc?.aiArchetype;
      if (key) {
        try { await dropLoot(u, key, enc.roomId); } catch { /* swallow */ }
      }
      try {
        await u.db.destroy(targetActorId);
      } catch { /* swallow */ }
    }
  }

  if (allNpcsDown(enc)) {
    const resolved = await resolveScene(u, encounterId);
    return resolved !== null;
  }
  return false;
}
