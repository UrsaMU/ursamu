// deno-lint-ignore-file require-await
/**
 * Integration tests for @ursamu/mush public API.
 * Five areas: addCmd dispatch, evaluateLock, dbojs CRUD, gameClock, format pipeline.
 */

import { assertEquals, assertExists } from "@std/assert";
import {
  addCmd,
  cmds,
  evaluateLock,
  dbojs,
  DBO,
  gameClock,
  registerFormatHandler,
  resolveFormat,
  _clearFormatHandlers,
  unregisterFormatHandler,
} from "../mod.ts";
import type { IDBObj, IUrsamuSDK, FormatSlot } from "../mod.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// ─── Area 1: addCmd dispatch ──────────────────────────────────────────────────

Deno.test("addCmd: registers command and pattern matches", OPTS, () => {
  const execCalls: string[][] = [];
  addCmd({
    name: "+mush-test-cmd",
    pattern: /^\+mush-test-cmd\s*(.*)/i,
    lock: "",
    category: "Test",
    help: "+mush-test-cmd <arg>  — test.\n\nExamples:\n  +mush-test-cmd foo\n  +mush-test-cmd bar",
    exec: async (u) => {
      execCalls.push(u.cmd.args);
      await Promise.resolve();
    },
  });

  const cmd = cmds.find((c) => c.name === "+mush-test-cmd");
  assertExists(cmd);
  assertEquals(cmd.name, "+mush-test-cmd");

  const match = "+mush-test-cmd hello".match(cmd.pattern);
  assertExists(match);
  assertEquals(match[1], "hello");
});

Deno.test("addCmd: pattern with switch captures correctly", OPTS, () => {
  addCmd({
    name: "+mush-sw-cmd",
    pattern: /^\+mush-sw-cmd(?:\/(\S+))?\s*(.*)/i,
    lock: "",
    category: "Test",
    help: "+mush-sw-cmd  — test.\n\nExamples:\n  +mush-sw-cmd foo\n  +mush-sw-cmd/set bar",
    exec: async (_u) => { await Promise.resolve(); },
  });

  const cmd = cmds.find((c) => c.name === "+mush-sw-cmd")!;
  const m1 = "+mush-sw-cmd/set alpha".match(cmd.pattern);
  assertExists(m1);
  assertEquals(m1[1], "set");
  assertEquals(m1[2], "alpha");

  const m2 = "+mush-sw-cmd beta".match(cmd.pattern);
  assertExists(m2);
  assertEquals(m2[1], undefined);
  assertEquals(m2[2], "beta");
});

// ─── Area 2: evaluateLock ─────────────────────────────────────────────────────

function mockActor(extraFlags: string[] = []): IDBObj {
  return {
    id: "lock_test_actor",
    name: "Tester",
    flags: new Set(["player", "connected", ...extraFlags]),
    state: {},
    contents: [],
  };
}

Deno.test("evaluateLock: 'connected' passes when actor has connected flag", OPTS, async () => {
  const actor = mockActor();
  assertEquals(await evaluateLock("connected", actor, actor), true);
});

Deno.test("evaluateLock: 'wizard' fails when actor lacks wizard flag", OPTS, async () => {
  const actor = mockActor();
  assertEquals(await evaluateLock("wizard", actor, actor), false);
});

Deno.test("evaluateLock: AND — 'connected wizard' fails when actor lacks wizard", OPTS, async () => {
  const actor = mockActor();
  assertEquals(await evaluateLock("connected wizard", actor, actor), false);
});

Deno.test("evaluateLock: OR — 'connected || wizard' passes when actor has connected", OPTS, async () => {
  const actor = mockActor();
  assertEquals(await evaluateLock("connected || wizard", actor, actor), true);
});

// ─── Area 3: dbojs CRUD ───────────────────────────────────────────────────────

