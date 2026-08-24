/**
 * Encounter store sync from legacy combat tracker.
 */
import { assertEquals, assertExists } from "@std/assert";
import {
  initCprCombat,
  removeCprCombat,
  cprEncounterStore,
} from "../src/combat/ports.ts";
import {
  applyEncounterToCombat,
  syncEncounterFromCombat,
} from "../src/combat/sync.ts";
import type { ICombatState } from "../db/schemas.ts";
import type { Encounter } from "@ursamu/combat";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("syncEncounterFromCombat mirrors queue", OPTS, async () => {
  initCprCombat();
  try {
    const combat: ICombatState = {
      id: "legacy-1",
      roomId: "room-sync-1",
      round: 2,
      active: true,
      queue: [
        {
          actorId: "a1",
          name: "Alpha",
          initiative: 15,
          held: false,
          acted: false,
          isNpc: false,
        },
        {
          actorId: "b1",
          name: "Bravo",
          initiative: 12,
          held: false,
          acted: true,
          isNpc: true,
        },
      ],
      currentIndex: 1,
      startedAt: Date.now(),
      startedBy: "a1",
      log: [],
    };
    const enc = await syncEncounterFromCombat(combat);
    assertEquals(enc.status, "active");
    assertEquals(enc.participants.length, 2);
    assertEquals(enc.participants[0].actorId, "a1");
    assertEquals(enc.participants[0].initiative, 15);
    assertEquals(enc.participants[1].kind, "npc");
    // legacy round 2 → enc round 1; index preserved
    assertEquals(enc.round, 1);
    assertEquals(enc.turnIdx, 1);

    const found = await cprEncounterStore.findInRoom?.(
      "room-sync-1",
    );
    assertExists(found);
    assertEquals(found!.id, enc.id);
  } finally {
    removeCprCombat();
  }
});

Deno.test("applyEncounterToCombat writes round/turn back", OPTS, () => {
  const combat: ICombatState = {
    id: "legacy-2",
    roomId: "room-sync-2",
    round: 1,
    active: true,
    queue: [
      {
        actorId: "pc",
        name: "V",
        initiative: 10,
        held: false,
        acted: true,
        isNpc: false,
      },
      {
        actorId: "npc",
        name: "Ganger",
        initiative: 8,
        held: false,
        acted: false,
        isNpc: true,
      },
    ],
    currentIndex: 1,
    startedAt: Date.now(),
    startedBy: "pc",
    log: [],
  };
  // Walker finished NPC and advanced to PC, round wrapped
  const enc = {
    id: "e1",
    roomId: "room-sync-2",
    status: "active",
    round: 2, // 0-based → display round 3
    turnIdx: 0,
    participants: [
      {
        actorId: "pc",
        name: "V",
        initiative: 10,
        appliedDefense: 0,
        isDodging: false,
        isOut: false,
        kind: "pc",
        actionUsed: false,
      },
      {
        actorId: "npc",
        name: "Ganger",
        initiative: 8,
        appliedDefense: 0,
        isDodging: false,
        isOut: false,
        kind: "npc",
        actionUsed: true,
      },
    ],
  } as Encounter;

  const next = applyEncounterToCombat(combat, enc);
  assertEquals(next.currentIndex, 0);
  assertEquals(next.round, 3);
  assertEquals(next.queue[1].acted, true);
  assertEquals(next.queue[0].acted, false);
});