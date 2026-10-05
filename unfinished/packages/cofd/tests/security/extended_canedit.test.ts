// Exploit: a non-owner without canEdit must not be able to /abandon
// another player's Extended Action.
//
// THREAT: Cross-owner /abandon without canEdit lets any connected player
// cancel another character's ongoing research / ritual / craft.
// FIX: extAbandon checks ownerId match OR u.canEdit(u.me, owner).
// /finish, /list all, /contest also require staff.

import { assert, assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { mockPlayer, mockU } from "../helpers/mockU.ts";
import { extendedExec } from "../../src/commands/extended.ts";
import {
  createExtendedAction,
  getExtendedAction,
} from "../../src/subsystems/extended.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

describe("+extended/abandon canEdit guard", OPTS, () => {
  it("denies a non-owner without canEdit", async () => {
    const action = await createExtendedAction({
      ownerId: "owner-victim",
      ownerName: "Victim",
      roomId: "rm",
      description: "Sacred research",
      pool: "intelligence+occult",
      target: 5,
      maxRolls: 5,
    });

    const attacker = mockPlayer({ id: "attacker", name: "Mallory" });
    const u = mockU({ me: attacker, args: ["abandon", action.id], canEditResult: false });
    await extendedExec(u as unknown as Parameters<typeof extendedExec>[0]);

    const reload = await getExtendedAction(action.id);
    assertEquals(reload?.status, "active", "victim's action must still be active");
    const sent = (u as unknown as { _sent: string[] })._sent;
    assert(sent.some((s) => /Permission denied/i.test(s)), `expected permission denial; got:\n${sent.join("\n")}`);
  });

  it("allows the owner", async () => {
    const action = await createExtendedAction({
      ownerId: "owner-self",
      ownerName: "Self",
      roomId: "rm",
      description: "Own ritual",
      pool: "intelligence+occult",
      target: 5,
      maxRolls: 5,
    });

    const owner = mockPlayer({ id: "owner-self", name: "Self" });
    const u = mockU({ me: owner, args: ["abandon", action.id] });
    await extendedExec(u as unknown as Parameters<typeof extendedExec>[0]);

    const reload = await getExtendedAction(action.id);
    assertEquals(reload?.status, "abandoned");
  });
});

describe("+extended/finish requires staff", OPTS, () => {
  it("denies a non-staff player", async () => {
    const action = await createExtendedAction({
      ownerId: "owner-fin",
      ownerName: "Owner",
      roomId: "rm",
      description: "Big task",
      pool: "intelligence+occult",
      target: 50,
      maxRolls: 20,
    });

    const player = mockPlayer({ id: "p-fin", name: "Player", flags: new Set(["player", "connected"]) });
    const u = mockU({ me: player, args: ["finish", action.id] });
    await extendedExec(u as unknown as Parameters<typeof extendedExec>[0]);

    const reload = await getExtendedAction(action.id);
    assertEquals(reload?.status, "active");
    const sent = (u as unknown as { _sent: string[] })._sent;
    assert(sent.some((s) => /Permission denied/i.test(s)));
  });

  it("allows a staff member", async () => {
    const action = await createExtendedAction({
      ownerId: "owner-fin2",
      ownerName: "Owner",
      roomId: "rm",
      description: "Big task",
      pool: "intelligence+occult",
      target: 50,
      maxRolls: 20,
    });

    const admin = mockPlayer({ id: "admin", name: "Admin", flags: new Set(["player", "connected", "admin"]) });
    const u = mockU({ me: admin, args: ["finish", action.id] });
    await extendedExec(u as unknown as Parameters<typeof extendedExec>[0]);

    const reload = await getExtendedAction(action.id);
    assertEquals(reload?.status, "succeeded");
  });
});

describe("+extended/list all requires staff", OPTS, () => {
  it("denies non-staff", async () => {
    const player = mockPlayer({ id: "p-list", name: "Player" });
    const u = mockU({ me: player, args: ["list", "all"] });
    await extendedExec(u as unknown as Parameters<typeof extendedExec>[0]);
    const sent = (u as unknown as { _sent: string[] })._sent;
    assert(sent.some((s) => /Permission denied/i.test(s)));
  });
});

describe("+extended/start strips color codes from description", OPTS, () => {
  it("does not persist %c codes in description", async () => {
    const me = mockPlayer({
      id: "p-strip",
      name: "StripPlayer",
      state: {
        cofd: {
          attributes: {
            strength: 2, dexterity: 2, stamina: 2,
            intelligence: 3, wits: 2, resolve: 2,
            presence: 2, manipulation: 2, composure: 2,
          },
          skills: { occult: 2 },
          advantages: { willpowerCurrent: 4, willpowerMax: 4 },
          template: "mortal",
          specialties: {},
          powers: {},
          conditions: [],
          tilts: [],
          health: { bashing: 0, lethal: 0, aggravated: 0 },
        },
      },
    });
    const u = mockU({
      me,
      args: ["start", "intelligence+occult=5 %cr%chRedTitle%cn injection"],
    });
    await extendedExec(u as unknown as Parameters<typeof extendedExec>[0]);
    // Description from the most recently created action should not contain %c.
    const { listForOwner } = await import("../../src/subsystems/extended.ts");
    const mine = await listForOwner("p-strip");
    assert(mine.length >= 1);
    const last = mine[mine.length - 1];
    assertEquals(/%c/.test(last.description), false);
  });
});
