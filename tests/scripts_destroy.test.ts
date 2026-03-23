/**
 * Tests for builder-plugin/scripts/destroy.ts
 *
 * Covers:
 *   [NOARG]   No target → usage error
 *   [NOTGT]   Target not found → not-found message
 *   [NOEDIT]  No permission → denied message
 *   [VOID]    Cannot destroy void room
 *   [PLAYER]  Cannot destroy players (@toad message)
 *   [SAFE]    SAFE flag blocks without /override
 *   [CONFIRM] Missing /confirm → prompts for confirmation
 *   [OK]      Happy path — destroys target, sends confirmation
 *   [EXITS]   Orphaned exits are cleaned up
 *   [L3]      Room destroyed while other occupants inside — they are sent home
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import type { IDBObj, IUrsamuSDK } from "../src/@types/UrsamuSDK.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// builder-plugin is installed at runtime via ensurePlugins; skip gracefully in fresh-clone CI.
const DESTROY_PATH = new URL("../src/plugins/builder/scripts/destroy.ts", import.meta.url);
let builderInstalled = false;
try { await Deno.stat(DESTROY_PATH); builderInstalled = true; } catch { /* not installed */ }

async function execDestroy(u: ReturnType<typeof mockU>) {
  if (!builderInstalled) return; // noop if plugin not present
  const { default: script } = await import(DESTROY_PATH.href);
  await script(u as unknown as IUrsamuSDK);
}

function makeFlags(...names: string[]): Set<string> {
  return new Set(names);
}

function mockRoom(overrides: Partial<IDBObj> = {}): IDBObj {
  return {
    id: "2", name: "Lobby",
    flags: makeFlags("room"),
    state: {}, location: "", contents: [],
    ...overrides,
  };
}

function mockPlayer(overrides: Partial<IDBObj> = {}): IDBObj {
  return {
    id: "1", name: "Alice",
    flags: makeFlags("player", "connected", "builder"),
    state: { home: "1" }, location: "2", contents: [],
    ...overrides,
  };
}

interface MockUOpts {
  me?:          Partial<IDBObj>;
  here?:        Partial<IDBObj>;
  switches?:    string[];
  arg?:         string;
  searchFirst?: IDBObj | null;          // first db.search result
  searchExtra?: IDBObj[][];             // subsequent db.search results
  canEdit?:     boolean;
}

function mockU(opts: MockUOpts = {}) {
  const sent: string[] = [];
  const teleported: Array<[string, string]> = [];
  const destroyed: string[] = [];

  const me   = mockPlayer(opts.me ?? {});
  const here = mockRoom(opts.here ?? {});

  let searchCall = 0;
  const searchResults = [
    opts.searchFirst !== undefined ? (opts.searchFirst ? [opts.searchFirst] : []) : [],
    ...(opts.searchExtra ?? []),
  ];

  return Object.assign({
    me, here,
    cmd: {
      name: "@destroy",
      original: `@destroy ${opts.arg ?? ""}`,
      args: [opts.arg ?? ""],
      switches: opts.switches ?? [],
    },
    send:      (m: string) => sent.push(m),
    broadcast: () => {},
    teleport:  (who: string, where: string) => { teleported.push([who, where]); },
    canEdit:   () => Promise.resolve(opts.canEdit ?? true),
    db: {
      search:  () => Promise.resolve(searchResults[searchCall++] ?? []),
      modify:  () => Promise.resolve(),
      create:  (d: unknown) => Promise.resolve(d as IDBObj),
      destroy: (id: string) => { destroyed.push(id); return Promise.resolve(); },
    },
    util: {
      target:      () => Promise.resolve(null),
      displayName: (o: IDBObj) => o.name ?? "",
      stripSubs:   (s: string) => s,
      center:      (s: string) => s,
      ljust:       (s: string, w: number) => s.padEnd(w),
      rjust:       (s: string, w: number) => s.padStart(w),
    },
  } as unknown as IUrsamuSDK, { _sent: sent, _teleported: teleported, _destroyed: destroyed });
}

// ─── Basic guards ─────────────────────────────────────────────────────────────

Deno.test("[NOARG] @destroy — no target → usage error", OPTS, async () => {
  const u = mockU({ arg: "" });
  await execDestroy(u);
  assertStringIncludes(u._sent[0], "Usage");
});

Deno.test("[NOTGT] @destroy — target not found → not-found message", OPTS, async () => {
  const u = mockU({ arg: "Narnia", searchFirst: null });
  await execDestroy(u);
  assertStringIncludes(u._sent[0], "Could not find");
});

