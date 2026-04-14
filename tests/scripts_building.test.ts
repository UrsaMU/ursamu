// deno-lint-ignore-file require-await
/**
 * tests/scripts_building.test.ts
 *
 * Tests for engine-owned building command:
 *   - execCreateObject  (@create)
 *
 * NOTE: @dig, @describe, @open, @clone, @wipe, @quota, @parent, @lock,
 * @unlink, @name, @set, &ATTR, @examine were moved to builder-plugin.
 * Tests for those commands live in the builder-plugin repo.
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import type { IDBObj, IUrsamuSDK } from "../src/@types/UrsamuSDK.ts";
import { execCreateObject } from "../src/commands/manipulation.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const ACTOR_ID = "sb_bld_admin";
const ROOM_ID  = "sb_bld_room";

type ModifyCall = [string, string, unknown];

function makeU(opts: {
  flags?: string[];
  args?: string[];
  actorState?: Record<string, unknown>;
  modifyCalls?: ModifyCall[];
}): IUrsamuSDK & { sent: string[] } {
  const sent: string[] = [];
  let createIdx = 0;
  const me: IDBObj = {
    id: ACTOR_ID, name: "BuildAdmin",
    flags: new Set(opts.flags ?? ["player", "wizard", "connected"]),
    state: opts.actorState ?? {},
    location: ROOM_ID, contents: [],
  };
  const u = {
    me,
    here: { id: ROOM_ID, name: "Build Room", flags: new Set(["room"]), state: {}, location: "", contents: [] },
    cmd: { name: "@create", original: "@create", args: opts.args ?? [], switches: [] },
    send: (m: string) => sent.push(m),
    db: {
      search: async () => [],
      modify: async (id: string, op: string, data: unknown) => {
        opts.modifyCalls?.push([id, op, data]);
      },
      create: async (template: Partial<IDBObj>): Promise<IDBObj> => {
        const id = `new_thing_${createIdx++}`;
        return {
          id,
          name: (template.state?.name as string) || "Object",
          flags: template.flags ?? new Set(["thing"]),
          state: template.state ?? {},
          location: template.location ?? me.id,
          contents: [],
        };
      },
    },
    util: { target: async () => undefined, displayName: (o: IDBObj) => o.name || o.id },
  } as unknown as IUrsamuSDK & { sent: string[] };
  (u as unknown as Record<string, unknown>).sent = sent;
  return u;
}

// ---------------------------------------------------------------------------
// @create tests
// ---------------------------------------------------------------------------

Deno.test("@create — no args sends usage message", OPTS, async () => {
  const u = makeU({ args: [""] });
  await execCreateObject(u);
  assertStringIncludes(u.sent.join(" "), "Usage");
});

Deno.test("@create — wizard creates object, dbref in confirmation", OPTS, async () => {
  const u = makeU({ args: ["TestBox"] });
  await execCreateObject(u);
  assertStringIncludes(u.sent.join(" "), "You create TestBox");
  assertEquals(u.sent.join(" ").includes("#"), true);
});

Deno.test("@create — non-wizard with quota=0 gets quota error", OPTS, async () => {
  const u = makeU({ flags: ["player", "connected"], args: ["CheapThing"], actorState: { quota: 0 } });
  await execCreateObject(u);
  assertStringIncludes(u.sent.join(" "), "quota");
});

Deno.test("@create — non-wizard with sufficient quota creates object", OPTS, async () => {
  const modifyCalls: ModifyCall[] = [];
  const u = makeU({
    flags: ["player", "connected"],
    args: ["QuotaThing"],
    actorState: { quota: 5 },
    modifyCalls,
  });
  await execCreateObject(u);
  assertStringIncludes(u.sent.join(" "), "You create QuotaThing");
  assertEquals(modifyCalls.length, 1);
  assertEquals((modifyCalls[0][2] as Record<string, unknown>)["data.quota"], 4);
});

Deno.test("@create — name with cost suffix (name=cost) is accepted", OPTS, async () => {
  const u = makeU({ args: ["PriceyBox=10"] });
  await execCreateObject(u);
  assertStringIncludes(u.sent.join(" "), "You create PriceyBox");
});
