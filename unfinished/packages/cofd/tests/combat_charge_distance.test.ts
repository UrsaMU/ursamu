// Charge feasibility -- attacker who has already moved this round cannot charge.

import { assert, assertEquals } from "@std/assert";
import {
  addParticipant,
  computeSpeed,
  createEncounter,
  encounterDb,
  getEncounterForRoom,
  rollInitiative,
  setMoved,
} from "../src/combat/encounter.ts";
import { mockPlayer, mockU, MockObjectStore } from "./helpers/mockU.ts";
import { defaultSheet } from "../src/stats/index.ts";
import { attackExec } from "../src/commands/attack.ts";
import type { CofdSheet } from "../src/stats/sheet.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function seed(store: MockObjectStore, id: string, name: string) {
  const sheet = defaultSheet();
  sheet.attributes.strength = 3;
  sheet.attributes.dexterity = 3;
  sheet.skills.brawl = 2;
  sheet.skills.athletics = 2;
  const obj = mockPlayer({ id, name, state: { cofd: sheet } });
  const rawStore = (store as unknown as {
    store: Map<string, Record<string, unknown>>;
  }).store;
  rawStore.set(id, obj as unknown as Record<string, unknown>);
  return obj;
}

Deno.test("computeSpeed: Str + Dex + Size", OPTS, () => {
  const sheet: CofdSheet = defaultSheet();
  sheet.attributes.strength = 3;
  sheet.attributes.dexterity = 4;
  sheet.advantages.size = 5;
  assertEquals(computeSpeed(sheet), 12);
});

async function runCharge(moved: boolean) {
  const store = new MockObjectStore();
  const aId = "a-" + crypto.randomUUID();
  const bId = "b-" + crypto.randomUUID();
  const a = seed(store, aId, "Alice");
  const b = seed(store, bId, "Bob");
  const u = mockU({ me: a, objectStore: store, args: ["Bob/charge"] });
  const roomId = "room-charge-" + crypto.randomUUID();
  const enc = await createEncounter(roomId);
  await addParticipant(enc.id, a);
  await addParticipant(enc.id, b);

  (u as unknown as { here: Record<string, unknown> }).here = {
    id: roomId,
    broadcast: () => {},
  };
  (u.db as unknown as Record<string, unknown>).search = (
    q: Record<string, unknown>,
  ) => {
    if (q.id) {
      const f = store.get(q.id as string);
      return Promise.resolve(f ? [f] : []);
    }
    return Promise.resolve(store.search(q));
  };
  (u.util as unknown as Record<string, unknown>).target = () =>
    Promise.resolve(b);

  await rollInitiative(enc.id, u);
  if (moved) await setMoved(enc.id, a.id, true);
  const fresh = await getEncounterForRoom(roomId);
  assert(fresh);
  const idx = fresh.participants.findIndex((p) => p.actorId === a.id);
  await encounterDb.update(
    { id: enc.id } as unknown as Record<string, unknown>,
    { ...fresh, turnIdx: idx },
  );

  await attackExec(u);
  return (u as unknown as { _sent: string[] })._sent;
}

Deno.test("/charge after moving is rejected", OPTS, async () => {
  const sent = await runCharge(true);
  assert(
    sent.some((m: string) => /already moved.*can't charge/i.test(m)),
    "expected charge-after-move refusal, got: " + sent.join(" | "),
  );
});

Deno.test("/charge before moving is allowed", OPTS, async () => {
  const sent = await runCharge(false);
  assert(
    !sent.some((m: string) => /already moved/i.test(m)),
    "did not expect charge-after-move refusal, got: " + sent.join(" | "),
  );
  // The attack should have produced output.
  assert(
    sent.some((m: string) => /ROLL DETAIL/i.test(m)),
    "expected an attack roll detail",
  );
});
