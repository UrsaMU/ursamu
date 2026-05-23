// deno-lint-ignore-file require-await
/**
 * tests/object_moved_hook.test.ts
 *
 * Verifies that get/drop/give emit the `object:moved` gameHook with the
 * correct from/to/cause payload.
 */
import { assertEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { gameHooks, type ObjectMovedEvent } from "../src/services/Hooks/GameHooks.ts";
import { execGet, execDrop, execGive } from "../src/commands/manipulation.ts";
import type { IDBObj, IUrsamuSDK } from "../src/@types/UrsamuSDK.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function mockPlayer(overrides: Partial<IDBObj> = {}): IDBObj {
  return {
    id: "p1",
    name: "Alice",
    flags: new Set(["player", "connected"]),
    state: { name: "Alice" },
    location: "r1",
    contents: [],
    ...overrides,
  } as IDBObj;
}

function mockU(opts: { me: IDBObj; thing: IDBObj | null; receiver?: IDBObj | null; args: string[] }) {
  const sent: string[] = [];
  const targets = [opts.thing, opts.receiver];
  let idx = 0;
  return {
    me: opts.me,
    here: { id: "r1", name: "Room", flags: new Set(["room"]), state: {}, location: "", contents: [], broadcast: () => {} },
    cmd: { name: "", original: "", args: opts.args, switches: [] },
    send: (m: string) => sent.push(m),
    broadcast: () => {},
    canEdit: async () => true,
    db: {
      modify: async () => {},
      search: async () => [],
      create: async (d: unknown) => ({ ...(d as object), id: "99", flags: new Set(), contents: [] }),
      destroy: async () => {},
    },
    util: {
      target: async () => targets[idx++] ?? null,
      displayName: (o: IDBObj) => o.name ?? "?",
      stripSubs: (s: string) => s,
      center: (s: string) => s,
      ljust: (s: string) => s,
      rjust: (s: string) => s,
    },
    eval: async () => "",
  } as unknown as IUrsamuSDK;
}

async function captureMoved(fn: () => Promise<void>): Promise<ObjectMovedEvent[]> {
  const events: ObjectMovedEvent[] = [];
  const handler = (e: ObjectMovedEvent) => { events.push(e); };
  gameHooks.on("object:moved", handler);
  try { await fn(); } finally { gameHooks.off("object:moved", handler); }
  return events;
}

Deno.test("object:moved fires on get with cause='get'", OPTS, async () => {
  const actor = mockPlayer();
  const thing = mockPlayer({ id: "t1", name: "Sword", flags: new Set(["thing"]), location: "r1", state: {} });
  const u = mockU({ me: actor, thing, args: ["Sword"] });

  const events = await captureMoved(() => execGet(u));
  assertEquals(events.length, 1);
  assertEquals(events[0].objectId, "t1");
  assertEquals(events[0].from, "r1");
  assertEquals(events[0].to, "p1");
  assertEquals(events[0].cause, "get");
  assertEquals(events[0].actorId, "p1");
});

Deno.test("object:moved fires on drop with cause='drop'", OPTS, async () => {
  const actor = mockPlayer();
  const thing = mockPlayer({ id: "t1", name: "Sword", flags: new Set(["thing"]), location: "p1", state: {} });
  const u = mockU({ me: actor, thing, args: ["Sword"] });

  const events = await captureMoved(() => execDrop(u));
  assertEquals(events.length, 1);
  assertEquals(events[0].from, "p1");
  assertEquals(events[0].to, "r1");
  assertEquals(events[0].cause, "drop");
});

Deno.test("object:moved fires on give with cause='give'", OPTS, async () => {
  const actor = mockPlayer();
  const receiver = mockPlayer({ id: "p2", name: "Bob", location: "r1", state: { name: "Bob" } });
  const thing = mockPlayer({ id: "t1", name: "Sword", flags: new Set(["thing"]), location: "p1", state: {} });
  // Give wires target() twice: receiver then thing.
  const u = mockU({ me: actor, thing, receiver, args: ["Sword", "Bob"] });
  // Patch util.target to return receiver first, then thing.
  let call = 0;
  (u.util.target as unknown) = async () => (call++ === 0 ? receiver : thing);

  const events = await captureMoved(() => execGive(u));
  assertEquals(events.length, 1);
  assertEquals(events[0].from, "p1");
  assertEquals(events[0].to, "p2");
  assertEquals(events[0].cause, "give");
  assertEquals(events[0].actorId, "p1");
});
