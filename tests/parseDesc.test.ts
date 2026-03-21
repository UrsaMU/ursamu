/**
 * tests/parseDesc.test.ts
 *
 * Tests for src/utils/parseDesc.ts
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { parseDesc } from "../src/utils/parseDesc.ts";
import { dbojs, DBO } from "../src/services/Database/database.ts";
import type { IDBObj } from "../src/@types/UrsamuSDK.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const ROOM_ID  = "pd_room1";
const ACTOR_ID = "pd_actor1";
const OBJ_ID   = "pd_obj1";

async function cleanup(...ids: string[]) {
  for (const id of ids) await dbojs.delete({ id }).catch(() => {});
}

function makeActor(overrides: Partial<IDBObj> = {}): IDBObj {
  return {
    id: ACTOR_ID,
    name: "Alice",
    flags: new Set(["player", "connected"]),
    state: { name: "Alice" },
    contents: [],
    ...overrides,
  };
}

function makeTarget(overrides: Partial<IDBObj> = {}): IDBObj {
  return {
    id: ROOM_ID,
    name: "The Garden",
    flags: new Set(["room"]),
    state: {},
    contents: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// %0 substitution
// ---------------------------------------------------------------------------

Deno.test("parseDesc — %0 replaced with actor display name", OPTS, async () => {
  const actor = makeActor();
  const target = makeTarget();
  const result = await parseDesc("Hello, %0!", actor, target);
  assertEquals(result, "Hello, Alice!");
});

Deno.test("parseDesc — %0 uses moniker when present", OPTS, async () => {
  const actor = makeActor({ state: { name: "Alice", moniker: "Duchess" } });
  const target = makeTarget();
  const result = await parseDesc("Welcome, %0.", actor, target);
  assertEquals(result, "Welcome, Duchess.");
});

Deno.test("parseDesc — %1–%9 replaced with empty string", OPTS, async () => {
  const actor = makeActor();
  const target = makeTarget();
  const result = await parseDesc("%1 and %5 and %9", actor, target);
  assertEquals(result, " and  and ");
});

// ---------------------------------------------------------------------------
// No substitutions — passthrough
// ---------------------------------------------------------------------------

Deno.test("parseDesc — no patterns returns string unchanged", OPTS, async () => {
  const actor = makeActor();
  const target = makeTarget();
  const desc = "A quiet garden with a stone fountain.";
  const result = await parseDesc(desc, actor, target);
  assertEquals(result, desc);
});

// ---------------------------------------------------------------------------
// [u(obj/attr)] inline evaluation
// ---------------------------------------------------------------------------

Deno.test("parseDesc — [u(obj/GREET, World)] is evaluated and substituted", OPTS, async () => {
  const _room = await dbojs.create({
    id: ROOM_ID,
    flags: "room",
    data: { name: "Garden" },
  });

  const _actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player connected",
    data: { name: "Alice" },
    location: ROOM_ID,
  });

  const obj = await dbojs.create({
    id: OBJ_ID,
    flags: "thing",
    data: {
      name: "Sign",
      attributes: [
        {
          name: "GREET",
          value: `return "Hello, " + u.cmd.args[0];`,
          setter: ACTOR_ID,
          type: "attribute",
        },
      ],
    },
    location: ROOM_ID,
  });

  const actor = makeActor();
  const target = makeTarget();
  const desc = `A sign reads: [u(${obj.id}/GREET, World)]`;
  const result = await parseDesc(desc, actor, target);

  assertStringIncludes(result, "Hello, World");
  assertEquals(result, "A sign reads: Hello, World");

  await cleanup(ROOM_ID, ACTOR_ID, OBJ_ID);
});

// ---------------------------------------------------------------------------
// Malformed [u(...)] — missing slash (no obj/attr separator)
// ---------------------------------------------------------------------------

Deno.test("parseDesc — malformed [u(noSlash)] returns empty string, no crash", OPTS, async () => {
  const actor = makeActor();
  const target = makeTarget();
  const desc = "Before [u(badformat)] After";
  const result = await parseDesc(desc, actor, target);
  assertEquals(result, "Before  After");
});

// ---------------------------------------------------------------------------
// Non-existent object in [u()] — empty string, no crash
// ---------------------------------------------------------------------------

Deno.test("parseDesc — [u()] with non-existent object returns empty, no crash", OPTS, async () => {
  const actor = makeActor();
  const target = makeTarget();
  const desc = "Before [u(pd_ghost9999/GREET)] After";
  const result = await parseDesc(desc, actor, target);
  assertEquals(result, "Before  After");

  await DBO.close();
});
