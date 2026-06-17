// +combat/recover -- Beaten Down state recovers when 1 Willpower is spent.

import { assert, assertEquals } from "@std/assert";
import {
  addParticipant,
  createEncounter,
  getEncounterForRoom,
  setBeatenDown,
} from "../src/combat/encounter.ts";
import { mockPlayer, mockU, MockObjectStore } from "./helpers/mockU.ts";
import { defaultSheet } from "../src/stats/index.ts";
import { combatExec } from "../src/commands/combat.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function makeMe(store: MockObjectStore, id: string, wp: number) {
  const sheet = defaultSheet();
  sheet.advantages.willpowerMax = 5;
  sheet.advantages.willpowerCurrent = wp;
  const me = mockPlayer({ id, name: "Riley", state: { cofd: sheet } });
  // deno-lint-ignore no-explicit-any
  (store as any).store.set(id, me);
  return me;
}

Deno.test("/recover with Willpower clears Beaten Down", OPTS, async () => {
  const store = new MockObjectStore();
  const id = "rec-me-" + crypto.randomUUID();
  const me = makeMe(store, id, 3);
  const roomId = "room-recover-1-" + crypto.randomUUID();
  const enc = await createEncounter(roomId);
  await addParticipant(enc.id, me);
  await setBeatenDown(enc.id, me.id, true);

  const u = mockU({ me, objectStore: store, args: ["recover", ""] });
  // deno-lint-ignore no-explicit-any
  (u as any).here = { id: roomId, broadcast: () => {} };

  await combatExec(u);

  const live = await getEncounterForRoom(roomId);
  assert(live);
  const p = live.participants.find((x) => x.actorId === me.id);
  assertEquals(p?.beatenDown, false, "beatenDown should clear");
  // deno-lint-ignore no-explicit-any
  const dbCalls = (u as any)._dbCalls as unknown[][];
  const wpWrite = dbCalls.find((c) => {
    const data = c[2] as Record<string, unknown> | undefined;
    return !!(data && Object.prototype.hasOwnProperty.call(data, "state.cofd"));
  });
  assert(wpWrite, "expected a state.cofd write decrementing willpower");
  // deno-lint-ignore no-explicit-any
  const written = (wpWrite[2] as any)["state.cofd"];
  assertEquals(written.advantages.willpowerCurrent, 2, "willpower decremented");
});

Deno.test("/recover with 0 Willpower rejects", OPTS, async () => {
  const store = new MockObjectStore();
  const id = "rec-me-" + crypto.randomUUID();
  const me = makeMe(store, id, 0);
  const roomId = "room-recover-2-" + crypto.randomUUID();
  const enc = await createEncounter(roomId);
  await addParticipant(enc.id, me);
  await setBeatenDown(enc.id, me.id, true);

  const u = mockU({ me, objectStore: store, args: ["recover", ""] });
  // deno-lint-ignore no-explicit-any
  (u as any).here = { id: roomId, broadcast: () => {} };
  await combatExec(u);

  const live = await getEncounterForRoom(roomId);
  assert(live);
  const p = live.participants.find((x) => x.actorId === me.id);
  assertEquals(p?.beatenDown, true, "still beaten down without WP");
  // deno-lint-ignore no-explicit-any
  const sent = (u as any)._sent as string[];
  assert(sent.some((m: string) => /no willpower/i.test(m)), "expected refusal message");
});
