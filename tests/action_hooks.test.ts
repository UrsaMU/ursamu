/**
 * tests/action_hooks.test.ts
 *
 * Tests for the action-attribute hook additions:
 *   - manipulation.ts: FAIL/OFAIL/AFAIL on basic lock fail (execGet)
 *                      USE/OUSE/AUSE via execUse
 *   - stdlib: while(), template, writable, parents, listfunctions, listflags
 *   - objectsRouter: flagsHandler, functionsHandler (pure, no DB)
 */
// deno-lint-ignore-file require-await
import { assertEquals, assertStringIncludes } from "@std/assert";
import { runSoftcode, softcodeEngine } from "@ursamu/mush";
import type { UrsaEvalContext } from "@ursamu/mush";
import type { DbAccessor, OutputAccessor } from "../src/services/Softcode/context.ts";
import type { IDBObj } from "@ursamu/mush";
import { execGet, execUse } from "@ursamu/mush";
import { flagsHandler, functionsHandler } from "@ursamu/mush";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// ── softcode test helpers ─────────────────────────────────────────────────────

function makeActor(overrides: Partial<IDBObj> = {}): IDBObj {
  return {
    id: "ah_actor1",
    name: "Alice",
    flags: new Set(["player", "connected"]),
    location: "ah_room1",
    state: {},
    contents: [],
    ...overrides,
  };
}

function makeDb(overrides: Partial<DbAccessor> = {}): DbAccessor {
  return {
    queryById:        () => Promise.resolve(null),
    queryByName:      () => Promise.resolve(null),
    lcon:             () => Promise.resolve([]),
    lwho:             () => Promise.resolve([]),
    lattr:            () => Promise.resolve([]),
    getAttribute:     () => Promise.resolve(null),
    getTagById:       () => Promise.resolve(null),
    getPlayerTagById: () => Promise.resolve(null),
    lsearch:          () => Promise.resolve([]),
    children:         () => Promise.resolve([]),
    lchannels:        () => Promise.resolve(""),
    channelsFor:      () => Promise.resolve(""),
    mailCount:        () => Promise.resolve(0),
    queueLength:      () => Promise.resolve(0),
    getIdleSecs:      () => Promise.resolve(0),
    getUserFn:        () => Promise.resolve(null),
    ...overrides,
  };
}

const noOutput: OutputAccessor = {
  send:          () => {},
  roomBroadcast: () => {},
  broadcast:     () => {},
};

function makeCtx(overrides: Partial<UrsaEvalContext> = {}): UrsaEvalContext {
  const actor = makeActor();
  return {
    enactor:      actor.id,
    executor:     actor,
    caller:       null,
    actor,
    args:         [],
    registers:    new Map(),
    iterStack:    [],
    depth:        0,
    maxDepth:     50,
    maxOutputLen: 65_536,
    deadline:     Date.now() + 5_000,
    db:           makeDb(),
    output:       noOutput,
    _engine:      softcodeEngine,
    ...overrides,
  };
}

function run(code: string, ctx?: Partial<UrsaEvalContext>): Promise<string> {
  return runSoftcode(code, makeCtx(ctx));
}

// ── IUrsamuSDK mock ───────────────────────────────────────────────────────────

function makeSDK(opts: {
  me?: Partial<IDBObj>;
  target?: IDBObj | null;
  attrMap?: Record<string, string>;
  evalMap?: Record<string, string>;
} = {}) {
  const sent: string[] = [];
  const broadcast: string[] = [];
  const dbCalls: unknown[][] = [];

  const me = makeActor(opts.me ?? {});
  const here = {
    id: "ah_room1",
    name: "Room",
    flags: new Set(["room"]),
    state: {},
    contents: [] as IDBObj[],
    broadcast: (m: string) => { broadcast.push(m); },
  };

  // deno-lint-ignore no-explicit-any
  const sdk: any = {
    me,
    here,
    cmd: { name: "", original: "", args: ["widget"], switches: [] },
    send: (m: string) => { sent.push(m); },
    broadcast: () => {},
    canEdit: async () => true,
    attr: {
      get: async (_id: string, name: string) => opts.attrMap?.[name.toUpperCase()] ?? null,
    },
    eval: async (_id: string, name: string) => opts.evalMap?.[name.toUpperCase()] ?? "",
    db: {
      modify: async (...a: unknown[]) => { dbCalls.push(a); },
      create: async (d: unknown) => ({ ...(d as object), id: "new1", flags: new Set(), contents: [] }),
      search: async () => opts.target ? [opts.target] : [],
    },
    util: {
      target: async () => opts.target ?? null,
      displayName: (o: IDBObj) => o.name ?? "Unknown",
      stripSubs: (s: string) => s,
    },
  };

  return { sdk, sent, broadcast, dbCalls };
}

