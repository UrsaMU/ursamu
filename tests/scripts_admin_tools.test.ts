// deno-lint-ignore-file require-await
/**
 * tests/scripts_admin_tools.test.ts
 *
 * Tests for admin power-tool commands:
 *   - execTel       (@tel  — admin teleport)
 *   - execForce     (@force — run command as another object)
 *   - execSweep     (@sweep — list reactive objects in room)
 *   - execEntrances (@entrances — list exits pointing to a location)
 *   - execTime      (@time / @time/set)
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import type { IDBObj, IUrsamuSDK, IGameTime } from "../src/@types/UrsamuSDK.ts";
import { execTel, execForce, execSweep, execEntrances, execTime } from "../src/commands/world.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const ROOM_ID   = "at_room1";
const ACTOR_ID  = "at_actor1";
const TARGET_ID = "at_target1";
const DEST_ID   = "at_dest1";
const EXIT_ID   = "at_exit1";
const NPC_ID    = "at_npc1";

type SentMsg = { msg: string; target?: string };

function makeU(opts: {
  flags?: string[];
  cmdName?: string;
  args?: string[];
  switches?: string[];
  targetFn?: (callIdx: number) => IDBObj | undefined;
  searchResults?: IDBObj[][];
  modifyCalls?: Array<[string, string, unknown]>;
  forceCalls?: Array<{ tId: string; cmd: string }>;
  setGameTimeCalls?: IGameTime[];
  currentGameTime?: IGameTime;
}): IUrsamuSDK & { sent: SentMsg[] } {
  const sent: SentMsg[] = [];
  let targetCallIdx = 0;
  let searchCallIdx = 0;
  const me: IDBObj = {
    id: ACTOR_ID, name: "Admin",
    flags: new Set(opts.flags ?? ["admin"]),
    state: {},
    location: ROOM_ID, contents: [],
  };
  const u = {
    me,
    here: { id: ROOM_ID, name: "Test Room", flags: new Set(["room"]), state: {}, location: "", contents: [] },
    cmd: {
      name: opts.cmdName ?? "@tel",
      original: opts.cmdName ?? "@tel",
      args: opts.args ?? [],
      switches: opts.switches ?? [],
    },
    send: (m: string, target?: string) => sent.push({ msg: m, target }),
    forceAs: async (tId: string, cmd: string) => {
      opts.forceCalls?.push({ tId, cmd });
    },
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
      target: async (_a: IDBObj, _name: string) => {
        if (opts.targetFn) return opts.targetFn(targetCallIdx++) ?? undefined;
        return undefined;
      },
      displayName: (o: IDBObj) => o.name || o.id,
    },
    sys: {
      gameTime: async () =>
        opts.currentGameTime ?? { year: 1, month: 1, day: 1, hour: 0, minute: 0 },
      setGameTime: async (t: IGameTime) => {
        opts.setGameTimeCalls?.push(t);
      },
      uptime: async () => 0,
    },
  } as unknown as IUrsamuSDK & { sent: SentMsg[] };
  (u as unknown as Record<string, unknown>).sent = sent;
  return u;
}

// ---------------------------------------------------------------------------
// @tel tests
// ---------------------------------------------------------------------------

Deno.test("@tel — non-admin rejected with Permission denied", OPTS, async () => {
  const u = makeU({ flags: ["player", "connected"], args: ["SomeOne=SomePlace"] });
  await execTel(u);
  assertStringIncludes(u.sent.map((r) => r.msg).join(" "), "Permission denied");
});

Deno.test("@tel — no = sends usage", OPTS, async () => {
  const u = makeU({ flags: ["admin", "wizard"], args: ["NoEquals"] });
  await execTel(u);
  assertStringIncludes(u.sent.map((r) => r.msg).join(" "), "Usage");
});

Deno.test("@tel — target not found", OPTS, async () => {
  const u = makeU({ flags: ["admin"], args: ["Ghost=SomeRoom"], targetFn: () => undefined });
  await execTel(u);
  assertStringIncludes(u.sent.map((r) => r.msg).join(" "), "can't find");
});

Deno.test("@tel — admin moves player, db.modify called with new location", OPTS, async () => {
  const modifyCalls: Array<[string, string, unknown]> = [];
  let call = 0;
  const u = makeU({
    flags: ["admin"],
    args: [`${TARGET_ID}=${DEST_ID}`],
    modifyCalls,
    targetFn: () => {
      call++;
      if (call === 1)
        return { id: TARGET_ID, name: "Victim", flags: new Set(["player"]), state: {}, contents: [] };
      return { id: DEST_ID, name: "Hall", flags: new Set(["room"]), state: {}, contents: [] };
    },
  });
  await execTel(u);
  assertEquals(modifyCalls.length, 1);
  assertEquals(modifyCalls[0][0], TARGET_ID);
  assertEquals(modifyCalls[0][1], "$set");
  assertStringIncludes(u.sent.map((r) => r.msg).join(" "), "teleport");
});

// M5 — wizard must NOT be able to teleport a peer/superior target
Deno.test("M5 — wizard must NOT teleport an admin target (peer escalation)", OPTS, async () => {
  const modifyCalls: Array<[string, string, unknown]> = [];
  let call = 0;
  const u = makeU({
    flags: ["wizard"],
    args: [`${TARGET_ID}=${DEST_ID}`],
    modifyCalls,
    targetFn: () => {
      call++;
      if (call === 1)
        return { id: TARGET_ID, name: "Admin", flags: new Set(["admin"]), state: {}, contents: [] };
      return { id: DEST_ID, name: "Hall", flags: new Set(["room"]), state: {}, contents: [] };
    },
  });
  await execTel(u);
  if (modifyCalls.length > 0) {
    throw new Error(
      `M5 EXPLOIT: wizard teleported admin target — db.modify was called ${modifyCalls.length} time(s)`
    );
  }
  assertStringIncludes(u.sent.map((r) => r.msg).join(" "), "Permission denied");
});

// ---------------------------------------------------------------------------
// @force tests
// ---------------------------------------------------------------------------

Deno.test("@force — non-admin rejected", OPTS, async () => {
  const u = makeU({ flags: ["player", "connected"], cmdName: "@force", args: ["Target=say hello"] });
  await execForce(u);
  assertStringIncludes(u.sent.map((r) => r.msg).join(" "), "Permission denied");
});

Deno.test("@force — no = sends usage", OPTS, async () => {
  const u = makeU({ flags: ["admin"], cmdName: "@force", args: ["NoEqualsHere"] });
  await execForce(u);
  assertStringIncludes(u.sent.map((r) => r.msg).join(" "), "Usage");
});

Deno.test("@force — target not found sends I can't find", OPTS, async () => {
  const u = makeU({ flags: ["wizard"], cmdName: "@force", args: ["Ghost=say hi"], targetFn: () => undefined });
  await execForce(u);
  assertStringIncludes(u.sent.map((r) => r.msg).join(" "), "can't find");
});

Deno.test("@force — cannot force superuser as non-superuser", OPTS, async () => {
  const u = makeU({
    flags: ["admin", "wizard"],
    cmdName: "@force",
    args: [`${TARGET_ID}=say hello`],
    targetFn: () => ({ id: TARGET_ID, name: "God", flags: new Set(["superuser"]), state: {}, contents: [] }),
  });
  await execForce(u);
  assertStringIncludes(u.sent.map((r) => r.msg).join(" "), "Permission denied");
});

Deno.test("@force — admin forces command, forceAs called and actor notified", OPTS, async () => {
  const forceCalls: Array<{ tId: string; cmd: string }> = [];
  const u = makeU({
    flags: ["admin"],
    cmdName: "@force",
    args: [`${TARGET_ID}=say hello`],
    forceCalls,
    targetFn: () => ({ id: TARGET_ID, name: "Minion", flags: new Set(["player"]), state: {}, contents: [] }),
  });
  await execForce(u);
  assertEquals(forceCalls.length, 1);
  assertEquals(forceCalls[0].tId, TARGET_ID);
  assertEquals(forceCalls[0].cmd, "say hello");
  assertStringIncludes(u.sent.map((r) => r.msg).join(" "), "force");
});

// M4 — wizard must NOT force a peer-level target
Deno.test("M4 — wizard must NOT force an admin target (peer-level escalation)", OPTS, async () => {
  const forceCalls: Array<{ tId: string; cmd: string }> = [];
  const u = makeU({
    flags: ["wizard"],
    cmdName: "@force",
    args: [`${TARGET_ID}=say hello`],
    forceCalls,
    targetFn: () => ({ id: TARGET_ID, name: "Admin", flags: new Set(["admin"]), state: {}, contents: [] }),
  });
  await execForce(u);
  if (forceCalls.length > 0) {
    throw new Error(`M4 EXPLOIT: wizard forced admin target — forceAs called ${forceCalls.length} time(s)`);
  }
  assertStringIncludes(u.sent.map((r) => r.msg).join(" "), "Permission denied");
});

Deno.test("M4 — wizard must NOT force a peer wizard target", OPTS, async () => {
  const forceCalls: Array<{ tId: string; cmd: string }> = [];
  const u = makeU({
    flags: ["wizard"],
    cmdName: "@force",
    args: [`${TARGET_ID}=say hello`],
    forceCalls,
    targetFn: () => ({ id: TARGET_ID, name: "PeerWiz", flags: new Set(["wizard"]), state: {}, contents: [] }),
  });
  await execForce(u);
  if (forceCalls.length > 0) {
    throw new Error(`M4 EXPLOIT: wizard forced peer wizard target — forceAs called ${forceCalls.length} time(s)`);
  }
  assertStringIncludes(u.sent.map((r) => r.msg).join(" "), "Permission denied");
});

// ---------------------------------------------------------------------------
// @sweep tests
// ---------------------------------------------------------------------------

Deno.test("H1 — plain player @sweep must be rejected with Permission denied", OPTS, async () => {
  const u = makeU({ flags: ["player", "connected"], cmdName: "@sweep", args: [] });
  await execSweep(u);
  if (!u.sent.map((r) => r.msg).join(" ").includes("Permission denied")) {
    throw new Error(`H1 EXPLOIT: plain player ran @sweep without authorization.`);
  }
});

Deno.test("@sweep — empty room returns 'No reactive objects'", OPTS, async () => {
  const u = makeU({ flags: ["wizard"], cmdName: "@sweep", args: [], searchResults: [[]] });
  await execSweep(u);
  assertStringIncludes(u.sent.map((r) => r.msg).join(" "), "No reactive");
});

Deno.test("@sweep — room with LISTEN object lists it", OPTS, async () => {
  const npc: IDBObj = {
    id: NPC_ID, name: "Guard",
    flags: new Set(["thing"]),
    location: ROOM_ID,
    state: {
      attributes: [
        { name: "LISTEN", value: "hello", setter: "god", type: "attribute" },
        { name: "AHEAR",  value: "u.send('ok')", setter: "god", type: "attribute" },
      ],
    },
    contents: [],
  };
  const u = makeU({ flags: ["wizard"], cmdName: "@sweep", args: [], searchResults: [[npc]] });
  await execSweep(u);
  const allMsgs = u.sent.map((r) => r.msg).join("\n");
  assertStringIncludes(allMsgs, "Guard");
  assertStringIncludes(allMsgs, "LISTEN");
});

Deno.test("@sweep — actor itself is skipped even if it has reactive attrs", OPTS, async () => {
  const actorAsObj: IDBObj = {
    id: ACTOR_ID, name: "Admin",
    flags: new Set(["player"]),
    location: ROOM_ID,
    state: { attributes: [{ name: "LISTEN", value: "*", setter: "god", type: "attribute" }] },
    contents: [],
  };
  const u = makeU({ flags: ["admin"], cmdName: "@sweep", args: [], searchResults: [[actorAsObj]] });
  await execSweep(u);
  assertStringIncludes(u.sent.map((r) => r.msg).join(" "), "No reactive");
});

Deno.test("@sweep — multiple reactive attrs shown together", OPTS, async () => {
  const npc: IDBObj = {
    id: NPC_ID, name: "AutoBot",
    flags: new Set(["thing"]),
    location: ROOM_ID,
    state: {
      attributes: [
        { name: "ACONNECT",    value: "u.send('hi')", setter: "god", type: "attribute" },
        { name: "ADISCONNECT", value: "u.send('bye')", setter: "god", type: "attribute" },
      ],
    },
    contents: [],
  };
  const u = makeU({ flags: ["wizard"], cmdName: "@sweep", args: [], searchResults: [[npc]] });
  await execSweep(u);
  const allMsgs = u.sent.map((r) => r.msg).join("\n");
  assertStringIncludes(allMsgs, "ACONNECT");
  assertStringIncludes(allMsgs, "ADISCONNECT");
});

// ---------------------------------------------------------------------------
// @entrances tests
// ---------------------------------------------------------------------------

Deno.test("H2 — plain player @entrances must be rejected with Permission denied", OPTS, async () => {
  const u = makeU({ flags: ["player", "connected"], cmdName: "@entrances", args: [], searchResults: [[]] });
  await execEntrances(u);
  if (!u.sent.map((r) => r.msg).join(" ").includes("Permission denied")) {
    throw new Error(`H2 EXPLOIT: plain player ran @entrances without authorization.`);
  }
});

Deno.test("@entrances — no exits lead to room sends 'No exits'", OPTS, async () => {
  const u = makeU({ flags: ["wizard"], cmdName: "@entrances", args: [], searchResults: [[]] });
  await execEntrances(u);
  assertStringIncludes(u.sent.map((r) => r.msg).join(" "), "No exits");
});

Deno.test("@entrances — exit with matching destination is shown", OPTS, async () => {
  const jsExit: IDBObj = {
    id: EXIT_ID, name: "West Gate",
    flags: new Set(["exit"]),
    location: "at_room2",
    state: { destination: ROOM_ID },
    contents: [],
  };
  const jsRoom2: IDBObj = {
    id: "at_room2", name: "The Courtyard",
    flags: new Set(["room"]),
    state: {},
    location: "",
    contents: [],
  };
  // First search: all exits (returns jsExit); second search: look up room by id (returns jsRoom2)
  const u = makeU({
    flags: ["wizard"], cmdName: "@entrances", args: [],
    searchResults: [[jsExit], [jsRoom2]],
  });
  await execEntrances(u);
  const allMsgs = u.sent.map((r) => r.msg).join("\n");
  assertStringIncludes(allMsgs, "West Gate");
  assertStringIncludes(allMsgs, "Courtyard");
});

Deno.test("@entrances — exit not pointing to room is excluded", OPTS, async () => {
  const jsExit: IDBObj = {
    id: EXIT_ID, name: "North Door",
    flags: new Set(["exit"]),
    location: "at_room2",
    state: { destination: "some_other_room" },
    contents: [],
  };
  const u = makeU({ flags: ["wizard"], cmdName: "@entrances", args: [], searchResults: [[jsExit]] });
  await execEntrances(u);
  assertStringIncludes(u.sent.map((r) => r.msg).join(" "), "No exits");
});

Deno.test("@entrances — with explicit arg, looks up that location", OPTS, async () => {
  const destRoom: IDBObj = { id: DEST_ID, name: "Target Hall", flags: new Set(["room"]), state: {}, location: "", contents: [] };
  const jsExit: IDBObj  = {
    id: EXIT_ID, name: "South Entry",
    flags: new Set(["exit"]),
    location: "at_room2",
    state: { destination: DEST_ID },
    contents: [],
  };
  const foyer: IDBObj   = { id: "at_room2", name: "Foyer", flags: new Set(["room"]), state: {}, location: "", contents: [] };
  let sc = 0;
  const u = makeU({
    flags: ["wizard"],
    cmdName: "@entrances",
    args: ["SomeRoom"],
    targetFn: () => destRoom,
    searchResults: [[jsExit], [foyer]],
  });
  // Override searchResults with a counting mock that resets sc
  (u as unknown as { db: { search: (q: unknown) => Promise<IDBObj[]> } }).db.search = async () => {
    sc++;
    if (sc === 1) return [jsExit];
    return [foyer];
  };
  await execEntrances(u);
  const allMsgs = u.sent.map((r) => r.msg).join("\n");
  assertStringIncludes(allMsgs, "South Entry");
  assertStringIncludes(allMsgs, "Foyer");
});

// ---------------------------------------------------------------------------
// @time tests
// ---------------------------------------------------------------------------

Deno.test("M1 — @time/set with negative month must be rejected", OPTS, async () => {
  const setGTCalls: IGameTime[] = [];
  const u = makeU({
    flags: ["admin", "wizard"], cmdName: "@time", args: ["set", "month=-5"],
    setGameTimeCalls: setGTCalls,
  });
  await execTime(u);
  const badCalls = setGTCalls.filter((t) => t.month < 1);
  if (badCalls.length > 0) {
    throw new Error(`M1 EXPLOIT: @time/set accepted month=${badCalls[0].month} (< 1) — no range guard`);
  }
});

Deno.test("M1 — @time/set with overflow hour must be rejected", OPTS, async () => {
  const setGTCalls: IGameTime[] = [];
  const u = makeU({
    flags: ["admin", "wizard"], cmdName: "@time", args: ["set", "hour=99"],
    setGameTimeCalls: setGTCalls,
  });
  await execTime(u);
  const badCalls = setGTCalls.filter((t) => t.hour > 23);
  if (badCalls.length > 0) {
    throw new Error(`M1 EXPLOIT: @time/set accepted hour=${badCalls[0].hour} (> 23) — no range guard`);
  }
});

Deno.test("M1 — valid @time/set values are accepted", OPTS, async () => {
  const setGTCalls: IGameTime[] = [];
  const u = makeU({
    flags: ["admin", "wizard"], cmdName: "@time",
    args: ["set", "year=5 month=6 day=15 hour=14 minute=30"],
    setGameTimeCalls: setGTCalls,
  });
  await execTime(u);
  if (setGTCalls.length === 0) {
    throw new Error("M1: @time/set did not call setGameTime for valid inputs");
  }
  assertEquals(setGTCalls[0].month, 6);
  assertEquals(setGTCalls[0].hour, 14);
  assertStringIncludes(u.sent.map((r) => r.msg).join(" "), "Setting");
});
