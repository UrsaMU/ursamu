// deno-lint-ignore-file no-explicit-any require-await
// Integration tests for Chronicles of Darkness 2e combat gaps:
// - Surprise Turn Skip & Defense Suppression
// - Human Cover Redirection
// - Contested Grapple Move Loop
//
// These tests execute the actual command flows using a MockObjectStore.

import { assertEquals, assertStringIncludes, assert } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { mockU, MockObjectStore } from "./helpers/mockU.ts";
import { defaultSheet, type CofdSheet } from "../src/stats/index.ts";
import {
  createEncounter,
  addParticipant,
  rollInitiative,
  advanceTurn,
  setSurprised,
  setParticipantGrappleState,
  getEncounterForRoom,
} from "../src/combat/encounter.ts";
import { attackExec } from "../src/commands/attack.ts";
import { grappleExec } from "../src/commands/grapple.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// ---- Helper Functions ----------------------------------------------------

function makeStore() {
  return new MockObjectStore();
}

function seedPC(
  store: MockObjectStore,
  id: string,
  name: string,
  attrs: Record<string, number> = {},
  skills: Record<string, number> = {},
): any {
  const sheet = defaultSheet();
  // Set attributes
  for (const [k, v] of Object.entries(attrs)) {
    const keyLower = k.toLowerCase();
    for (const key of Object.keys(sheet.attributes)) {
      if (key.toLowerCase() === keyLower) {
        (sheet.attributes as Record<string, number>)[key] = v;
      }
    }
  }
  // Set skills
  for (const [k, v] of Object.entries(skills)) {
    const keyLower = k.toLowerCase();
    for (const key of Object.keys(sheet.skills)) {
      if (key.toLowerCase() === keyLower) {
        (sheet.skills as Record<string, number>)[key] = v;
      }
    }
  }

  const obj = store.create({
    id,
    name,
    flags: new Set(["player", "connected"]),
    state: { cofd: sheet },
  });

  // Override MockObjectStore counter ID to preserve exact test IDs
  (obj as any).id = id;
  (store as any).store.delete(obj.id);
  (store as any).store.set(id, obj);
  return obj;
}

// ---- Tests ---------------------------------------------------------------