// ═══════════════════════════════════════════════════════════════════════════════
// while() — lazy evaluation
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("stdlib/while — increments register until condition false", OPTS, async () => {
  // setq(0,0) + while(lt(r(0),3), setq(0,add(r(0),1))) — should return "3"
  const result = await run("[setq(0,0)][while(lt(r(0),3),setq(0,add(r(0),1)))][r(0)]");
  assertEquals(result, "3");
});

Deno.test("stdlib/while — body never runs when condition starts false", OPTS, async () => {
  const result = await run("[setq(0,5)][while(lt(r(0),3),setq(0,add(r(0),1)))][r(0)]");
  assertEquals(result, "5");
});

Deno.test("stdlib/while — capped at 1000 iterations (does not loop forever)", OPTS, async () => {
  // Condition always true — should hit cap and return without hanging
  const result = await run("[setq(0,0)][while(1,setq(0,add(r(0),1)))][r(0)]");
  assertEquals(result, "1000");
});

// ═══════════════════════════════════════════════════════════════════════════════
// template — alias for map
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("stdlib/template — evaluates attr for each list element", OPTS, async () => {
  const actor = makeActor();
  const ctx = makeCtx({
    actor, executor: actor,
    db: makeDb({
      queryById: async (id) => id === actor.id ? actor : null,
      getAttribute: async (_obj, attr) => attr === "DOUBLE" ? "[mul(%0,2)]" : null,
    }),
  });
  // Use bare attr name (no "me/" prefix) — callUserAttr in list.ts uses queryById, not resolveObj
  const result = await runSoftcode("[template(DOUBLE,1 2 3)]", ctx);
  assertEquals(result, "2 4 6");
});

// ═══════════════════════════════════════════════════════════════════════════════
// writable, parents, cmds, listfunctions, listflags
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("stdlib/writable — always returns 1 (no per-attr write locks yet)", OPTS, async () =>
  assertEquals(await run("[writable(me,DESC)]"), "1")
);

Deno.test("stdlib/parents — returns empty (#-1) when no parent", OPTS, async () =>
  assertEquals(await run("[parents(me)]"), "#-1")
);

Deno.test("stdlib/parents — returns parent chain", OPTS, async () => {
  const parent1 = makeActor({ id: "ah_par1",  state: {} });
  const parent2 = makeActor({ id: "ah_par2",  state: {} });
  // Set parent directly on the executor's state (resolveObj("me") returns ctx.executor directly)
  const actor = makeActor({ id: "ah_child1", state: { parent: "ah_par1" } });
  const ctx = makeCtx({
    actor, executor: actor,
    db: makeDb({
      queryById: async (id) => {
        if (id === "ah_par1") return { ...parent1, state: { parent: "ah_par2" } };
        if (id === "ah_par2") return parent2;
        return null;
      },
    }),
  });
  const result = await runSoftcode("[parents(me)]", ctx);
  assertEquals(result, "#ah_par1 #ah_par2");
});

Deno.test("stdlib/listfunctions — includes stdlib and engine lazy functions", OPTS, async () => {
  const result = await run("[listfunctions()]");
  // stdlib-registry functions
  assertStringIncludes(result, "add");
  assertStringIncludes(result, "strlen");
  assertStringIncludes(result, "printf");
  // engine-lazy functions explicitly included
  assertStringIncludes(result, "iter");
  assertStringIncludes(result, "while");
  assertStringIncludes(result, "switch");
});

Deno.test("stdlib/listflags — includes known flags", OPTS, async () => {
  const result = await run("[listflags()]");
  assertStringIncludes(result, "wizard");
  assertStringIncludes(result, "player");
  assertStringIncludes(result, "builder");
});

// ═══════════════════════════════════════════════════════════════════════════════
// execGet — basic lock check
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("action/get — no lock: succeeds and fires SUCC", OPTS, async () => {
  const thing: IDBObj = {
    id: "ah_thing1", name: "Widget",
    flags: new Set(["thing"]), state: { owner: "ah_owner1" },
    location: "ah_room1", contents: [],
  };
  const { sdk, sent } = makeSDK({ target: thing, evalMap: { SUCC: "Snatch!", OSUCC: "" } });
  await execGet(sdk);
  assertEquals(sent[0], "Snatch!");
});