Deno.test("[NOEDIT] @destroy — no permission → denied", OPTS, async () => {
  const target = mockRoom({ id: "5", name: "Tower" });
  const u = mockU({ arg: "Tower", searchFirst: target, canEdit: false });
  await execDestroy(u);
  assertStringIncludes(u._sent[0], "can't destroy");
});

Deno.test("[VOID] @destroy — cannot destroy void room", OPTS, async () => {
  const target = mockRoom({ id: "0", name: "Void", flags: makeFlags("room", "void") });
  const u = mockU({ arg: "#0", searchFirst: target });
  await execDestroy(u);
  assertStringIncludes(u._sent[0], "void");
});

Deno.test("[PLAYER] @destroy — cannot destroy players", OPTS, async () => {
  const target = mockPlayer({ id: "9", name: "Bob" });
  const u = mockU({ arg: "Bob", searchFirst: target });
  await execDestroy(u);
  assertStringIncludes(u._sent[0], "@toad");
});

Deno.test("[SAFE] @destroy — SAFE flag blocks without /override", OPTS, async () => {
  const target = mockRoom({ id: "5", name: "Shrine", flags: makeFlags("room", "safe") });
  const u = mockU({ arg: "Shrine", switches: ["confirm"], searchFirst: target });
  await execDestroy(u);
  assertStringIncludes(u._sent[0], "SAFE");
});

Deno.test("[CONFIRM] @destroy — missing /confirm → prompts user", OPTS, async () => {
  const target = mockRoom({ id: "5", name: "Tower" });
  const u = mockU({ arg: "Tower", searchFirst: target });
  await execDestroy(u);
  assertStringIncludes(u._sent[0], "sure");
});

Deno.test("[OK] @destroy/confirm — destroys object and confirms", OPTS, async () => {
  const target = mockRoom({ id: "5", name: "Tower" });
  const u = mockU({
    arg: "Tower",
    switches: ["confirm"],
    searchFirst: target,
    searchExtra: [[], []], // empty occupants, then no orphaned exits
  });
  await execDestroy(u);
  assertEquals(u._destroyed.includes("5"), true);
  assertStringIncludes(u._sent.join(" "), "destroy");
});

Deno.test("[EXITS] @destroy/confirm — orphaned exits cleaned up", OPTS, async () => {
  const target = mockRoom({ id: "5", name: "Tower" });
  const exit1  = { id: "e1", name: "North", flags: makeFlags("exit"), state: {}, location: "5", contents: [] } as IDBObj;
  const u = mockU({
    arg: "Tower",
    switches: ["confirm"],
    searchFirst: target,
    searchExtra: [[], [exit1]], // empty occupants, then exit1 for orphan cleanup
  });
  await execDestroy(u);
  assertEquals(u._destroyed.includes("e1"), true);
  assertStringIncludes(u._sent.join(" "), "exit");
});

// ─── L3 exploit: other occupants NOT evicted before room is destroyed ─────────

Deno.test("[L3] @destroy — occupied room: other occupants should be sent home before destruction", OPTS, async () => {
  // Bob and Carol are in the room being destroyed. Only the actor (Alice) is
  // currently teleported. Bob and Carol are NOT evicted — this is the exploit.
  //
  // This test demonstrates the gap: after the fix, Bob and Carol must be
  // teleported to their home locations before the room is destroyed.

  const targetRoom = mockRoom({ id: "10", name: "Doomed Hall" });

  const bob   = mockPlayer({ id: "20", name: "Bob",   location: "10", state: { home: "100" } });
  const carol  = mockPlayer({ id: "21", name: "Carol", location: "10", state: { home: "101" } });

  // Actor is IN the doomed room
  const u = mockU({
    me:      { id: "1", name: "Alice", location: "10", state: { home: "1" } },
    here:    { id: "10", name: "Doomed Hall" },
    arg:     "Doomed Hall",
    switches: ["confirm"],
    searchFirst: targetRoom,
    // Second search returns occupants (bob + carol), third returns no exits
    searchExtra: [[bob, carol], []],
  });

  await execDestroy(u);

  // After the fix: bob and carol should each be teleported home
  const bobEvicted   = u._teleported.some(([, dest]) => dest === (bob.state.home   as string));
  const carolEvicted = u._teleported.some(([, dest]) => dest === (carol.state.home as string));

  // RED: these assertions FAIL before the fix (occupants are not evicted)
  assertEquals(bobEvicted,   true, "Bob should be sent home before room is destroyed");
  assertEquals(carolEvicted, true, "Carol should be sent home before room is destroyed");
});
