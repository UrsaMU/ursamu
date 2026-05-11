/**
 * Unit tests for look-side format resolution.
 *
 * Strategy: drive the priority chain via the plugin-handler registry, which
 * fires only when no softcode attribute is set. The softcode-attr path is
 * covered by tests/look_formats_integration.test.ts (real worker).
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import type { IUrsamuSDK, IDBObj } from "../src/@types/UrsamuSDK.ts";
import { execLook } from "../src/commands/look.ts";
import {
  registerFormatHandler,
  unregisterFormatHandler,
  _clearFormatHandlers,
  type FormatSlot,
  type FormatHandler,
} from "../src/utils/formatHandlers.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function makeMock(opts: {
  contents?: IDBObj[];
  opaque?: boolean;
  canEdit?: boolean;
  blind?: boolean;
} = {}) {
  const flags = new Set<string>(["room"]);
  if (opts.opaque) flags.add("opaque");
  const room = {
    id: "r1",
    flags,
    state: { name: "TestRoom", description: "A bare room." },
    location: "0",
    contents: opts.contents ?? [],
  } as unknown as IDBObj;

  const player = {
    id: "p1",
    flags: new Set<string>(opts.blind ? ["player", "connected", "blind"] : ["player", "connected"]),
    state: { name: "Alice" },
    contents: [],
  } as unknown as IDBObj;

  const sent: string[] = [];
  // attr.get always returns null → no softcode attr → handler path exercised
  const u = {
    me: player,
    here: room,
    cmd: { name: "look", args: [""], switches: [] },
    send: (m: string) => { sent.push(m); },
    ui: { panel: (o: unknown) => o, layout: () => {} },
    canEdit: () => Promise.resolve(opts.canEdit ?? true),
    db: { search: () => Promise.resolve([]) },
    attr: { get: () => Promise.resolve(null) },
    util: {
      displayName: (o: { state?: { name?: string }; name?: string }) =>
        o.state?.name || o.name || "Unknown",
      parseDesc: undefined,
    },
  };
  return { u: u as unknown as IUrsamuSDK, sent };
}

function withHandler(slot: FormatSlot, fn: FormatHandler, body: () => Promise<void>) {
  registerFormatHandler(slot, fn);
  return body().finally(() => unregisterFormatHandler(slot, fn));
}

Deno.test("look: no attrs and no handlers — default rendering", OPTS, async () => {
  _clearFormatHandlers();
  const { u, sent } = makeMock();
  await execLook(u);
  assertStringIncludes(sent[0], "%chTestRoom(#r1)%cn");
  assertStringIncludes(sent[0], "A bare room.");
});

Deno.test("look: plugin NAMEFORMAT handler overrides header", OPTS, async () => {
  _clearFormatHandlers();
  const { u, sent } = makeMock();
  await withHandler("NAMEFORMAT", (_u, _t, arg) => `<<N:${arg}>>`, async () => {
    await execLook(u);
  });
  assertStringIncludes(sent[0], "<<N:TestRoom(#r1)>>");
  assertEquals(sent[0].includes("%chTestRoom(#r1)%cn"), false);
});

Deno.test("look: plugin DESCFORMAT handler wraps description", OPTS, async () => {
  _clearFormatHandlers();
  const { u, sent } = makeMock();
  await withHandler("DESCFORMAT", (_u, _t, arg) => `>>${arg}<<`, async () => {
    await execLook(u);
  });
  assertStringIncludes(sent[0], ">>A bare room.<<");
});

Deno.test("look: plugin CONFORMAT receives space-separated id list as defaultArg", OPTS, async () => {
  _clearFormatHandlers();
  const alice = { id: "p9", flags: new Set(["player", "connected"]), state: { name: "Bob" }, contents: [] } as unknown as IDBObj;
  const ball = { id: "o1", flags: new Set(["thing"]), state: { name: "ball" }, contents: [] } as unknown as IDBObj;
  let seen = "";
  const { u, sent } = makeMock({ contents: [alice, ball] });
  await withHandler("CONFORMAT", (_u, _t, arg) => { seen = arg; return `HERE: ${arg}`; }, async () => {
    await execLook(u);
  });
  assertEquals(seen, "#p9 #o1");
  assertStringIncludes(sent[0], "HERE: #p9 #o1");
  assertEquals(sent[0].includes("%chCharacters:%cn"), false);
});

Deno.test("look: CONFORMAT handler skipped when no visible contents", OPTS, async () => {
  _clearFormatHandlers();
  let called = false;
  const { u, sent } = makeMock({ contents: [] });
  await withHandler("CONFORMAT", () => { called = true; return "X"; }, async () => {
    await execLook(u);
  });
  assertEquals(called, false);
  assertEquals(sent[0].includes("X"), false);
});

Deno.test("look: CONFORMAT skipped when opaque and no edit perm", OPTS, async () => {
  _clearFormatHandlers();
  const ball = { id: "o1", flags: new Set(["thing"]), state: { name: "ball" }, contents: [] } as unknown as IDBObj;
  let called = false;
  const { u, sent } = makeMock({ contents: [ball], opaque: true, canEdit: false });
  await withHandler("CONFORMAT", () => { called = true; return "X"; }, async () => {
    await execLook(u);
  });
  assertEquals(called, false);
  assertEquals(sent[0].includes("ball"), false);
});

Deno.test("look: plugin EXITFORMAT receives exit id list", OPTS, async () => {
  _clearFormatHandlers();
  const ex = { id: "e1", flags: new Set(["exit"]), state: { name: "North;n" }, contents: [] } as unknown as IDBObj;
  let seen = "";
  const { u, sent } = makeMock({ contents: [ex] });
  await withHandler("EXITFORMAT", (_u, _t, arg) => { seen = arg; return `OUT: ${arg}`; }, async () => {
    await execLook(u);
  });
  assertEquals(seen, "#e1");
  assertStringIncludes(sent[0], "OUT: #e1");
});

Deno.test("look: handler returning null falls through to built-in default", OPTS, async () => {
  _clearFormatHandlers();
  const { u, sent } = makeMock();
  await withHandler("NAMEFORMAT", () => null, async () => {
    await execLook(u);
  });
  assertStringIncludes(sent[0], "%chTestRoom(#r1)%cn");
});

Deno.test("look: first non-null handler wins; later handlers don't run", OPTS, async () => {
  _clearFormatHandlers();
  const { u, sent } = makeMock();
  let secondRan = false;
  const first: FormatHandler = () => "FIRST";
  const second: FormatHandler = () => { secondRan = true; return "SECOND"; };
  registerFormatHandler("NAMEFORMAT", first);
  registerFormatHandler("NAMEFORMAT", second);
  try {
    await execLook(u);
  } finally {
    unregisterFormatHandler("NAMEFORMAT", first);
    unregisterFormatHandler("NAMEFORMAT", second);
  }
  assertStringIncludes(sent[0], "FIRST");
  assertEquals(secondRan, false);
});

Deno.test("look: handler throw is swallowed, falls through to default", OPTS, async () => {
  _clearFormatHandlers();
  const { u, sent } = makeMock();
  await withHandler("DESCFORMAT", () => { throw new Error("boom"); }, async () => {
    await execLook(u);
  });
  assertStringIncludes(sent[0], "A bare room.");
});

Deno.test("look: unregisterFormatHandler removes the registration", OPTS, async () => {
  _clearFormatHandlers();
  const { u, sent } = makeMock();
  const fn: FormatHandler = () => "REMOVED";
  registerFormatHandler("NAMEFORMAT", fn);
  unregisterFormatHandler("NAMEFORMAT", fn);
  await execLook(u);
  assertEquals(sent[0].includes("REMOVED"), false);
  assertStringIncludes(sent[0], "%chTestRoom(#r1)%cn");
});

Deno.test("look: blind player short-circuits — no handler invoked", OPTS, async () => {
  _clearFormatHandlers();
  let called = false;
  const { u, sent } = makeMock({ blind: true });
  await withHandler("NAMEFORMAT", () => { called = true; return "X"; }, async () => {
    await execLook(u);
  });
  assertEquals(called, false);
  assertEquals(sent[0], "You can't see anything!");
});

Deno.test("look: non-editable target — NAMEFORMAT arg is bare name (no #id)", OPTS, async () => {
  _clearFormatHandlers();
  let seen = "";
  const { u } = makeMock({ canEdit: false });
  await withHandler("NAMEFORMAT", (_u, _t, arg) => { seen = arg; return ""; }, async () => {
    await execLook(u);
  });
  assertEquals(seen, "TestRoom");
});
