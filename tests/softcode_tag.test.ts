/**
 * tests/softcode_tag.test.ts
 *
 * Tests for the @tag / @ltag registry system:
 *   - tag(), istag(), listtags(), tagmatch() stdlib functions
 *   - ltag(), isltag(), listltags(), ltagmatch() stdlib functions
 *   - #tagname resolution in resolveObj()
 *   - object:destroyed hook cleans up tags
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { parse }    from "../src/services/Softcode/parser.ts";
import { evaluate } from "../src/services/Softcode/evaluator.ts";
import type { EvalContext, DbAccessor, OutputAccessor } from "../src/services/Softcode/context.ts";
import type { IDBObj } from "../src/@types/UrsamuSDK.ts";
import { dbojs, DBO, serverTags, playerTags } from "../src/services/Database/index.ts";
import "../src/services/Softcode/stdlib/index.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// ── Helpers ───────────────────────────────────────────────────────────────

function makeObj(id: string, name: string, flags: string[] = ["thing"]): IDBObj {
  return { id, name, flags: new Set(flags), location: "0", state: {}, contents: [] };
}

function makeCtx(actor: IDBObj, db: Partial<DbAccessor> = {}): EvalContext {
  return {
    actor,
    executor:  actor,
    caller:    null,
    args:      [],
    registers: new Map(),
    iterStack: [],
    depth:     0,
    deadline:  Date.now() + 2000,
    db: {
      queryById:        async () => null,
      queryByName:      async () => null,
      lcon:             async () => [],
      lwho:             async () => [],
      lattr:            async () => [],
      getAttribute:     async () => null,
      getTagById:       async () => null,
      getPlayerTagById: async () => null,
      ...db,
    },
    output: { send: () => {}, roomBroadcast: () => {}, broadcast: () => {} },
  };
}

async function run(code: string, ctx: EvalContext): Promise<string> {
  const ast = parse(code, { startRule: "Start" });
  return evaluate(ast as Parameters<typeof evaluate>[0], ctx);
}

async function cleanup(...ids: string[]) {
  for (const id of ids) {
    await serverTags.delete({ id }).catch(() => {});
    await playerTags.delete({ id }).catch(() => {});
  }
}

// ── tag() / istag() ───────────────────────────────────────────────────────

Deno.test("softcode/tag — tag() returns dbref when tag exists", OPTS, async () => {
  const tagName = "st_vault";
  await cleanup(tagName);
  await serverTags.create({ id: tagName, name: tagName, objectId: "42", setterId: "1", createdAt: Date.now() });

  const actor = makeObj("1", "Wizard", ["player", "wizard"]);
  const ctx = makeCtx(actor, {
    getTagById: async (name) => name === tagName ? "42" : null,
  });
  assertEquals(await run(`[tag(${tagName})]`, ctx), "#42");
  await cleanup(tagName);
});

Deno.test("softcode/tag — tag() returns #-1 when tag missing", OPTS, async () => {
  const actor = makeObj("1", "Wizard", ["player", "wizard"]);
  const ctx = makeCtx(actor, { getTagById: async () => null });
  assertEquals(await run("[tag(no_such_tag)]", ctx), "#-1");
});

Deno.test("softcode/tag — istag() returns 1 when set", OPTS, async () => {
  const actor = makeObj("1", "Wizard", ["player", "wizard"]);
  const ctx = makeCtx(actor, { getTagById: async (n) => n === "myroom" ? "5" : null });
  assertEquals(await run("[istag(myroom)]", ctx), "1");
});

Deno.test("softcode/tag — istag() returns 0 when not set", OPTS, async () => {
  const actor = makeObj("1", "Wizard", ["player", "wizard"]);
  const ctx = makeCtx(actor, { getTagById: async () => null });
  assertEquals(await run("[istag(noroom)]", ctx), "0");
});

Deno.test("softcode/tag — tagmatch() returns 1 when obj matches tag", OPTS, async () => {
  const actor = makeObj("99", "Wizard", ["player"]);
  const ctx = makeCtx(actor, {
    getTagById:  async (n) => n === "home" ? "99" : null,
    queryByName: async () => null,
  });
  // me resolves to actor id "99", tag "home" maps to "99"
  assertEquals(await run("[tagmatch(me,home)]", ctx), "1");
});

Deno.test("softcode/tag — tagmatch() returns 0 when no match", OPTS, async () => {
  const actor = makeObj("99", "Wizard", ["player"]);
  const ctx = makeCtx(actor, {
    getTagById:  async (n) => n === "home" ? "50" : null,
    queryByName: async () => null,
  });
  assertEquals(await run("[tagmatch(me,home)]", ctx), "0");
});

// ── ltag() / isltag() ─────────────────────────────────────────────────────

Deno.test("softcode/ltag — ltag() returns dbref when personal tag exists", OPTS, async () => {
  const actor = makeObj("10", "Player", ["player"]);
  const ctx = makeCtx(actor, {
    getPlayerTagById: async (aid, name) => (aid === "10" && name === "safehouse") ? "77" : null,
  });
  assertEquals(await run("[ltag(safehouse)]", ctx), "#77");
});

Deno.test("softcode/ltag — ltag() returns #-1 when not set", OPTS, async () => {
  const actor = makeObj("10", "Player", ["player"]);
  const ctx = makeCtx(actor, { getPlayerTagById: async () => null });
  assertEquals(await run("[ltag(nope)]", ctx), "#-1");
});

Deno.test("softcode/ltag — isltag() returns 1 when set", OPTS, async () => {
  const actor = makeObj("10", "Player", ["player"]);
  const ctx = makeCtx(actor, {
    getPlayerTagById: async (aid, name) => (aid === "10" && name === "base") ? "5" : null,
  });
  assertEquals(await run("[isltag(base)]", ctx), "1");
});

Deno.test("softcode/ltag — isltag() returns 0 when not set", OPTS, async () => {
  const actor = makeObj("10", "Player", ["player"]);
  const ctx = makeCtx(actor, { getPlayerTagById: async () => null });
  assertEquals(await run("[isltag(nowhere)]", ctx), "0");
});

// ── #tagname resolution in object functions ───────────────────────────────

Deno.test("softcode/tag — #tagname in name() resolves via global tag", OPTS, async () => {
  const tagged = makeObj("55", "TheCitadel", ["room"]);
  const actor  = makeObj("1", "Wizard", ["player", "wizard"]);
  const ctx = makeCtx(actor, {
    getTagById:       async (n) => n === "citadel" ? "55" : null,
    getPlayerTagById: async () => null,
    queryById:        async (id) => id === "55" ? tagged : null,
  });
  assertEquals(await run("[name(#citadel)]", ctx), "TheCitadel");
});

Deno.test("softcode/tag — personal tag shadows global tag in #tagname", OPTS, async () => {
  const globalObj   = makeObj("55", "GlobalTarget", ["room"]);
  const personalObj = makeObj("88", "PersonalTarget", ["room"]);
  const actor = makeObj("1", "Player", ["player"]);
  const ctx = makeCtx(actor, {
    getTagById:       async (n) => n === "myplace" ? "55" : null,
    getPlayerTagById: async (aid, n) => (aid === "1" && n === "myplace") ? "88" : null,
    queryById:        async (id) => {
      if (id === "55") return globalObj;
      if (id === "88") return personalObj;
      return null;
    },
  });
  // Personal tag should win
  assertEquals(await run("[name(#myplace)]", ctx), "PersonalTarget");
});

// ── Tag cleanup on object:destroyed ──────────────────────────────────────

Deno.test("softcode/tag — object:destroyed removes global and personal tags", OPTS, async () => {
  const objId = "tag_cleanup_test_obj";

  // Seed a global tag and a personal tag pointing to the same object
  await serverTags.create({ id: "cleanup_gtag", name: "cleanup_gtag", objectId: objId, setterId: "1", createdAt: Date.now() });
  await playerTags.create({ id: `p1:cleanup_ltag`, name: "cleanup_ltag", ownerId: "p1", objectId: objId, createdAt: Date.now() });

  // Verify they exist
  const before_g = await serverTags.queryOne({ id: "cleanup_gtag" });
  const before_p = await playerTags.queryOne({ id: "p1:cleanup_ltag" });
  assertEquals(before_g?.objectId, objId);
  assertEquals(before_p?.objectId, objId);

  // Fire the object:destroyed event
  const { gameHooks } = await import("../src/services/Hooks/GameHooks.ts");
  // Importing hooks/index.ts triggers the listener registration
  await import("../src/services/Hooks/index.ts");
  await gameHooks.emit("object:destroyed", {
    objectId:   objId,
    objectName: "TestObj",
    objectType: "THING",
    actorId:    "1",
    actorName:  "Wizard",
  });

  // Small delay for async cleanup
  await new Promise(r => setTimeout(r, 50));

  const after_g = await serverTags.queryOne({ id: "cleanup_gtag" });
  const after_p = await playerTags.queryOne({ id: "p1:cleanup_ltag" });
  assertEquals(after_g, undefined);
  assertEquals(after_p, undefined);

  await DBO.close();
});
