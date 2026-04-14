/**
 * tests/core_migration.test.ts
 *
 * Pure-mock smoke tests for core exec functions that were previously tested
 * via system/scripts (connect.ts, flags.ts, channels.ts).
 *
 * These verify the exec functions respond correctly at the boundary level.
 * Deeper coverage lives in scripts_flags_set.test.ts and scripts_comms.test.ts.
 */
import { assertStringIncludes } from "@std/assert";
import type { IDBObj, IUrsamuSDK } from "../src/@types/UrsamuSDK.ts";
import { execConnect } from "../src/commands/auth.ts";
import { execFlags } from "../src/commands/world.ts";
import { execChannel } from "../src/commands/channels.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const ROOM_ID   = "cm_room1";
const ACTOR_ID  = "cm_actor1";
const TARGET_ID = "cm_target1";

// ---------------------------------------------------------------------------
// execConnect
// ---------------------------------------------------------------------------

Deno.test("Core Migration: connect — bad credentials sends error", OPTS, async () => {
  const sent: string[] = [];
  const u = {
    me: { id: "#-1", name: "", flags: new Set<string>(), state: {}, location: "", contents: [] },
    here: { id: ROOM_ID, name: "Limbo", flags: new Set(["room"]), state: {}, location: "", contents: [] },
    cmd: { name: "connect", args: ["TestPlayer wrongpass"], switches: [] },
    send: (m: string) => sent.push(m),
    broadcast: () => {},
    setFlags: async () => {},
    auth: {
      verify: async () => false,
      login: async () => {},
      hash: async (s: string) => s,
      compare: async () => false,
    },
    db: {
      search: async () => [],
      modify: async () => {},
      create: async (t: Partial<IDBObj>) => ({ id: "n1", name: "", flags: new Set<string>(), state: {}, contents: [], ...t } as IDBObj),
      destroy: async () => {},
    },
    util: { target: async () => undefined, displayName: (o: IDBObj) => o.name || o.id, stripSubs: (s: string) => s },
    text: { read: async () => "" },
    execute: async () => {},
  } as unknown as IUrsamuSDK;

  await execConnect(u);
  assertStringIncludes(sent.join(" "), "can't find");
});

Deno.test("Core Migration: connect — missing password sends error", OPTS, async () => {
  const sent: string[] = [];
  const u = {
    me: { id: "#-1", name: "", flags: new Set<string>(), state: {}, location: "", contents: [] },
    here: { id: ROOM_ID, name: "Limbo", flags: new Set(["room"]), state: {}, location: "", contents: [] },
    cmd: { name: "connect", args: [""], switches: [] },
    send: (m: string) => sent.push(m),
    broadcast: () => {},
    setFlags: async () => {},
    auth: { verify: async () => false, login: async () => {}, hash: async (s: string) => s, compare: async () => false },
    db: { search: async () => [], modify: async () => {}, create: async () => ({ id: "n1", name: "", flags: new Set<string>(), state: {}, contents: [] } as IDBObj), destroy: async () => {} },
    util: { target: async () => undefined, displayName: (o: IDBObj) => o.name || o.id, stripSubs: (s: string) => s },
    text: { read: async () => "" },
    execute: async () => {},
  } as unknown as IUrsamuSDK;

  await execConnect(u);
  assertStringIncludes(sent.join(" "), "name and password");
});

// ---------------------------------------------------------------------------
// execFlags
// ---------------------------------------------------------------------------

Deno.test("Core Migration: flags — wizard sets flag on target", OPTS, async () => {
  const sent: string[] = [];
  const setFlagsCalls: Array<[string, string]> = [];

  const target: IDBObj = {
    id: TARGET_ID, name: "TargetThing",
    flags: new Set(["thing"]), state: {}, location: ROOM_ID, contents: [],
  };

  const u = {
    me: {
      id: ACTOR_ID, name: "FlagsPlayer",
      flags: new Set(["player", "wizard", "connected"]),
      state: {}, location: ROOM_ID, contents: [],
    },
    here: { id: ROOM_ID, name: "Test Room", flags: new Set(["room"]), state: {}, location: "", contents: [], broadcast: () => {} },
    cmd: { name: "@flags", original: "@flags", args: ["TargetThing=safe"], switches: [] },
    send: (m: string) => sent.push(m),
    canEdit: async () => true,
    setFlags: async (id: string, flags: string) => { setFlagsCalls.push([id, flags]); },
    db: { search: async () => [], modify: async () => {}, create: async () => target, destroy: async () => {} },
    util: {
      target: async () => target,
      displayName: (o: IDBObj) => o.name || o.id,
      stripSubs: (s: string) => s,
    },
  } as unknown as IUrsamuSDK;

  await execFlags(u);
  assertStringIncludes(sent.join(" "), "Flags set on");
});

// ---------------------------------------------------------------------------
// execChannel
// ---------------------------------------------------------------------------

Deno.test("Core Migration: channels — join succeeds and confirms", OPTS, async () => {
  const sent: string[] = [];
  const joinCalls: Array<[string, string]> = [];

  const u = {
    me: {
      id: ACTOR_ID, name: "ChanPlayer",
      flags: new Set(["player", "connected"]),
      state: {}, location: ROOM_ID, contents: [],
    },
    here: { id: ROOM_ID, name: "Test Room", flags: new Set(["room"]), state: {}, location: "", contents: [] },
    cmd: { name: "@channel", original: "@channel", args: ["join", "Public=P"], switches: [] },
    send: (m: string) => sent.push(m),
    chan: {
      join: async (chan: string, alias: string) => { joinCalls.push([chan, alias]); },
      leave: async () => {},
      list: async () => [],
      history: async () => [],
      say: async () => {},
      create: async () => {},
      destroy: async () => {},
      set: async () => {},
    },
  } as unknown as IUrsamuSDK;

  await execChannel(u);
  assertStringIncludes(sent.join(" "), "Public");
});
