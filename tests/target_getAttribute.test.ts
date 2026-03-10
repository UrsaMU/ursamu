/**
 * tests/target_getAttribute.test.ts
 *
 * Tests for:
 *   - target()       from src/utils/target.ts
 *   - getAttribute() from src/utils/getAttribute.ts
 *
 * These utilities interact with the KV database via dbojs, so we create real
 * DB fixtures for each test group and clean them up afterwards.
 */
import { assertEquals } from "@std/assert";
import { target } from "../src/utils/target.ts";
import { getAttribute } from "../src/utils/getAttribute.ts";
import { dbojs, DBO } from "../src/services/Database/database.ts";
import type { IDBOBJ } from "../src/@types/IDBObj.ts";

// ---------------------------------------------------------------------------
// Shared IDs — prefixed with "ta_" to avoid collisions with other test files
// ---------------------------------------------------------------------------

const ROOM_ID  = "ta_room1";
const ACTOR_ID = "ta_actor1";
const THING_ID = "ta_thing1";
const ROOM2_ID = "ta_room2";
const THING2_ID = "ta_thing2";  // lives in ROOM2 — inaccessible from ROOM

// getAttribute fixtures
const GA_OBJ_ID    = "ta_ga_obj1";
const GA_PARENT_ID = "ta_ga_parent1";
const GA_CHILD_ID  = "ta_ga_child1";
const GA_DEEP_ID   = "ta_ga_deep1";  // child of CHILD which has no attr; grandparent does

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

async function cleanup(...ids: string[]) {
  for (const id of ids) await dbojs.delete({ id }).catch(() => {});
}

// ---------------------------------------------------------------------------
// target() tests
// ---------------------------------------------------------------------------

Deno.test({
  name: "target() — here / room keyword returns actor location",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const room  = await dbojs.create({ id: ROOM_ID,  flags: "room",   data: { name: "Test Room" } });
    const actor = await dbojs.create({ id: ACTOR_ID, flags: "player", data: { name: "TestActor" }, location: ROOM_ID });

    const byHere = await target(actor, "here");
    const byRoom = await target(actor, "room");

    assertEquals((byHere as IDBOBJ | undefined)?.id, room.id);
    assertEquals((byRoom as IDBOBJ | undefined)?.id, room.id);

    await cleanup(ROOM_ID, ACTOR_ID);
  },
});

Deno.test({
  name: "target() — 'me' and 'self' return the actor itself",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const actor = await dbojs.create({ id: ACTOR_ID, flags: "player", data: { name: "TestActor" }, location: ROOM_ID });

    const byMe   = await target(actor, "me");
    const bySelf = await target(actor, "self");

    // target() returns `en` directly for "me"/"self" — same object reference
    assertEquals(byMe   !== undefined && byMe !== false && (byMe as IDBOBJ).id,   ACTOR_ID);
    assertEquals(bySelf !== undefined && bySelf !== false && (bySelf as IDBOBJ).id, ACTOR_ID);

    await cleanup(ACTOR_ID);
  },
});

Deno.test({
  name: "target() — dbref '#ID' lookup ignores location",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const _room  = await dbojs.create({ id: ROOM_ID,  flags: "room",   data: { name: "Test Room" } });
    const actor  = await dbojs.create({ id: ACTOR_ID, flags: "player", data: { name: "TestActor" }, location: ROOM_ID });
    const thing  = await dbojs.create({ id: THING_ID, flags: "thing",  data: { name: "RedBall"  }, location: ROOM_ID });

    const found = await target(actor, `#${THING_ID}`);

    assertEquals(found !== undefined && found !== false && (found as IDBOBJ).id, THING_ID);
    assertEquals(found !== undefined && found !== false && (found as IDBOBJ).data?.name, "RedBall");

    await cleanup(ROOM_ID, ACTOR_ID, THING_ID);
  },
});

