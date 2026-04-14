/**
 * tests/scripts_identity.test.ts
 *
 * Tests for engine-owned identity commands:
 *   - execMoniker  (@moniker)
 *   - execAlias    (@alias)
 *
 * NOTE: @name was moved to builder-plugin.
 * Tests for that command live in the builder-plugin repo.
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import type { IDBObj, IUrsamuSDK } from "../src/@types/UrsamuSDK.ts";
import { execMoniker } from "../src/commands/moniker.ts";
import { execAlias } from "../src/commands/alias.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const ROOM_ID  = "id_room1";
const ACTOR_ID = "id_actor1";
const THING_ID = "id_thing1";

type ModifyCall = [string, string, unknown];

function makeU(opts: {
  flags?: string[];
  actorId?: string;
  cmdName?: string;
  args?: string[];
  targetFn?: (name: string) => IDBObj | undefined;
  searchResults?: IDBObj[][];
  canEditFn?: (a: IDBObj, t: IDBObj) => boolean;
  modifyCalls?: ModifyCall[];
}): IUrsamuSDK & { sent: string[] } {
  const sent: string[] = [];
  let searchCallIdx = 0;
  const me: IDBObj = {
    id: opts.actorId ?? ACTOR_ID,
    name: "Admin",
    flags: new Set(opts.flags ?? ["player", "wizard", "connected"]),
    state: { name: "Admin" },
    location: ROOM_ID, contents: [],
  };
  const u = {
    me,
    here: { id: ROOM_ID, name: "TestRoom", flags: new Set(["room"]), state: {}, location: "", contents: [], broadcast: () => {} },
    cmd: {
      name: opts.cmdName ?? "@moniker",
      original: opts.cmdName ?? "@moniker",
      args: opts.args ?? [],
      switches: [],
    },
    send: (m: string) => sent.push(m),
    canEdit: (opts.canEditFn
      ? async (_a: IDBObj, t: IDBObj) => opts.canEditFn!(_a, t)
      : async () => true) as (a: IDBObj, t: IDBObj) => Promise<boolean>,
    db: {
      search: async (_q: unknown) => {
        const batch = opts.searchResults ?? [];
        const idx = searchCallIdx++;
        return batch[idx] ?? [];
      },
      modify: async (id: string, op: string, data: unknown) => {
        opts.modifyCalls?.push([id, op, data]);
      },
    },
    util: {
      target: async (_a: IDBObj, name: string, _global?: boolean): Promise<IDBObj | undefined> => {
        if (opts.targetFn) return opts.targetFn(name);
        return undefined;
      },
      displayName: (o: IDBObj) => o.name || o.id,
      stripSubs: (s: string) => s.replace(/%c[a-zA-Z]/g, "").replace(/%[nrtb]/g, ""),
    },
  } as unknown as IUrsamuSDK & { sent: string[] };
  (u as unknown as Record<string, unknown>).sent = sent;
  return u;
}

const target: IDBObj = {
  id: THING_ID, name: "Alice",
  flags: new Set(["player"]),
  state: { name: "Alice" },
  location: ROOM_ID, contents: [],
};
const thing: IDBObj = {
  id: THING_ID, name: "Lamp",
  flags: new Set(["thing"]),
  state: { name: "Lamp" },
  location: ROOM_ID, contents: [],
};

// ---------------------------------------------------------------------------
// @moniker tests
// ---------------------------------------------------------------------------

Deno.test("@moniker — non-admin/wizard gets permission denied", OPTS, async () => {
  const u = makeU({ flags: ["player"], args: ["Player=Playa"] });
  await execMoniker(u);
  assertStringIncludes(u.sent.join(" "), "Permission denied");
});

Deno.test("@moniker — no moniker value sends usage message", OPTS, async () => {
  const u = makeU({ args: ["Admin="] });
  await execMoniker(u);
  assertStringIncludes(u.sent.join(" "), "Usage");
});

Deno.test("@moniker — target not found", OPTS, async () => {
  const u = makeU({ args: ["Ghost9999=Nick"], targetFn: () => undefined });
  await execMoniker(u);
  assertStringIncludes(u.sent.join(" "), "can't find");
});

Deno.test("@moniker — wizard successfully sets moniker", OPTS, async () => {
  const modifyCalls: ModifyCall[] = [];
  const u = makeU({
    args: ["Alice=%chAlicia%cn"],
    targetFn: () => target,
    modifyCalls,
  });
  await execMoniker(u);

  assertStringIncludes(u.sent.join(" "), "moniker");
  assertStringIncludes(u.sent.join(" "), "Alice");
  assertEquals(modifyCalls.length, 1);
  assertEquals(modifyCalls[0][0], THING_ID);
  assertEquals(modifyCalls[0][1], "$set");
  assertEquals((modifyCalls[0][2] as Record<string, unknown>)["data.moniker"], "%chAlicia%cn");
});

// ---------------------------------------------------------------------------
// @alias tests
// ---------------------------------------------------------------------------

Deno.test("@alias — target not found sends error", OPTS, async () => {
  const u = makeU({
    cmdName: "@alias",
    args: ["Ghost9999=nick"],
    targetFn: () => undefined,
  });
  await execAlias(u);
  assertStringIncludes(u.sent.join(" "), "can't find");
});

Deno.test("@alias — permission denied when actor cannot edit target", OPTS, async () => {
  const u = makeU({
    cmdName: "@alias",
    args: ["Prop=knickknack"],
    targetFn: () => thing,
    canEditFn: () => false,
    searchResults: [[], []],
  });
  await execAlias(u);
  assertStringIncludes(u.sent.join(" "), "Permission denied");
});

Deno.test("@alias — successfully sets alias", OPTS, async () => {
  const modifyCalls: ModifyCall[] = [];
  const u = makeU({
    cmdName: "@alias",
    args: ["Lamp=lantern"],
    targetFn: () => thing,
    searchResults: [[], []],  // name-taken checks return empty
    modifyCalls,
  });
  await execAlias(u);

  assertStringIncludes(u.sent.join(" "), "lantern");
  assertStringIncludes(u.sent.join(" "), "Lamp");
  assertEquals(modifyCalls.length, 1);
  assertEquals(modifyCalls[0][0], THING_ID);
  assertEquals(modifyCalls[0][1], "$set");
  assertEquals((modifyCalls[0][2] as Record<string, unknown>)["data.alias"], "lantern");
});

Deno.test("@alias — clearing alias (empty value) removes it from DB", OPTS, async () => {
  const modifyCalls: ModifyCall[] = [];
  const u = makeU({
    cmdName: "@alias",
    args: ["Candle="],
    targetFn: () => ({ ...thing, name: "Candle", id: THING_ID }),
    modifyCalls,
  });
  await execAlias(u);

  assertStringIncludes(u.sent.join(" "), "removed");
  assertEquals(modifyCalls.length, 1);
  assertEquals(modifyCalls[0][1], "$unset");
});
