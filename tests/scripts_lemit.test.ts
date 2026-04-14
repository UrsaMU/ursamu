/**
 * tests/scripts_lemit.test.ts
 *
 * Tests for @lemit command (src/commands/comms.ts — execLemit).
 * Verifies it sends to all connected occupants of the enactor's room
 * and fires the room:text event for ^-pattern listeners.
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import type { IDBObj, IUrsamuSDK } from "../src/@types/UrsamuSDK.ts";
import { execLemit } from "../src/commands/comms.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function mockRoom(overrides: Partial<IDBObj> = {}): IDBObj {
  return { id: "2", name: "Lobby", flags: new Set(["room"]), state: {}, location: "", contents: [], ...overrides };
}

function mockPlayer(overrides: Partial<IDBObj> = {}): IDBObj {
  return { id: "1", name: "Alice", flags: new Set(["player", "connected", "builder"]), state: {}, location: "2", contents: [], ...overrides };
}

function mockU(opts: { me?: Partial<IDBObj>; arg?: string; occupants?: IDBObj[] } = {}) {
  const sent: Array<[string, string | undefined]> = [];
  const emitted: Array<[string, unknown]> = [];
  const me   = mockPlayer(opts.me ?? {});
  const here = mockRoom();
  return Object.assign({
    me, here,
    cmd: { name: "lemit", original: `@lemit ${opts.arg ?? ""}`, args: [opts.arg ?? ""], switches: [] },
    send: (m: string, target?: string) => sent.push([m, target]),
    broadcast: () => {},
    canEdit: () => Promise.resolve(true),
    db: {
      search: () => Promise.resolve(opts.occupants ?? [] as IDBObj[]),
      modify: () => Promise.resolve(),
      create: (d: unknown) => Promise.resolve(d as IDBObj),
      destroy: () => Promise.resolve(),
    },
    util: {
      target: () => Promise.resolve(null),
      displayName: (o: IDBObj) => o.name ?? "",
      stripSubs: (s: string) => s,
      center: (s: string) => s,
      ljust: (s: string, w: number) => s.padEnd(w),
      rjust: (s: string, w: number) => s.padStart(w),
    },
    events: {
      emit: (event: string, data: unknown) => { emitted.push([event, data]); return Promise.resolve(); },
      on: () => Promise.resolve(""),
      off: () => Promise.resolve(),
    },
    evalString: (s: string) => Promise.resolve(s),
  } as unknown as IUrsamuSDK, { _sent: sent, _emitted: emitted });
}

Deno.test("@lemit — sends message to all connected occupants", OPTS, async () => {
  const occ1 = mockPlayer({ id: "10", name: "Bob" });
  const occ2 = mockPlayer({ id: "11", name: "Eve" });
  const u = mockU({ arg: "Thunder rolls!", occupants: [occ1, occ2] });
  await execLemit(u);

  assertEquals(u._sent.filter(([, t]) => t === "10").length, 1);
  assertEquals(u._sent.filter(([, t]) => t === "11").length, 1);
  assertEquals(u._sent[0][0], "Thunder rolls!");
});

Deno.test("@lemit — fires room:text event for ^-patterns", OPTS, async () => {
  const u = mockU({ arg: "A bell rings.", occupants: [] });
  await execLemit(u);

  const roomTextEmit = u._emitted.find(([e]) => e === "room:text");
  assertEquals(roomTextEmit !== undefined, true);
  const data = roomTextEmit![1] as { roomId: string; text: string; speakerId: string };
  assertEquals(data.roomId, "2");
  assertEquals(data.text, "A bell rings.");
  assertEquals(data.speakerId, "1");
});

Deno.test("@lemit — empty message shows usage", OPTS, async () => {
  const u = mockU({ arg: "" });
  await execLemit(u);
  assertEquals(u._sent.length, 1);
  assertStringIncludes(u._sent[0][0], "Usage");
});

Deno.test("@lemit — sends nothing to disconnected occupants (search filters them)", OPTS, async () => {
  // The db.search call uses the connected flag filter — test that we pass nothing through
  // if the search returns empty (simulating no connected players)
  const u = mockU({ arg: "Hello void.", occupants: [] });
  await execLemit(u);
  // Only the room:text event should be emitted; no u.send calls with a target
  assertEquals(u._sent.filter(([, t]) => t !== undefined).length, 0);
  assertEquals(u._emitted.length, 1);
});