Deno.test({
  name: "target() — name search finds object in the same room (no global flag)",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const _room  = await dbojs.create({ id: ROOM_ID,  flags: "room",   data: { name: "Test Room" } });
    const actor  = await dbojs.create({ id: ACTOR_ID, flags: "player", data: { name: "TestActor" }, location: ROOM_ID });
    const thing  = await dbojs.create({ id: THING_ID, flags: "thing",  data: { name: "RedBall"  }, location: ROOM_ID });

    const found = await target(actor, "RedBall");

    assertEquals(found !== undefined && found !== false && (found as IDBOBJ).id, THING_ID);

    await cleanup(ROOM_ID, ACTOR_ID, THING_ID);
  },
});

Deno.test({
  name: "target() — name search returns undefined for nonexistent name",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const _room  = await dbojs.create({ id: ROOM_ID,  flags: "room",   data: { name: "Test Room" } });
    const actor  = await dbojs.create({ id: ACTOR_ID, flags: "player", data: { name: "TestActor" }, location: ROOM_ID });

    const found = await target(actor, "ThisDoesNotExist99999");

    assertEquals(found, undefined);

    await cleanup(ROOM_ID, ACTOR_ID);
  },
});

Deno.test({
  name: "target() — global=true finds object in a different room",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const _room1  = await dbojs.create({ id: ROOM_ID,   flags: "room",  data: { name: "Room One" } });
    const _room2  = await dbojs.create({ id: ROOM2_ID,  flags: "room",  data: { name: "Room Two" } });
    const actor   = await dbojs.create({ id: ACTOR_ID,  flags: "player",data: { name: "TestActor" }, location: ROOM_ID });
    const remote  = await dbojs.create({ id: THING2_ID, flags: "thing", data: { name: "BlueCube"  }, location: ROOM2_ID });

    const foundGlobal = await target(actor, "BlueCube", true);
    const foundLocal  = await target(actor, "BlueCube");       // no global flag

    assertEquals(foundGlobal !== undefined && foundGlobal !== false && (foundGlobal as IDBOBJ).id, THING2_ID);
    assertEquals(foundLocal, undefined, "Without global=true, object in a different room is not accessible");

    await cleanup(ROOM_ID, ROOM2_ID, ACTOR_ID, THING2_ID);
  },
});

Deno.test({
  name: "target() — actor can target any object by dbref (#id), bypassing location checks",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const _room = await dbojs.create({ id: ROOM_ID,  flags: "room",   data: { name: "MyRoom" } });
    const actor = await dbojs.create({ id: ACTOR_ID, flags: "player", data: { name: "TestActor" }, location: ROOM_ID });

    // Dbref lookup returns the object regardless of location
    const found = await target(actor, `#${ROOM_ID}`);
    assertEquals((found as IDBOBJ | undefined)?.id, ROOM_ID);

    await cleanup(ROOM_ID, ACTOR_ID);
  },
});

Deno.test({
  name: "target() — empty string returns actor's room (same as 'here')",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const _room  = await dbojs.create({ id: ROOM_ID,  flags: "room",   data: { name: "Test Room" } });
    const actor  = await dbojs.create({ id: ACTOR_ID, flags: "player", data: { name: "TestActor" }, location: ROOM_ID });

    const found = await target(actor, "");

    assertEquals(found !== undefined && found !== false && (found as IDBOBJ).id, ROOM_ID);

    await cleanup(ROOM_ID, ACTOR_ID);
  },
});

Deno.test({
  name: "target() — actor with no location and 'here' keyword returns undefined",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const homeless = await dbojs.create({ id: ACTOR_ID, flags: "player", data: { name: "Homeless" } });

    const found = await target(homeless, "here");

    assertEquals(found, undefined);

    await cleanup(ACTOR_ID);
  },
});

// ---------------------------------------------------------------------------
// getAttribute() tests
// ---------------------------------------------------------------------------

Deno.test({
  name: "getAttribute() — direct attribute is found on the object",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const obj = await dbojs.create({
      id: GA_OBJ_ID,
      flags: "thing",
      data: {
        name: "Child",
        attributes: [{ name: "color", value: "blue", setter: GA_PARENT_ID }],
      },
    });

    const attr = await getAttribute(obj, "color");

    assertEquals(attr !== undefined, true);
    assertEquals(attr?.name,  "color");
    assertEquals(attr?.value, "blue");
    assertEquals(attr?.setter, GA_PARENT_ID);

    await cleanup(GA_OBJ_ID);
  },
});