Deno.test("dbojs: create, queryOne, modify, delete", OPTS, async () => {
  const testId = "mush_test_crud_001";

  // Clean up any prior run
  const prior = await dbojs.queryOne({ id: testId });
  if (prior) await dbojs.delete({ id: testId });

  // Create
  await dbojs.create({ id: testId, flags: "room", data: { name: "TestRoom" } });

  // Query
  const found = await dbojs.queryOne({ id: testId });
  assertExists(found);
  assertEquals(found.id, testId);
  assertEquals(found.data?.name, "TestRoom");

  // Modify
  await dbojs.modify({ id: testId }, "$set", { "data.name": "Modified Room" });
  const updated = await dbojs.queryOne({ id: testId });
  assertExists(updated);
  assertEquals(updated.data?.name, "Modified Room");

  // Delete
  await dbojs.delete({ id: testId });
  const gone = await dbojs.queryOne({ id: testId });
  assertEquals(gone, undefined);
});

Deno.test("dbojs: queryOne returns undefined for missing id", OPTS, async () => {
  const result = await dbojs.queryOne({ id: "mush_test_nonexistent_zxzx" });
  assertEquals(result == null || result === false, true);
});

// ─── Area 4: gameClock ────────────────────────────────────────────────────────

Deno.test("gameClock: set and now round-trip", OPTS, () => {
  gameClock.set({ year: 5, month: 3, day: 14, hour: 10, minute: 30 });
  const t = gameClock.now();
  assertEquals(t.year, 5);
  assertEquals(t.month, 3);
  assertEquals(t.day, 14);
  assertEquals(t.hour, 10);
  assertEquals(t.minute, 30);
});

Deno.test("gameClock: partial set preserves other fields", OPTS, () => {
  gameClock.set({ year: 2, month: 6, day: 1, hour: 0, minute: 0 });
  gameClock.set({ hour: 15 });
  const t = gameClock.now();
  assertEquals(t.year, 2);
  assertEquals(t.month, 6);
  assertEquals(t.day, 1);
  assertEquals(t.hour, 15);
  assertEquals(t.minute, 0);
});

// ─── Area 5: format pipeline ──────────────────────────────────────────────────

function mockU(): IUrsamuSDK {
  return {
    me: { id: "fmt_actor", name: "Actor", flags: new Set(["player"]), state: {}, contents: [] },
    here: { id: "fmt_room", name: "Room", flags: new Set(["room"]), state: {}, contents: [] },
    socketId: "fmt_socket",
    cmd: { name: "", original: "", args: [], switches: [] },
    send: () => {},
    broadcast: () => {},
    eval: async () => "",
    attr: { get: async () => null, set: async () => {} },
    db: {
      modify: async () => {},
      search: async () => [],
      create: async (d) => ({ ...(d as object), id: "99", flags: new Set(), contents: [] } as IDBObj),
      destroy: async () => {},
    },
    util: {
      target: async () => null,
      displayName: (o: IDBObj) => o.name ?? "Unknown",
      stripSubs: (s: string) => s,
      parseDesc: (s: string) => s,
      center: (s: string) => s,
      ljust: (s: string, _w: number) => s,
      rjust: (s: string, _w: number) => s,
    },
    canEdit: async () => true,
  } as unknown as IUrsamuSDK;
}

Deno.test("resolveFormat: registered handler is called when no softcode attr", OPTS, async () => {
  _clearFormatHandlers();
  const slot = "TESTSLOT" as FormatSlot;
  const target: IDBObj = { id: "fmt_target", name: "T", flags: new Set(), state: {}, contents: [] };
  let called = false;

  const handler = (_u: IUrsamuSDK, _t: IDBObj, _d: string) => {
    called = true;
    return "handler-output";
  };
  registerFormatHandler(slot, handler);

  const result = await resolveFormat(mockU(), target, slot, "default");
  assertEquals(called, true);
  assertEquals(result, "handler-output");

  unregisterFormatHandler(slot, handler);
  _clearFormatHandlers();
});

Deno.test("resolveFormat: returns null when no handler and no softcode attr", OPTS, async () => {
  _clearFormatHandlers();
  const slot = "EMPTYSLOT" as FormatSlot;
  const target: IDBObj = { id: "fmt_target2", name: "T", flags: new Set(), state: {}, contents: [] };

  const result = await resolveFormat(mockU(), target, slot, "default");
  assertEquals(result, null);
  _clearFormatHandlers();
});

// Close DB after all tests
Deno.test("cleanup: close DBO", OPTS, async () => {
  await DBO.close();
});