Deno.test("action/get — basic lock fails: fires FAIL, no DB modify", OPTS, async () => {
  const thing: IDBObj = {
    id: "ah_thing2", name: "Sword",
    flags: new Set(["thing"]),
    state: { locks: { basic: "wizard" }, owner: "ah_owner1" },
    location: "ah_room1", contents: [],
  };
  const { sdk, sent, dbCalls } = makeSDK({
    target: thing,
    evalMap: { FAIL: "That sword resists you!", OFAIL: "tries in vain." },
  });
  // Actor is not a wizard → lock should fail
  await execGet(sdk);
  assertEquals(sent[0], "That sword resists you!");
  assertEquals(dbCalls.length, 0);   // no DB modify on fail
});

Deno.test("action/get — basic lock passes: succeeds normally", OPTS, async () => {
  const thing: IDBObj = {
    id: "ah_thing3", name: "Key",
    flags: new Set(["thing"]),
    state: { locks: { basic: "connected" }, owner: "ah_owner1" },
    location: "ah_room1", contents: [],
  };
  const { sdk, sent, dbCalls } = makeSDK({ target: thing, evalMap: { SUCC: "Got it." } });
  // Actor is connected → lock passes
  await execGet(sdk);
  assertEquals(sent[0], "Got it.");
  assertEquals(dbCalls.length > 0, true);  // DB write happened
});

// ═══════════════════════════════════════════════════════════════════════════════
// execUse — USE/OUSE/AUSE + lock
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("action/use — fires USE attr to actor", OPTS, async () => {
  const thing: IDBObj = {
    id: "ah_lever1", name: "Lever",
    flags: new Set(["thing"]), state: { owner: "ah_owner1" },
    location: "ah_room1", contents: [],
  };
  const { sdk, sent } = makeSDK({ target: thing, evalMap: { USE: "You pull the lever.", OUSE: "pulls the lever." } });
  await execUse(sdk);
  assertEquals(sent[0], "You pull the lever.");
});

Deno.test("action/use — USE lock fail fires FAIL", OPTS, async () => {
  const thing: IDBObj = {
    id: "ah_lever2", name: "Sacred Lever",
    flags: new Set(["thing"]),
    state: { locks: { use: "wizard" }, owner: "ah_owner1" },
    location: "ah_room1", contents: [],
  };
  const { sdk, sent } = makeSDK({ target: thing, evalMap: { FAIL: "Only wizards may use this." } });
  await execUse(sdk);
  assertEquals(sent[0], "Only wizards may use this.");
});

Deno.test("action/use — no USE attr returns default message", OPTS, async () => {
  const thing: IDBObj = {
    id: "ah_lever3", name: "Button",
    flags: new Set(["thing"]), state: {},
    location: "ah_room1", contents: [],
  };
  const { sdk, sent } = makeSDK({ target: thing });
  await execUse(sdk);
  assertStringIncludes(sent[0], "use");
  assertStringIncludes(sent[0].toLowerCase(), "button");
});

Deno.test("action/use — no target returns error", OPTS, async () => {
  const { sdk, sent } = makeSDK({ target: null });
  sdk.cmd.args[0] = "nonexistent";
  await execUse(sdk);
  assertStringIncludes(sent[0].toLowerCase(), "see");
});

// ═══════════════════════════════════════════════════════════════════════════════
// REST API — flagsHandler, functionsHandler
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("REST/flags — GET /api/v1/flags returns flag list", OPTS, async () => {
  const res = flagsHandler(new Request("http://localhost/api/v1/flags"));
  assertEquals(res.status, 200);
  const body = await res.json() as { flags: string[] };
  assertEquals(Array.isArray(body.flags), true);
  assertEquals(body.flags.includes("wizard"), true);
  assertEquals(body.flags.includes("player"), true);
  assertEquals(body.flags.includes("builder"), true);
});

Deno.test("REST/functions — GET /api/v1/functions returns sorted function list", OPTS, async () => {
  const res = await functionsHandler(new Request("http://localhost/api/v1/functions"));
  assertEquals(res.status, 200);
  const body = await res.json() as { functions: string[] };
  assertEquals(Array.isArray(body.functions), true);
  // stdlib functions
  assertEquals(body.functions.includes("add"), true);
  assertEquals(body.functions.includes("printf"), true);
  assertEquals(body.functions.includes("template"), true);
  assertEquals(body.functions.includes("listfunctions"), true);
  // engine-lazy functions explicitly included
  assertEquals(body.functions.includes("while"), true);
  assertEquals(body.functions.includes("iter"), true);
  // Should be sorted
  const sorted = [...body.functions].sort();
  assertEquals(body.functions, sorted);
});
