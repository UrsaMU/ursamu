/**
 * L1 + L2 — Silent error swallowing.
 *   L1: `runPluginFormatHandlers` catches plugin handler throws and emits
 *       nothing. Plugin bugs become invisible.
 *   L2: `resolveFormat` catches softcode eval throws and emits nothing.
 *       Broken @nameformat/@whoformat/etc. silently route to the next
 *       fallback with no debug hint.
 *
 * Fix: log a warning to stderr on each swallowed error so operators can
 * diagnose. Default behavior remains the same (don't crash the caller).
 */
import { assertEquals } from "@std/assert";
import { dbojs, DBO } from "../src/services/Database/database.ts";
import {
  registerFormatHandler,
  _clearFormatHandlers,
  runPluginFormatHandlers,
} from "../src/utils/formatHandlers.ts";
import { resolveFormat } from "../src/utils/resolveFormat.ts";
import type { IUrsamuSDK, IDBObj } from "../src/@types/UrsamuSDK.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false, timeout: 15000 };

const ACTOR = "720001";

function captureWarn(): { logs: string[]; restore: () => void } {
  const logs: string[] = [];
  const orig = console.warn;
  console.warn = (...args: unknown[]) => { logs.push(args.map(String).join(" ")); };
  return { logs, restore: () => { console.warn = orig; } };
}

function mockTarget(): IDBObj {
  return {
    id: ACTOR, name: "T",
    flags: new Set<string>(), state: {}, location: "", contents: [],
  } as unknown as IDBObj;
}

function mockU(): IUrsamuSDK {
  return {
    me: mockTarget(),
    here: mockTarget(),
    socketId: "s",
    cmd: { name: "", args: [], switches: [] },
    send: () => {},
    canEdit: () => Promise.resolve(true),
    attr: {
      get: () => Promise.resolve(null),
      set: () => Promise.resolve(),
      clear: () => Promise.resolve(false),
    },
    util: { displayName: () => "T", stripSubs: (s: string) => s },
  } as unknown as IUrsamuSDK;
}

Deno.test("L1: plugin handler throw logs a warning", OPTS, async () => {
  _clearFormatHandlers();
  const cap = captureWarn();
  try {
    registerFormatHandler("NAMEFORMAT", () => { throw new Error("plugin broke"); });
    await runPluginFormatHandlers("NAMEFORMAT", mockU(), mockTarget(), "x");
  } finally {
    cap.restore();
    _clearFormatHandlers();
  }
  const matched = cap.logs.some((l) => l.includes("plugin broke") || /format.*handler/i.test(l));
  assertEquals(matched, true, `Expected warn about plugin handler throw. Got: ${JSON.stringify(cap.logs)}`);
});

Deno.test("L1: handler still falls through after logged throw", OPTS, async () => {
  _clearFormatHandlers();
  const cap = captureWarn();
  let nextCalled = false;
  try {
    registerFormatHandler("NAMEFORMAT", () => { throw new Error("boom"); });
    registerFormatHandler("NAMEFORMAT", () => { nextCalled = true; return "OK"; });
    const out = await runPluginFormatHandlers("NAMEFORMAT", mockU(), mockTarget(), "x");
    assertEquals(out, "OK");
  } finally {
    cap.restore();
    _clearFormatHandlers();
  }
  assertEquals(nextCalled, true);
});

Deno.test("L2: softcode eval failure in resolveFormat logs a warning", OPTS, async () => {
  // Force a softcode failure by setting an attr to syntactically broken code,
  // then call resolveFormat directly.
  await dbojs.delete({ id: ACTOR }).catch(() => {});
  await dbojs.create({
    id: ACTOR,
    flags: "player connected",
    data: {
      name: "Mallory",
      attributes: [
        { name: "NAMEFORMAT", value: "[u(", setter: ACTOR, type: "attribute" },
      ],
    },
    location: ACTOR,
  });

  const cap = captureWarn();
  let out: string | null = "untouched";
  try {
    const u = {
      me: { id: ACTOR, name: "Mallory", flags: new Set(["player", "connected"]),
            state: {}, location: ACTOR, contents: [] } as unknown as IDBObj,
      socketId: "s",
      cmd: { name: "", args: [], switches: [] },
      send: () => {},
      canEdit: () => Promise.resolve(true),
      attr: {
        get: async (id: string, n: string) => {
          const o = await dbojs.queryOne({ id });
          if (!o) return null;
          const attrs = (o.data?.attributes as Array<{ name: string; value: string }>) ?? [];
          return attrs.find((a) => a.name.toUpperCase() === n.toUpperCase())?.value ?? null;
        },
        set: () => Promise.resolve(), clear: () => Promise.resolve(false),
      },
      util: { displayName: () => "Mallory" },
    } as unknown as IUrsamuSDK;
    out = await resolveFormat(u, u.me, "NAMEFORMAT", "default-name");
  } finally {
    cap.restore();
    await dbojs.delete({ id: ACTOR }).catch(() => {});
  }

  // Function must still return null (graceful fallthrough), AND must have warned.
  assertEquals(out, null);
  const matched = cap.logs.some((l) => /softcode|format/i.test(l));
  assertEquals(matched, true, `Expected warn about softcode failure. Got: ${JSON.stringify(cap.logs)}`);
});

Deno.test("L1+L2: cleanup", OPTS, async () => {
  await dbojs.delete({ id: ACTOR }).catch(() => {});
  await DBO.close();
});
