/**
 * tests/scripts_flags_set.test.ts
 *
 * Tests for engine-owned flag and status commands:
 *   - execFlags         (@flags — set/remove flags on objects)
 *   - execDoing         (@doing — set player status message)
 *   - execCreateObject  (@create — quota persistence)
 *
 * NOTE: @set and @dig were moved to builder-plugin.
 * Tests for those commands live in the builder-plugin repo.
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import type { IDBObj, IUrsamuSDK } from "../src/@types/UrsamuSDK.ts";
import { execFlags } from "../src/commands/world.ts";
import { execDoing } from "../src/commands/social.ts";
import { execCreateObject } from "../src/commands/manipulation.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const ACTOR_ID = "fsq_actor";
const ROOM_ID  = "fsq_room";
const THING_ID = "fsq_thing";

type ModifyCall = [string, string, unknown];

function makeU(opts: {
  flags?: string[];
  actorId?: string;
  cmdName?: string;
  args?: string[];
  actorState?: Record<string, unknown>;
  targetFn?: () => IDBObj | undefined;
  searchResults?: IDBObj[][];
  modifyCalls?: ModifyCall[];
  createdObjects?: IDBObj[];
  setFlagsCalls?: Array<[string, string]>;
}): IUrsamuSDK & { sent: string[]; broadcasts: string[] } {
  const sent: string[] = [];
  const broadcasts: string[] = [];
  let createCallIdx = 0;
  const actorState = opts.actorState ?? {};
  const me: IDBObj = {
    id: opts.actorId ?? ACTOR_ID,
    name: "Player",
    flags: new Set(opts.flags ?? ["player", "connected"]),
    state: actorState,
    location: ROOM_ID, contents: [],
  };
  const u = {
    me,
    here: {
      id: ROOM_ID, name: "Test Room",
      flags: new Set(["room"]), state: {}, location: "", contents: [],
      broadcast: (m: string) => broadcasts.push(m),
    },
    cmd: {
      name: opts.cmdName ?? "@flags",
      original: opts.cmdName ?? "@flags",
      args: opts.args ?? [],
      switches: [],
    },
    send: (m: string) => sent.push(m),
    canEdit: async () => true,
    setFlags: async (id: string, flags: string) => {
      opts.setFlagsCalls?.push([id, flags]);
    },
    db: {
      search: async (_q: unknown) => [],
      modify: async (id: string, op: string, data: unknown) => {
        opts.modifyCalls?.push([id, op, data]);
      },
      create: async (template: Partial<IDBObj>): Promise<IDBObj> => {
        const idx = createCallIdx++;
        const prebuilt = opts.createdObjects?.[idx];
        if (prebuilt) return prebuilt;
        const newObj: IDBObj = {
          id: `new_obj_${idx}`,
          name: (template.state?.name as string) || "Object",
          flags: template.flags ?? new Set(["thing"]),
          state: template.state ?? {},
          location: template.location ?? me.id,
          contents: [],
        };
        return newObj;
      },
    },
    util: {
      target: async (_a: IDBObj, _name: string): Promise<IDBObj | undefined> => {
        if (opts.targetFn) return opts.targetFn();
        return undefined;
      },
      displayName: (o: IDBObj) => o.name || o.id,
      stripSubs: (s: string) => s,
    },
  } as unknown as IUrsamuSDK & { sent: string[]; broadcasts: string[] };
  (u as unknown as Record<string, unknown>).sent = sent;
  (u as unknown as Record<string, unknown>).broadcasts = broadcasts;
  return u;
}

const thingObj: IDBObj = {
  id: THING_ID, name: "TargetBox",
  flags: new Set(["thing"]), state: {}, location: ROOM_ID, contents: [],
};

// ---------------------------------------------------------------------------
// @flags tests
// ---------------------------------------------------------------------------

Deno.test("@flags — missing = sends usage message", OPTS, async () => {
  const u = makeU({ flags: ["player", "wizard", "connected"], args: ["noequalshere"] });
  await execFlags(u);
  assertStringIncludes(u.sent.join(" "), "Usage");
});

Deno.test("@flags — empty flags after = sends usage message", OPTS, async () => {
  const u = makeU({ flags: ["player", "wizard", "connected"], args: ["sometarget="] });
  await execFlags(u);
  assertStringIncludes(u.sent.join(" "), "Usage");
});

Deno.test("@flags — target not found sends error", OPTS, async () => {
  const u = makeU({ flags: ["player", "wizard", "connected"], args: ["GhostThing99=builder"] });
  await execFlags(u);
  assertStringIncludes(u.sent.join(" "), "can't find");
});

Deno.test("@flags — wizard sets flag on object", OPTS, async () => {
  const setFlagsCalls: Array<[string, string]> = [];
  const u = makeU({
    flags: ["player", "wizard", "connected"],
    args: ["TargetBox=safe"],
    targetFn: () => thingObj,
    setFlagsCalls,
  });
  await execFlags(u);

  assertStringIncludes(u.sent.join(" "), "Flags set on");
  assertEquals(setFlagsCalls.length, 1);
  assertEquals(setFlagsCalls[0][0], THING_ID);
  assertEquals(setFlagsCalls[0][1], "safe");
});

// ---------------------------------------------------------------------------
// @doing tests
// ---------------------------------------------------------------------------

Deno.test("@doing — sets status message", OPTS, async () => {
  const modifyCalls: ModifyCall[] = [];
  const u = makeU({ cmdName: "@doing", args: ["Writing code"], modifyCalls });
  await execDoing(u);

  assertStringIncludes(u.sent.join(" "), "Writing code");
  assertEquals(modifyCalls.length, 1);
  assertEquals(modifyCalls[0][0], ACTOR_ID);
  assertEquals(modifyCalls[0][1], "$set");
  assertEquals((modifyCalls[0][2] as Record<string, unknown>)["data.doing"], "Writing code");
});

Deno.test("@doing — clears status when given no args", OPTS, async () => {
  const modifyCalls: ModifyCall[] = [];
  const u = makeU({ cmdName: "@doing", args: [""], actorState: { doing: "Old status" }, modifyCalls });
  await execDoing(u);

  assertStringIncludes(u.sent.join(" "), "cleared");
  assertEquals(modifyCalls.length, 1);
  assertEquals(modifyCalls[0][1], "$unset");
});

Deno.test("@doing — rejects message over 100 chars", OPTS, async () => {
  const u = makeU({ cmdName: "@doing", args: ["x".repeat(101)] });
  await execDoing(u);
  assertStringIncludes(u.sent.join(" "), "too long");
});

// ---------------------------------------------------------------------------
// @create (object builder) tests
// ---------------------------------------------------------------------------

Deno.test("@create — no args sends usage message", OPTS, async () => {
  const u = makeU({ flags: ["player", "wizard", "connected"], cmdName: "@create", args: [""] });
  await execCreateObject(u);
  assertStringIncludes(u.sent.join(" "), "Usage");
});

Deno.test("@create — wizard creates object", OPTS, async () => {
  const u = makeU({ flags: ["player", "wizard", "connected"], cmdName: "@create", args: ["TestBox"] });
  await execCreateObject(u);
  assertStringIncludes(u.sent.join(" "), "You create TestBox");
  // dbref should appear in the message
  const msg = u.sent.join(" ");
  assertEquals(msg.includes("#"), true);
});

Deno.test("@create — non-wizard with quota=0 gets quota error", OPTS, async () => {
  const u = makeU({
    flags: ["player", "connected"],
    cmdName: "@create",
    args: ["CheapThing"],
    actorState: { quota: 0 },
  });
  await execCreateObject(u);
  assertStringIncludes(u.sent.join(" "), "quota");
});

Deno.test("@create — non-wizard with sufficient quota creates object", OPTS, async () => {
  const modifyCalls: ModifyCall[] = [];
  const u = makeU({
    flags: ["player", "connected"],
    cmdName: "@create",
    args: ["QuotaThing"],
    actorState: { quota: 5 },
    modifyCalls,
  });
  await execCreateObject(u);
  assertStringIncludes(u.sent.join(" "), "You create QuotaThing");
  // quota should be decremented
  assertEquals(modifyCalls.length, 1);
  assertEquals(modifyCalls[0][1], "$set");
  assertEquals((modifyCalls[0][2] as Record<string, unknown>)["data.quota"], 4);
});

Deno.test("@create — name with cost suffix (name=cost) is accepted", OPTS, async () => {
  const u = makeU({ flags: ["player", "wizard", "connected"], cmdName: "@create", args: ["PriceyBox=10"] });
  await execCreateObject(u);
  assertStringIncludes(u.sent.join(" "), "You create PriceyBox");
});
