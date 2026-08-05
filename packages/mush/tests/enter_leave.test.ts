/**
 * enter / leave — object containment rules.
 */
import { assertEquals } from "@std/assert";
import {
  canEnterObject,
  passesEnterLock,
} from "../src/verbs/container-access.ts";
import type { IDBObj, IUrsamuSDK } from "../src/commands/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function mockObj(
  id: string,
  flags: string[],
  extra: Partial<IDBObj> = {},
): IDBObj {
  return {
    id,
    name: id,
    flags: new Set(flags),
    state: {},
    location: "1",
    contents: [],
    ...extra,
  };
}

function mockU(actor: IDBObj, canEdit = false): IUrsamuSDK {
  return {
    me: actor,
    canEdit: async () => canEdit,
  } as unknown as IUrsamuSDK;
}

Deno.test("passesEnterLock: default deny without enter_ok", OPTS, async () => {
  const actor = mockObj("2", ["player", "connected"]);
  const box = mockObj("9", ["thing"], { location: "1" });
  actor.location = "1";
  const u = mockU(actor, false);
  assertEquals(await passesEnterLock(u, actor, box), false);
});

Deno.test("passesEnterLock: enter_ok allows", OPTS, async () => {
  const actor = mockObj("2", ["player", "connected"]);
  const box = mockObj("9", ["thing", "enter_ok"], { location: "1" });
  actor.location = "1";
  const u = mockU(actor, false);
  assertEquals(await passesEnterLock(u, actor, box), true);
});

Deno.test("passesEnterLock: owner canEdit allows", OPTS, async () => {
  const actor = mockObj("2", ["player", "connected"]);
  const box = mockObj("9", ["thing"], { location: "1" });
  actor.location = "1";
  const u = mockU(actor, true);
  assertEquals(await passesEnterLock(u, actor, box), true);
});

Deno.test("canEnterObject: rooms and exits never", OPTS, async () => {
  const actor = mockObj("2", ["player", "connected"], { location: "1" });
  const room = mockObj("1", ["room", "enter_ok"]);
  const exit = mockObj("3", ["exit", "enter_ok"], { location: "1" });
  const u = mockU(actor, true);
  assertEquals(await canEnterObject(u, actor, room), false);
  assertEquals(await canEnterObject(u, actor, exit), false);
});

Deno.test("canEnterObject: players default locked", OPTS, async () => {
  const actor = mockObj("2", ["player", "connected"], { location: "1" });
  const other = mockObj("5", ["player", "connected"], { location: "1" });
  const u = mockU(actor, false);
  assertEquals(await canEnterObject(u, actor, other), false);
});

Deno.test("canEnterObject: player with enter_ok", OPTS, async () => {
  const actor = mockObj("2", ["player", "connected"], { location: "1" });
  const other = mockObj("5", ["player", "connected", "enter_ok"], {
    location: "1",
  });
  const u = mockU(actor, false);
  assertEquals(await canEnterObject(u, actor, other), true);
});

Deno.test("canEnterObject: must be nearby", OPTS, async () => {
  const actor = mockObj("2", ["player", "connected"], { location: "1" });
  const box = mockObj("9", ["thing", "enter_ok"], { location: "99" });
  const u = mockU(actor, false);
  assertEquals(await canEnterObject(u, actor, box), false);
});
