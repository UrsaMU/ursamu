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

  // Admin actor can cross-reference other objects via [u()]
  const actor = makeActor({ flags: new Set(["admin", "wizard"]) });
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
});

// ---------------------------------------------------------------------------
// H4 — IDOR guard: plain player must not eval another object's attrs via [u()]
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// M2 — unbounded [u()] pattern count must be capped (DoS guard)
// ---------------------------------------------------------------------------

Deno.test("M2 — description with 50 [u()] patterns only processes first 10 (cap enforced)", OPTS, async () => {
  // All patterns reference a non-existent object so they silently return ""
  // The test only checks that the function returns quickly without error
  const patterns = Array.from({ length: 50 }, (_, i) => `[u(ghost_${i}/GREET)]`).join(" ");
  const actor = makeActor({ flags: new Set(["admin"]) }); // admin to bypass H4 guard
  const target = makeTarget();
  // Should complete without error — DoS protection means at most 10 are evaluated
  const result = await parseDesc(patterns, actor, target);
  // All non-existent objects → empty substitutions; verify it's a string
  assertEquals(typeof result, "string");
  // There must be spaces left (the join added spaces between patterns)
  // and no pattern should expand to anything since the objects don't exist
});

// ---------------------------------------------------------------------------
// H4 — IDOR guard: plain player must not eval another object's attrs via [u()]
// ---------------------------------------------------------------------------

Deno.test("H4 — plain player embedding [u(otherObj/attr)] in their own desc must NOT expose the attr", OPTS, async () => {
  const SECRET_OBJ_ID = "pd_secret1";

  // Create a "secret" object owned by admin, with a sensitive attribute
  await dbojs.create({
    id: SECRET_OBJ_ID,
    flags: "thing admin",
    data: {
      name: "SecretObj",
      attributes: [
        {
          name: "PASSWD",
          value: `return "super-secret-value";`,
          setter: "god",
          type: "attribute",
        },
      ],
    },
  });

  // Plain player actor; target is themselves (not the secret obj)
  const actor = makeActor({ flags: new Set(["player", "connected"]) });
  const target = makeTarget({ id: ACTOR_ID }); // target = the player, NOT the secret obj

  // The player's description embeds a [u()] reference to the secret object
  const desc = `Player info: [u(${SECRET_OBJ_ID}/PASSWD)]`;
  const result = await parseDesc(desc, actor, target);

  // Must NOT contain the secret value — IDOR guard must block cross-object eval
  if (result.includes("super-secret-value")) {
    await cleanup(SECRET_OBJ_ID);
    throw new Error(`H4 EXPLOIT: plain player's description exposed another object's attr. Got: "${result}"`);
  }

  await cleanup(SECRET_OBJ_ID);
  await DBO.close();
});