Deno.test({
  name: "getAttribute() — lookup is case-insensitive",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const obj = await dbojs.create({
      id: GA_OBJ_ID,
      flags: "thing",
      data: {
        name: "Child",
        attributes: [{ name: "color", value: "blue", setter: GA_OBJ_ID }],
      },
    });

    const upperResult = await getAttribute(obj, "COLOR");
    const mixedResult = await getAttribute(obj, "CoLoR");

    assertEquals(upperResult?.value, "blue");
    assertEquals(mixedResult?.value, "blue");

    await cleanup(GA_OBJ_ID);
  },
});

Deno.test({
  name: "getAttribute() — returns undefined for an attribute not on the object or parents",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const obj = await dbojs.create({
      id: GA_OBJ_ID,
      flags: "thing",
      data: {
        name: "Child",
        attributes: [{ name: "color", value: "blue", setter: GA_OBJ_ID }],
      },
    });

    const attr = await getAttribute(obj, "nonexistent");

    assertEquals(attr, undefined);

    await cleanup(GA_OBJ_ID);
  },
});

Deno.test({
  name: "getAttribute() — inherits attribute from parent when not on object",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const parent = await dbojs.create({
      id: GA_PARENT_ID,
      flags: "thing",
      data: {
        name: "Parent",
        attributes: [
          { name: "size",  value: "large", setter: GA_PARENT_ID },
          { name: "color", value: "red",   setter: GA_PARENT_ID },
        ],
      },
    });
    const child = await dbojs.create({
      id: GA_CHILD_ID,
      flags: "thing",
      data: { name: "ChildNoAttr", parent: GA_PARENT_ID },
    });

    const sizeAttr  = await getAttribute(child, "size");
    const colorAttr = await getAttribute(child, "color");

    assertEquals(sizeAttr?.value,  "large", "Should inherit 'size' from parent");
    assertEquals(colorAttr?.value, "red",   "Should inherit 'color' from parent");

    await cleanup(GA_PARENT_ID, GA_CHILD_ID);
  },
});

Deno.test({
  name: "getAttribute() — child's own attribute shadows parent's attribute of same name",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const parent = await dbojs.create({
      id: GA_PARENT_ID,
      flags: "thing",
      data: {
        name: "Parent",
        attributes: [{ name: "color", value: "red", setter: GA_PARENT_ID }],
      },
    });
    const child = await dbojs.create({
      id: GA_CHILD_ID,
      flags: "thing",
      data: {
        name: "Child",
        parent: GA_PARENT_ID,
        attributes: [{ name: "color", value: "blue", setter: GA_CHILD_ID }],
      },
    });

    const attr = await getAttribute(child, "color");

    assertEquals(attr?.value, "blue", "Child's own attribute must shadow parent's");

    await cleanup(GA_PARENT_ID, GA_CHILD_ID);
  },
});

Deno.test({
  name: "getAttribute() — two-level inheritance: grandchild inherits from grandparent",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const grandparent = await dbojs.create({
      id: GA_PARENT_ID,
      flags: "thing",
      data: {
        name: "Grandparent",
        attributes: [{ name: "material", value: "wood", setter: GA_PARENT_ID }],
      },
    });
    const parent = await dbojs.create({
      id: GA_CHILD_ID,
      flags: "thing",
      data: { name: "Parent", parent: GA_PARENT_ID },
    });
    const grandchild = await dbojs.create({
      id: GA_DEEP_ID,
      flags: "thing",
      data: { name: "Grandchild", parent: GA_CHILD_ID },
    });

    const attr = await getAttribute(grandchild, "material");

    assertEquals(attr?.value, "wood", "Grandchild should inherit 'material' from grandparent via recursive lookup");

    await cleanup(GA_PARENT_ID, GA_CHILD_ID, GA_DEEP_ID);
  },
});

Deno.test({
  name: "getAttribute() — object with no attributes and no parent returns undefined",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const bare = await dbojs.create({
      id: GA_OBJ_ID,
      flags: "thing",
      data: { name: "Bare" },
    });

    const attr = await getAttribute(bare, "anything");

    assertEquals(attr, undefined);

    await cleanup(GA_OBJ_ID);
    await DBO.close();
  },
});
