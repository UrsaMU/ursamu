// tests/blood.test.ts -- +blood command exec paths.
import { assert, assertEquals } from "@std/assert";
import { cmds } from "@ursamu/mush";
import type { IDBObj, IUrsamuSDK } from "@ursamu/mush";

import "../splats/vtm/index.ts";
import "../splats/mortal/index.ts";
import "../commands/blood.ts";

import {
  createChar,
  findByPlayer,
  saveChar,
  setStatus,
} from "../db/charDb.ts";
import type { IWoDChar } from "../core/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function getExec(name: string): (u: IUrsamuSDK) => Promise<void> {
  const c = cmds.find((x) => x.name === name);
  if (!c) throw new Error(`command ${name} not registered`);
  return c.exec as (u: IUrsamuSDK) => Promise<void>;
}

function mockU(opts: {
  playerId: string;
  args?: string[];
  staff?: boolean;
  target?: IDBObj | null;
}) {
  const sent: string[] = [];
  const flags = new Set(["player", "connected"]);
  if (opts.staff) {
    flags.add("admin");
  }
  const me: IDBObj = {
    id: opts.playerId,
    name: "Cass",
    flags,
    state: {},
    location: "room-1",
    contents: [],
  };
  return Object.assign({
    me,
    here: {
      id: "room-1",
      name: "Room",
      flags: new Set(["room"]),
      state: {},
      location: "",
      contents: [],
    },
    cmd: {
      name: "+blood",
      original: "",
      args: opts.args ?? [],
      switches: [],
    },
    send: (m: string) => sent.push(m),
    broadcast: () => {},
    canEdit: async () => true,
    db: {
      modify: async () => {},
      search: async () => [],
      create: async () => ({}),
      destroy: async () => {},
    },
    util: {
      target: async () => opts.target ?? null,
      displayName: (o: IDBObj) => o.name ?? "Unknown",
      stripSubs: (s: string) =>
        s.replace(/%c[a-z]/gi, "").replace(/%[rntb]/gi, ""),
      center: (s: string) => s,
      ljust: (s: string, w: number) => s.padEnd(w),
      rjust: (s: string, w: number) => s.padStart(w),
    },
  } as unknown as IUrsamuSDK, { _sent: sent });
}

async function makeVtm(
  playerId: string,
  bp = 10,
): Promise<IWoDChar> {
  const c = await createChar(playerId, "vtm");
  await setStatus(c.id, "approved");
  const fresh = (await findByPlayer(playerId))!;
  fresh.generation = 13;
  fresh.bloodMax = 10;
  fresh.bloodPerTurn = 1;
  fresh.bloodPool = bp;
  fresh.willpower = 5;
  await saveChar(fresh);
  return (await findByPlayer(playerId))!;
}

Deno.test("+blood show: current/max and per-turn", OPTS, async () => {
  const exec = getExec("+blood");
  await makeVtm("blood-show-1", 7);
  const u = mockU({ playerId: "blood-show-1", args: ["", ""] });
  await exec(u);
  const sent = (u as unknown as { _sent: string[] })._sent.join("\n");
  assert(/7\/10/.test(sent));
  assert(/Per turn/i.test(sent));
});

Deno.test("+blood/spend 1: decrements bloodPool", OPTS, async () => {
  const exec = getExec("+blood");
  await makeVtm("blood-spend-1", 5);
  const u = mockU({
    playerId: "blood-spend-1",
    args: ["spend", "1"],
  });
  await exec(u);
  const fresh = await findByPlayer("blood-spend-1");
  assertEquals(fresh?.bloodPool, 4);
});

Deno.test("+blood/spend above bloodPerTurn rejects", OPTS, async () => {
  const exec = getExec("+blood");
  await makeVtm("blood-spend-cap", 10);
  const u = mockU({
    playerId: "blood-spend-cap",
    args: ["spend", "2"],
  });
  await exec(u);
  const fresh = await findByPlayer("blood-spend-cap");
  assertEquals(fresh?.bloodPool, 10);
  const sent = (u as unknown as { _sent: string[] })._sent.join("\n");
  assert(/per turn/i.test(sent));
});

Deno.test("+blood/spend insufficient rejects", OPTS, async () => {
  const exec = getExec("+blood");
  await makeVtm("blood-spend-empty", 0);
  const u = mockU({
    playerId: "blood-spend-empty",
    args: ["spend", "1"],
  });
  await exec(u);
  const fresh = await findByPlayer("blood-spend-empty");
  assertEquals(fresh?.bloodPool, 0);
});

Deno.test("+blood/regain caps at bloodMax", OPTS, async () => {
  const exec = getExec("+blood");
  await makeVtm("blood-regain-1", 8);
  const u = mockU({
    playerId: "blood-regain-1",
    args: ["regain", "5"],
  });
  await exec(u);
  const fresh = await findByPlayer("blood-regain-1");
  assertEquals(fresh?.bloodPool, 10);
});

Deno.test("+blood mortal rejected", OPTS, async () => {
  const exec = getExec("+blood");
  const c = await createChar("blood-mortal", "mortal");
  await setStatus(c.id, "approved");
  const u = mockU({ playerId: "blood-mortal", args: ["", ""] });
  await exec(u);
  const sent = (u as unknown as { _sent: string[] })._sent.join("\n");
  assert(/no Blood pool/i.test(sent));
});

Deno.test("+blood/set staff sets current", OPTS, async () => {
  const exec = getExec("+blood");
  await makeVtm("blood-set-tgt", 3);
  const u = mockU({
    playerId: "blood-set-staff",
    args: ["set", "9 blood-set-tgt"],
    staff: true,
    target: {
      id: "blood-set-tgt",
      name: "Tgt",
      flags: new Set(["player"]),
      state: {},
      location: "room-1",
      contents: [],
    },
  });
  // Staff needs a char? findByPlayer uses target.id = playerId of char
  await exec(u);
  const fresh = await findByPlayer("blood-set-tgt");
  assertEquals(fresh?.bloodPool, 9);
});

Deno.test("+blood/set non-staff denied", OPTS, async () => {
  const exec = getExec("+blood");
  await makeVtm("blood-set-deny", 5);
  const u = mockU({
    playerId: "blood-set-deny",
    args: ["set", "1 someone"],
    staff: false,
  });
  await exec(u);
  const sent = (u as unknown as { _sent: string[] })._sent.join("\n");
  assert(/Permission denied/i.test(sent));
});
