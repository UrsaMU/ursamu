/**
 * Privilege ranks, canEdit hierarchy, attribute visibility.
 */
import { assertEquals } from "jsr:@std/assert@^0.224.0";
import {
  privRank,
  canEditObject,
  canSeeAttr,
  canSetAttr,
} from "../src/world/permissions.ts";
import { dbojs } from "../src/world/dbobjs.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("privRank: ladder", OPTS, () => {
  assertEquals(privRank("player connected"), 0);
  assertEquals(privRank("builder player"), 7);
  assertEquals(privRank("staff player"), 8);
  assertEquals(privRank("wizard player"), 9);
  assertEquals(privRank("superuser player connected"), 10);
  assertEquals(privRank(new Set(["admin", "player"])), 9);
});

Deno.test("canEditObject: owner and self", OPTS, async () => {
  const mortal = {
    id: "7",
    flags: "player connected",
  };
  const thing = {
    id: "20",
    flags: "thing",
    data: { owner: "7", name: "Lamp" },
  };
  assertEquals(await canEditObject(mortal, thing), true);
  assertEquals(await canEditObject(mortal, { ...mortal }), true);
});

Deno.test(
  "canEditObject: lower rank cannot edit higher owner's object",
  OPTS,
  async () => {
    const staff = { id: "8", flags: "staff player connected" };
    const wizThing = {
      id: "21",
      flags: "thing",
      // Owner is a wizard — look up will miss in empty DB → rank 0.
      // Pass owner flags via a player-shaped owner object by id match:
      data: { owner: "2", name: "StaffOnly" },
    };
    // Without owner in DB, ownerPrivRank returns 0 → staff (8) > 0.
    // Simulate higher owner by making target a player wizard (self-owned).
    const wizardPlayer = {
      id: "2",
      flags: "wizard player connected",
      data: {},
    };
    assertEquals(await canEditObject(staff, wizardPlayer), false);

    const su = { id: "1", flags: "superuser player connected" };
    assertEquals(await canEditObject(su, wizardPlayer), true);

    // Staff cannot edit wizard-owned thing when owner is the wizard.
    // ownerId points at wizard player above once we store owner flags
    // by using target that is wizard-owned with owner id = wizard.
    // canEditObject loads owner from DB — stub via target.id === owner
    // by treating wiz as the object itself (player).
    assertEquals(await canEditObject(staff, wizardPlayer), false);
    assertEquals(
      await canEditObject(su, {
        id: "99",
        flags: "thing",
        data: { owner: "2" },
      }),
      // owner not in DB → rank 0 → su wins
      true,
    );
  },
);

Deno.test("canEditObject: wizard cannot edit superuser", OPTS, async () => {
  const wiz = { id: "3", flags: "wizard player" };
  const su = {
    id: "1",
    flags: "superuser player",
    data: {},
  };
  assertEquals(await canEditObject(wiz, su), false);
  assertEquals(await canEditObject(su, wiz), true);
});

Deno.test(
  "canEditObject: equal rank peers may edit each other",
  OPTS,
  async () => {
    const suA = { id: "su_a", flags: "superuser player" };
    const suB = {
      id: "su_b",
      flags: "superuser player",
      data: {},
    };
    assertEquals(await canEditObject(suA, suB), true);
    assertEquals(await canEditObject(suB, suA), true);

    const wizA = { id: "wiz_a", flags: "wizard player" };
    const wizB = { id: "wiz_b", flags: "wizard player", data: {} };
    assertEquals(await canEditObject(wizA, wizB), true);

    const builder = { id: "b1", flags: "builder player" };
    const staffPlayer = {
      id: "s1",
      flags: "staff player",
      data: {},
    };
    // Builder (7) cannot edit staff (8); staff can edit builder.
    assertEquals(await canEditObject(builder, staffPlayer), false);
    assertEquals(
      await canEditObject(staffPlayer, {
        id: "b1",
        flags: "builder player",
        data: {},
      }),
      true,
    );
  },
);

Deno.test(
  "canEditObject: staff cannot edit wizard-owned thing (DB owner)",
  OPTS,
  async () => {
    const wizId = "perm_wiz_owner";
    const thingId = "perm_wiz_thing";
    const priorW = await dbojs.queryOne({ id: wizId });
    if (priorW) await dbojs.delete({ id: wizId });
    const priorT = await dbojs.queryOne({ id: thingId });
    if (priorT) await dbojs.delete({ id: thingId });

    await dbojs.create({
      id: wizId,
      flags: "wizard player",
      data: { name: "Wiz" },
    });
    await dbojs.create({
      id: thingId,
      flags: "thing",
      data: { name: "Vault", owner: wizId },
    });

    const staff = { id: "perm_staff", flags: "staff player" };
    const wiz = { id: wizId, flags: "wizard player" };
    const thing = {
      id: thingId,
      flags: "thing",
      data: { owner: wizId },
    };

    assertEquals(await canEditObject(staff, thing), false);
    assertEquals(await canEditObject(wiz, thing), true);

    await dbojs.delete({ id: thingId });
    await dbojs.delete({ id: wizId });
  },
);

Deno.test("canSeeAttr / canSetAttr: underscore and wizard", OPTS, () => {
  const mortal = "player connected";
  const wiz = "wizard player";
  const builder = "builder player";

  assertEquals(canSeeAttr(mortal, "_INTERNAL", []), false);
  assertEquals(canSetAttr(mortal, "_INTERNAL", []), false);
  assertEquals(canSeeAttr(builder, "_INTERNAL", []), true);
  assertEquals(canSetAttr(builder, "_INTERNAL", []), true);

  assertEquals(canSeeAttr(mortal, "DESC", ["wizard"]), false);
  assertEquals(canSetAttr(mortal, "DESC", ["wizard"]), false);
  assertEquals(canSeeAttr(builder, "DESC", ["wizard"]), false);
  assertEquals(canSetAttr(builder, "DESC", ["wizard"]), false);
  assertEquals(canSeeAttr(wiz, "DESC", ["wizard"]), true);
  assertEquals(canSetAttr(wiz, "DESC", ["wizard"]), true);

  // Owner mortal still blocked on _ and wizard attrs
  assertEquals(canSeeAttr(mortal, "SHORT-DESC", []), true);
  assertEquals(canSetAttr(mortal, "SHORT-DESC", []), true);
});