describe("Combat Gaps Integration", OPTS, () => {
  // -------------------------------------------------------------------------
  // 1. Surprise Turn Skip & Defense Suppression
  // -------------------------------------------------------------------------
  it("surprised participant loses their turn and gets skipped", async () => {
    const originalRandom = Math.random;
    Math.random = () => 0.7; // Ensure deterministic 8s

    try {
      const store = makeStore();
      const roomId = `room-surprise-${Date.now()}`;

      // Seed 3 characters
      const alice = seedPC(
        store,
        "p-alice",
        "Alice",
        { Dexterity: 5, Composure: 5 },
      );
      const bob = seedPC(
        store,
        "p-bob",
        "Bob",
        { Dexterity: 3, Composure: 3 },
      );
      const charlie = seedPC(
        store,
        "p-charlie",
        "Charlie",
        { Dexterity: 1, Composure: 1 },
      );

      const u = mockU({ me: alice, objectStore: store });
      u.here = {
        id: roomId,
        name: "Room",
        flags: new Set(["room"]),
        broadcast: () => {},
      } as any;

      // Hook search to map correctly
      (u.db as any).search = async (q: Record<string, unknown>) =>
        store.search(q);

      // Create encounter
      const enc = await createEncounter(roomId);
      assert(enc);
      await addParticipant(enc.id, alice);
      await addParticipant(enc.id, bob);
      await addParticipant(enc.id, charlie);

      // Roll initiative. Order will be Alice -> Bob -> Charlie
      const activeEnc = await rollInitiative(enc.id, u);
      assert(activeEnc);
      assertEquals(activeEnc.round, 1);
      assertEquals(activeEnc.turnIdx, 0); // Alice's turn
      assertEquals(activeEnc.participants[0].actorId, "p-alice");
      assertEquals(activeEnc.participants[1].actorId, "p-bob");
      assertEquals(activeEnc.participants[2].actorId, "p-charlie");

      // Mark Bob as surprised
      const surprisedEnc = await setSurprised(enc.id, "p-bob", true);
      assert(surprisedEnc);
      const bobPart = surprisedEnc.participants.find(
        (p) => p.actorId === "p-bob",
      );
      assertEquals(bobPart?.surprised, true);

      // Now Alice finishes her turn and advances.
      // Bob should be skipped automatically, marking actionUsed: true.
      // The active turn pointer should land directly on Charlie.
      const afterSkip = await advanceTurn(enc.id, u);
      assert(afterSkip);
      assertEquals(afterSkip.turnIdx, 2); // Landed on Charlie
      assertEquals(afterSkip.round, 1);

      const bobPartAfter = afterSkip.participants.find(
        (p) => p.actorId === "p-bob",
      );
      assertEquals(bobPartAfter?.surprised, false);
      assertEquals(bobPartAfter?.actionUsed, true);

      // Advance turn again. Charlie acts -> Round wraps.
      const roundWrap = await advanceTurn(enc.id, u);
      assert(roundWrap);
      assertEquals(roundWrap.round, 2);
      assertEquals(roundWrap.turnIdx, 0); // Back to Alice
    } finally {
      Math.random = originalRandom;
    }
  });

  // -------------------------------------------------------------------------
  // 2. Human Cover Redirection
  // -------------------------------------------------------------------------
  it("ranged attacks against cover targets are redirected", async () => {
    const originalRandom = Math.random;
    Math.random = () => 0.7; // Ensure deterministic successes

    try {
      const store = makeStore();
      const roomId = `room-cover-${Date.now()}`;

      // Seed Alice, Bob, Charlie
      const alice = seedPC(
        store,
        "p-alice",
        "Alice",
        { Dexterity: 4 },
        { Firearms: 4 },
      );
      const bob = seedPC(store, "p-bob", "Bob", { Dexterity: 2 });
      const charlie = seedPC(store, "p-charlie", "Charlie", { Stamina: 3 });

      // Set Bob's grapple state: uses Charlie as cover
      bob.state.cofd_grapple = {
        grappleWith: "p-charlie",
        isHolder: false,
      };
      charlie.state.cofd_grapple = {
        grappleWith: "p-bob",
        isHolder: true,
      };

      const u = mockU({
        me: alice,
        args: ["Bob/ranged"],
        objectStore: store,
      });
      u.here = {
        id: roomId,
        name: "Room",
        flags: new Set(["room"]),
        broadcast: () => {},
      } as any;

      // Set custom target resolver
      u.util.target = async (_actor: any, name: string): Promise<any> => {
        const all = store.search({});
        const found = all.find((o) => o.name === name || o.id === name);
        return found ?? undefined;
      };

      // Create active encounter
      const enc = await createEncounter(roomId);
      assert(enc);
      await addParticipant(enc.id, alice);
      await addParticipant(enc.id, bob);
      await addParticipant(enc.id, charlie);

      // Mock search for getEncounterForRoom
      (u.db as any).search = async (q: Record<string, unknown>) =>
        store.search(q);
      await rollInitiative(enc.id, u);

      // Set Bob's participant cover state
      await setParticipantGrappleState(enc.id, "p-bob", {
        isUsingAsCover: true,
      });

      // Execute Alice's attack on Bob
      let broadcastMessage = "";
      u.broadcast = (msg: string) => {
        broadcastMessage += msg + "\n";
      };

      await attackExec(u);

      // Verify redirection broadcast was made
      assertStringIncludes(
        broadcastMessage,
        "uses Charlie as a human shield! The attack is redirected!",
      );

      // Verify Charlie's sheet received the damage instead of Bob
      const charlieObj = store.get("p-charlie");
      const charlieSheet = charlieObj?.state.cofd as CofdSheet;
      assert(charlieSheet);
      const charlieHealth = charlieSheet.health ?? {
        bashing: 0,
        lethal: 0,
        aggravated: 0,
      };
      const charlieDmg = charlieHealth.bashing + charlieHealth.lethal;
      assert(charlieDmg > 0, "Charlie should have received damage");

      const bobObj = store.get("p-bob");
      const bobSheet = bobObj?.state.cofd as CofdSheet;
      assert(bobSheet);
      const bobHealth = bobSheet.health ?? {
        bashing: 0,
        lethal: 0,
        aggravated: 0,
      };
      const bobDmg = bobHealth.bashing + bobHealth.lethal;
      assertEquals(
        bobDmg,
        0,
        "Bob should have been unharmed due to redirection",
      );
    } finally {
      Math.random = originalRandom;
    }
  });

  // -------------------------------------------------------------------------
  // 3. Contested Grapple Moves Loop
  // -------------------------------------------------------------------------
  it("enforces grapple prerequisites and applies states", async () => {
    const originalRandom = Math.random;
    Math.random = () => 0.7; // Ensure Alice beats Bob reliably

    try {
      const store = makeStore();
      const roomId = `room-grapple-${Date.now()}`;

      // Seed Alice (immense strength/brawl) and Bob (weak)
      const alice = seedPC(
        store,
        "p-alice",
        "Alice",
        { Strength: 5 },
        { Brawl: 5 },
      );
      const bob = seedPC(
        store,
        "p-bob",
        "Bob",
        { Strength: 1 },
        { Brawl: 1 },
      );

      // Seed Bob with an equipped weapon to test Disarm
      bob.state.cofd = {
        ...bob.state.cofd,
        equipment: {
          equippedWeapon: "item-sword",
          equippedArmor: null,
        },
      };
      store.create({
        id: "item-sword",
        name: "Sword",
        flags: new Set(["thing"]),
        state: {
          item: {
            class: "weapon",
            damage: 2,
            special: "slow",
          },
        },
      });

      const u = mockU({
        me: alice,
        args: ["/restrain"],
        objectStore: store,
      });
      u.here = {
        id: roomId,
        name: "Room",
        flags: new Set(["room"]),
        broadcast: () => {},
      } as any;

      u.util.target = async (_actor: any, name: string): Promise<any> => {
        const all = store.search({});
        const found = all.find((o) => o.name === name || o.id === name);
        return found ?? undefined;
      };

      // Create encounter
      const enc = await createEncounter(roomId);
      assert(enc);
      await addParticipant(enc.id, alice);
      await addParticipant(enc.id, bob);

      (u.db as any).search = async (q: Record<string, unknown>) =>
        store.search(q);
      await rollInitiative(enc.id, u);

      // Initial state: establish a grapple.
      // We mock that they are already grappled.
      alice.state.cofd_grapple = { grappleWith: "p-bob", isHolder: true };
      bob.state.cofd_grapple = { grappleWith: "p-alice", isHolder: false };

      // Test Prerequisite: Restrain fails without Hold
      await grappleExec(u);
      assertStringIncludes(
        u._sent[u._sent.length - 1],
        "You must establish a Hold before you can Restrain.",
      );

      // Test Prerequisite: Disarm fails without Control Weapon
      u.cmd.args = ["/disarm"];
      await grappleExec(u);
      assertStringIncludes(
        u._sent[u._sent.length - 1],
        "control the opponent's weapon before you can Disarm.",
      );

      // Now Alice successfully Holds
      u.cmd.args = ["/hold"];
      let broadcastMsg = "";
      u.broadcast = (msg: string) => {
        broadcastMsg += msg + "\n";
      };
      await grappleExec(u);
      assertStringIncludes(broadcastMsg, "holds Bob in a grapple!");

      // Verify encounter participant hasHold is set
      const liveEnc = await getEncounterForRoom(roomId);
      assert(liveEnc);
      const alicePart = liveEnc.participants.find(
        (p) => p.actorId === "p-alice",
      );
      assertEquals(alicePart?.hasHold, true);

      // Now Alice successfully Restrains (since hasHold is true)
      u.cmd.args = ["/restrain"];
      broadcastMsg = "";
      await grappleExec(u);
      assertStringIncludes(broadcastMsg, "fully restrains Bob!");

      // Verify Bob is immobilized (has the immobilized tilt)
      const bobObjAfterRestrain = store.get("p-bob");
      const bobSheetAfterRestrain =
        bobObjAfterRestrain?.state.cofd as CofdSheet;
      assert(
        bobSheetAfterRestrain.tilts?.some((t) => t.key === "immobilized"),
        "Bob should have immobilized tilt",
      );

      // Alice successfully Controls Weapon
      u.cmd.args = ["/control-weapon"];
      broadcastMsg = "";
      await grappleExec(u);
      assertStringIncludes(broadcastMsg, "controls Bob's weapon!");

      // Alice successfully Disarms Bob (since hasControl is true)
      u.cmd.args = ["/disarm"];
      broadcastMsg = "";
      await grappleExec(u);
      assertStringIncludes(broadcastMsg, "disarms Bob!");

      // Verify Bob's weapon is unequipped
      const bobObjAfterDisarm = store.get("p-bob");
      const bobSheetAfterDisarm =
        bobObjAfterDisarm?.state.cofd as CofdSheet;
      assertEquals(bobSheetAfterDisarm.equipment?.equippedWeapon, null);

      // Alice breaks free (releasing both, clearing tilts)
      u.cmd.args = ["/break-free"];
      broadcastMsg = "";
      await grappleExec(u);
      assertStringIncludes(broadcastMsg, "breaks free from Bob!");

      // Verify tilts and states are cleared
      const aliceObjFinal = store.get("p-alice");
      const bobObjFinal = store.get("p-bob");
      const aliceGrappleFinal = aliceObjFinal?.state.cofd_grapple as any;
      const bobGrappleFinal = bobObjFinal?.state.cofd_grapple as any;

      assertEquals(aliceGrappleFinal?.grappleWith, null);
      assertEquals(bobGrappleFinal?.grappleWith, null);

      const bobSheetFinal = bobObjFinal?.state.cofd as CofdSheet;
      assert(
        !bobSheetFinal.tilts?.some((t) => t.key === "immobilized"),
        "Immobilized tilt should be cleared",
      );
    } finally {
      Math.random = originalRandom;
    }
  });
});
