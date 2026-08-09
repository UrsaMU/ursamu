/**
 * Combat registration: init wires store + ports; remove tears down.
 */
import { assertEquals, assertExists } from "@std/assert";
import {
  getCombatPorts,
  getEncounterStore,
} from "@ursamu/combat";
import {
  dndEncounterStore,
  initDndCombat,
  makeDndHostPorts,
  makeDndPorts,
  removeDndCombat,
} from "../src/combat/ports.ts";
import { defaultSheet } from "../src/stats/dnd_sheet.ts";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("initDndCombat registers ports and store", OPTS, () => {
  removeDndCombat();
  initDndCombat();
  const ports = getCombatPorts();
  assertExists(ports);
  assertExists(ports.loadActor);
  assertExists(ports.executeAction);
  assertExists(ports.rollInitiative);
  assertEquals(getEncounterStore(), dndEncounterStore);
  removeDndCombat();
});

Deno.test("removeDndCombat unregisters ports", OPTS, () => {
  initDndCombat();
  assertExists(getCombatPorts());
  removeDndCombat();
  assertEquals(getCombatPorts(), null);
});

Deno.test(
  "makeDndPorts exposes rollInitiative from sheet Dex",
  OPTS,
  async () => {
    const sheet = defaultSheet();
    sheet.abilities.dexterity = 18; // +4
    const actor: IDBObj = {
      id: "init-pc",
      name: "Swift",
      flags: new Set(["player", "connected"]),
      location: "r1",
      contents: [],
      state: { dnd: sheet },
    };
    const u = {
      me: actor,
      here: { id: "r1", broadcast: () => {} },
      db: {
        search: (q: { id?: string }) =>
          Promise.resolve(
            q.id === actor.id ? [actor] : [],
          ),
        modify: () => Promise.resolve(),
      },
      send: () => {},
      util: {
        stripSubs: (s: string) => s,
        displayName: (o: { name?: string }) => o.name ?? "?",
      },
      cmd: { name: "", original: "", args: [], switches: [] },
    } as unknown as IUrsamuSDK;

    const ports = makeDndPorts(u);
    assertExists(ports.rollInitiative);
    const n = await ports.rollInitiative!("init-pc");
    // d20 (1-20) + Dex 4 → 5..24
    assertEquals(n >= 5 && n <= 24, true);
  },
);

Deno.test("makeDndHostPorts is a full CombatPorts", OPTS, () => {
  const ports = makeDndHostPorts();
  assertExists(ports.loadActor);
  assertExists(ports.executeAction);
  assertExists(ports.broadcast);
  assertExists(ports.rollInitiative);
  assertExists(ports.onResolved);
  assertExists(ports.afterAction);
});
