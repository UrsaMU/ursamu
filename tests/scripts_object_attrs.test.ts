/**
 * tests/scripts_object_attrs.test.ts
 *
 * Tests for @o* / @a* attribute messaging on objects:
 *   - execGet   — SUCC fires to actor; OSUCC fires to room
 *   - execDrop  — DROP fires to actor
 *   - execLook  — ODESC fires to room when looking at non-room object
 */
import { assertStringIncludes } from "@std/assert";
import type { IDBObj, IUrsamuSDK } from "../src/@types/UrsamuSDK.ts";
import { execGet, execDrop } from "../src/commands/manipulation.ts";
import { execLook } from "../src/commands/look.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const ROOM_ID  = "oa_room1";
const ACTOR_ID = "oa_actor1";
const THING_ID = "oa_thing1";

type AttrMap = Record<string, string>;

/** Build a mock IUrsamuSDK for object-attribute tests */
function makeU(opts: {
  cmdName?: string;
  args?: string[];
  actorLocation?: string;
  actorContents?: IDBObj[];
  roomContents?: IDBObj[];
  /** u.util.target returns this when called */
  targetResult?: IDBObj;
  /** u.db.search returns this for all calls */
  searchResult?: IDBObj[];
  /** u.eval returns from this map: key = "<id>/<ATTR>" */
  evalMap?: AttrMap;
  /** u.attr.get returns from this map: key = "<id>/<ATTR>" */
  attrMap?: AttrMap;
}): IUrsamuSDK & { msgs: Array<{ msg: string; target?: string }>; broadcasts: string[] } {
  const msgs: Array<{ msg: string; target?: string }> = [];
  const broadcasts: string[] = [];

  const me: IDBObj = {
    id: ACTOR_ID,
    name: "Tester",
    flags: new Set(["player", "connected"]),
    state: { name: "Tester" },
    location: opts.actorLocation ?? ROOM_ID,
    contents: opts.actorContents ?? [],
  };

  const here = {
    id: ROOM_ID,
    name: "Test Room",
    flags: new Set(["room"]),
    state: { description: "A plain room." },
    location: "",
    contents: opts.roomContents ?? [],
    broadcast: (m: string) => broadcasts.push(m),
  };

  const u = {
    me,
    here,
    cmd: {
      name: opts.cmdName ?? "get",
      original: opts.cmdName ?? "get",
      args: opts.args ?? [],
      switches: [],
    },
    send: (m: string, tgt?: string) => msgs.push({ msg: m, target: tgt }),
    canEdit: async () => true,
    db: {
      search: async (): Promise<IDBObj[]> => opts.searchResult ?? [],
      modify: async () => {},
      create: async (t: Partial<IDBObj>) => ({ id: "new1", name: "", flags: new Set<string>(), state: {}, contents: [], ...t } as IDBObj),
      destroy: async () => {},
    },
    util: {
      target: async (): Promise<IDBObj | undefined> => opts.targetResult,
      displayName: (o: IDBObj) => o.name || o.id,
      stripSubs: (s: string) => s,
    },
    eval: async (id: string, attr: string): Promise<string> => {
      return (opts.evalMap ?? {})[`${id}/${attr}`] ?? "";
    },
    attr: {
      get: async (id: string, name: string): Promise<string | null> => {
        const val = (opts.attrMap ?? {})[`${id}/${name}`];
        return val !== undefined ? val : null;
      },
      set: async () => {},
      del: async () => {},
    },
  } as unknown as IUrsamuSDK & { msgs: Array<{ msg: string; target?: string }>; broadcasts: string[] };

  (u as unknown as Record<string, unknown>).msgs = msgs;
  (u as unknown as Record<string, unknown>).broadcasts = broadcasts;
  return u;
}

// ===========================================================================
// execGet — SUCC fires to actor
// ===========================================================================

Deno.test("get with SUCC — actor receives the SUCC text instead of default", OPTS, async () => {
  const thing: IDBObj = {
    id: THING_ID, name: "Magic Orb",
    flags: new Set(["thing"]), state: {}, location: ROOM_ID, contents: [],
  };
  const u = makeU({
    args: ["Magic Orb"],
    targetResult: thing,
    evalMap: { [`${THING_ID}/SUCC`]: "The orb glows as you pick it up!" },
  });
  await execGet(u);
  assertStringIncludes(u.msgs.map((m) => m.msg).join(" "), "The orb glows as you pick it up!");
});

// ===========================================================================
// execGet — OSUCC fires to room broadcast
// ===========================================================================

Deno.test("get with OSUCC — room broadcast contains the OSUCC text", OPTS, async () => {
  const thing: IDBObj = {
    id: THING_ID, name: "Gem",
    flags: new Set(["thing"]), state: {}, location: ROOM_ID, contents: [],
  };
  const u = makeU({
    args: ["Gem"],
    targetResult: thing,
    evalMap: { [`${THING_ID}/OSUCC`]: "carefully lifts the gem into the air." },
  });
  await execGet(u);
  assertStringIncludes(u.broadcasts.join(" "), "carefully lifts the gem into the air.");
});

// ===========================================================================
// execDrop — DROP fires to actor
// ===========================================================================

Deno.test("drop with DROP — actor receives the DROP text instead of default", OPTS, async () => {
  const thing: IDBObj = {
    id: THING_ID, name: "Vase",
    flags: new Set(["thing"]), state: {}, location: ACTOR_ID, contents: [],
  };
  const u = makeU({
    cmdName: "drop",
    args: ["Vase"],
    targetResult: thing,
    evalMap: { [`${THING_ID}/DROP`]: "The vase shatters as it hits the floor!" },
  });
  await execDrop(u);
  assertStringIncludes(u.msgs.map((m) => m.msg).join(" "), "The vase shatters as it hits the floor!");
});

// ===========================================================================
// execLook — ODESC fires to room broadcast
// ===========================================================================

Deno.test("look at object with ODESC — room broadcast fires", OPTS, async () => {
  const painting: IDBObj = {
    id: THING_ID, name: "Painting",
    flags: new Set(["thing"]), state: { description: "A beautiful landscape." }, location: ROOM_ID, contents: [],
  };
  const u = makeU({
    cmdName: "look",
    args: ["Painting"],
    roomContents: [painting],
    searchResult: [painting],
    attrMap: { [`${THING_ID}/ODESC`]: "studies the painting with great interest." },
  });
  await execLook(u);
  assertStringIncludes(u.broadcasts.join(" "), "studies the painting with great interest.");
});

// ===========================================================================
// execGet without attributes — default message fires
// ===========================================================================

Deno.test("get without attributes — default 'pick up' message fires", OPTS, async () => {
  const thing: IDBObj = {
    id: THING_ID, name: "Stone",
    flags: new Set(["thing"]), state: {}, location: ROOM_ID, contents: [],
  };
  const u = makeU({ args: ["Stone"], targetResult: thing });
  await execGet(u);
  assertStringIncludes(u.msgs.map((m) => m.msg).join(" "), "pick up");
});
