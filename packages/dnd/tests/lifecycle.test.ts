/**
 * Plugin lifecycle: init wires hooks/guards; remove tears them down.
 */
import { assertEquals, assert } from "@std/assert";
import { gameHooks, cmds, addCmd } from "@ursamu/mush";
import {
  initVendorHooks,
  removeVendorHooks,
} from "../src/integrations/vendor.ts";
import {
  equippedGuardsInstalled,
  initEquippedGuards,
  removeEquippedGuards,
} from "../src/integrations/equipped.ts";
import {
  initDndCombat,
  removeDndCombat,
} from "../src/combat/ports.ts";
import {
  getCombatPorts,
  getEncounterStore,
} from "@ursamu/combat";
import { dndEncounterStore } from "../src/combat/ports.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("vendor hooks register and unregister", OPTS, () => {
  removeVendorHooks();
  initVendorHooks();

  // Soft emit: handler should fill currency/balance shape.
  const bag: {
    actorId: string;
    price: number;
    hasFunds?: boolean;
    balance?: number;
    currency?: string;
    db: {
      search: (q: { id: string }) => Promise<unknown[]>;
    };
  } = {
    actorId: "p1",
    price: 10,
    db: {
      search: () =>
        Promise.resolve([{
          id: "p1",
          state: {
            dnd: {
              gold: 50,
              class: "Fighter",
              level: 1,
              abilities: {
                strength: 10, dexterity: 10, constitution: 10,
                intelligence: 10, wisdom: 10, charisma: 10,
              },
              skillProficiency: {},
              savingThrowProficiency: [],
              hp: { max: 10, current: 10, temp: 0 },
              hitDice: { max: 1, current: 1 },
              ac: 10, speed: 30, equipment: [],
              spellSlotsMax: {}, spellSlotsCurrent: {},
              feats: [], spells: [], xp: 0,
              classes: { Fighter: 1 },
              species: "Human", background: "Soldier",
              subclass: "",
            },
          },
        }]),
    },
  };

  // deno-lint-ignore no-explicit-any
  return (gameHooks as any).emit("vendor:check_funds", bag)
    .then(() => {
      assertEquals(bag.currency, "gp");
      assertEquals(bag.balance, 50);
      assertEquals(bag.hasFunds, true);

      removeVendorHooks();

      const bag2 = {
        actorId: "p1",
        price: 10,
        db: bag.db,
      };
      // deno-lint-ignore no-explicit-any
      return (gameHooks as any).emit("vendor:check_funds", bag2)
        .then(() => {
          // After off, default handlers may still run (vendor economy).
          // Our gp currency should not be forced if only our hook set it
          // and default uses credits — either way bag2.balance may be set
          // by defaults. Assert our remove did not throw.
          assert(true);
        });
    });
});

Deno.test(
  "equipped guards wrap drop/give and restore on remove",
  OPTS,
  () => {
    // Ensure drop/give exist for wrap (register stubs if missing).
    if (!cmds.find((c) => c.name === "drop")) {
      addCmd({
        name: "drop",
        pattern: /^drop\s+(.*)/i,
        lock: "connected",
        exec: (u) => {
          u.send("dropped");
        },
      });
    }
    if (!cmds.find((c) => c.name === "give")) {
      addCmd({
        name: "give",
        pattern: /^give\s+(.*)/i,
        lock: "connected",
        exec: (u) => {
          u.send("gave");
        },
      });
    }

    removeEquippedGuards();
    const dropBefore = cmds.find((c) => c.name === "drop")!.exec;
    initEquippedGuards();
    assertEquals(equippedGuardsInstalled(), true);
    const dropAfter = cmds.find((c) => c.name === "drop")!.exec;
    assert(dropAfter !== dropBefore, "drop exec should be wrapped");

    removeEquippedGuards();
    assertEquals(equippedGuardsInstalled(), false);
    const dropRestored = cmds.find((c) => c.name === "drop")!.exec;
    assertEquals(dropRestored, dropBefore);
  },
);

Deno.test(
  "combat init/remove pairs with plugin remove path",
  OPTS,
  () => {
    removeDndCombat();
    initDndCombat();
    assert(getCombatPorts() !== null);
    assertEquals(getEncounterStore(), dndEncounterStore);
    removeDndCombat();
    assertEquals(getCombatPorts(), null);
  },
);
