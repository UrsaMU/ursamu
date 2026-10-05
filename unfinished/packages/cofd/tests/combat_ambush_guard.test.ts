// +combat/ambush must not mutate a target who is not actually a participant
// in the encounter. Originally /ambush wrote applyDefense + setSurprised
// against ANY named target in the room, even one who hadn't joined combat.

import { assert, assertEquals } from "@std/assert";
import {
  addParticipant,
  createEncounter,
  getEncounterForRoom,
} from "../src/combat/encounter.ts";
import { mockPlayer, mockU, MockObjectStore } from "./helpers/mockU.ts";
import { defaultSheet } from "../src/stats/index.ts";
import { combatExec } from "../src/commands/combat.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function makeChar(store: MockObjectStore, id: string, name: string) {
  const sheet = defaultSheet();
  const me = mockPlayer({ id, name, state: { cofd: sheet } });
  // deno-lint-ignore no-explicit-any
  (store as any).store.set(id, me);
  return me;
}

Deno.test("/ambush does not mutate a non-participant target", OPTS, async () => {
  const store = new MockObjectStore();
  const attackerId = "amb-atk-" + crypto.randomUUID();
  const victimId = "amb-vic-" + crypto.randomUUID();
  const attacker = makeChar(store, attackerId, "Attacker");
  const victim = makeChar(store, victimId, "Victim");

  const roomId = "room-ambush-" + crypto.randomUUID();
  const enc = await createEncounter(roomId);
  // Only the attacker is a participant -- the victim has NOT joined combat.
  await addParticipant(enc.id, attacker);

  const u = mockU({ me: attacker, objectStore: store, args: ["ambush", "Victim"] });
  // deno-lint-ignore no-explicit-any
  (u as any).here = { id: roomId, broadcast: () => {} };
  u.util.target = () => Promise.resolve(victim);

  await combatExec(u);

  const live = await getEncounterForRoom(roomId);
  assert(live);
  // The victim was never a participant, so the participants array must not
  // suddenly contain them with surprised/appliedDefense state.
  const vp = live.participants.find((p) => p.actorId === victimId);
  assertEquals(vp, undefined, "non-participant should not be added by ambush");
  // The output should still be narrative -- look for an ambush header so
  // we know the command ran.
  const out = u._sent.join("\n");
  // Should error cleanly without producing the ambush roll table.
  assert(
    out.toLowerCase().includes("not in this encounter") ||
      out.toLowerCase().includes("not a participant"),
    "ambush should refuse a non-participant target: " + out,
  );
  assert(
    !out.includes("A M B U S H") && !out.includes("Ambush succeeds"),
    "ambush roll table must not be shown for a non-participant: " + out,
  );
});
