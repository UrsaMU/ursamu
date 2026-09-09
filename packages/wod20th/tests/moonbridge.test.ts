// tests/moonbridge.test.ts -- +stepside/moonbridge happy + rejects.

import { assert, assertEquals } from "@std/assert";
import { cmds } from "@ursamu/ursamu";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";

import "../splats/wta/index.ts";
import "../commands/stepside.ts";

import { createChar, findByPlayer, saveChar, setStatus } from "../db/charDb.ts";
import { createCaern, saveCaern, findCaernById } from "../db/caernDb.ts";
import type { IWoDChar } from "../core/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function getExec(name: string): (u: IUrsamuSDK) => Promise<void> {
  const c = cmds.find((x) => x.name === name);
  if (!c) throw new Error(`command ${name} not registered`);
  return c.exec as (u: IUrsamuSDK) => Promise<void>;
}

interface MockOpts {
  playerId: string;
  args?: string[];
  hereCaernId?: string;
}

function mockU(opts: MockOpts) {
  const sent: string[] = [];
  const dbCalls: Array<{ id: string; op: string; payload: unknown }> = [];
  const me: IDBObj = {
    id: opts.playerId, name: "Storms",
    flags: new Set(["player", "connected"]),
    state: {}, location: "room-from", contents: [],
  };
  return Object.assign({
    me,
    here: {
      id: "room-from", name: "Caern Room",
      flags: new Set(["room"]),
      state: opts.hereCaernId ? { caernId: opts.hereCaernId } : {},
      location: "", contents: [],
    },
    cmd: { name: "+stepside", original: "", args: opts.args ?? [], switches: [] },
    send: (m: string) => sent.push(m),
    broadcast: () => {},
    canEdit: async () => true,
    db: {
      modify: async (id: string, op: string, payload: unknown) => { dbCalls.push({ id, op, payload }); },
      search: async () => [],
      create: async () => ({}),
      destroy: async () => {},
    },
    util: {
      target: async () => null,
      displayName: (o: IDBObj) => o.name ?? "Unknown",
      stripSubs: (s: string) => s.replace(/%c[a-z]/gi, "").replace(/%[rntb]/gi, ""),
      center: (s: string) => s,
      ljust: (s: string, w: number) => s.padEnd(w),
      rjust: (s: string, w: number) => s.padStart(w),
    },
  } as unknown as IUrsamuSDK, { _sent: sent, _dbCalls: dbCalls });
}

async function makeWta(playerId: string, gnosis = 5): Promise<IWoDChar> {
  const c = await createChar(playerId, "wta");
  await setStatus(c.id, "approved");
  const fresh = (await findByPlayer(playerId))!;
  fresh.gnosis = gnosis; fresh.gnosisCurrent = gnosis;
  fresh.willpower = 5;
  await saveChar(fresh);
  return (await findByPlayer(playerId))!;
}

// -- happy path ------------------------------------------------------------

Deno.test("+stepside/moonbridge: moves player + spends 1 Gnosis", OPTS, async () => {
  const exec = getExec("+stepside");
  await makeWta("mb-1", 5);

  const from = await createCaern("Bridge-From", 3, "Wisdom");
  from.locationRoomId = "room-from";
  await saveCaern(from);
  const to = await createCaern("Bridge-To", 3, "Glory");
  to.locationRoomId = "room-to";
  await saveCaern(to);

  const u = mockU({
    playerId: "mb-1",
    args: ["moonbridge", "Bridge-To"],
    hereCaernId: from.id,
  });
  await exec(u);

  const calls = (u as unknown as { _dbCalls: Array<{ id: string; op: string; payload: Record<string, unknown> }> })._dbCalls;
  const move = calls.find((c) => c.id === "mb-1" && c.payload.location === "room-to");
  assert(move, "expected location update on the player");

  const fresh = await findByPlayer("mb-1");
  assertEquals(fresh?.gnosisCurrent, 4);
});

// -- rejects ---------------------------------------------------------------

Deno.test("+stepside/moonbridge: not in a caern -> reject without spend", OPTS, async () => {
  const exec = getExec("+stepside");
  await makeWta("mb-2", 5);
  const to = await createCaern("Anywhere", 2, "Honor");
  to.locationRoomId = "room-to";
  await saveCaern(to);

  const u = mockU({
    playerId: "mb-2", args: ["moonbridge", "Anywhere"], // no hereCaernId
  });
  await exec(u);

  const fresh = await findByPlayer("mb-2");
  assertEquals(fresh?.gnosisCurrent, 5, "no Gnosis spent when not in a caern");
});

Deno.test("+stepside/moonbridge: unknown target caern rejects", OPTS, async () => {
  const exec = getExec("+stepside");
  await makeWta("mb-3", 5);
  const from = await createCaern("Bridge-From-3", 2, "Wisdom");
  from.locationRoomId = "room-from";
  await saveCaern(from);

  const u = mockU({
    playerId: "mb-3", args: ["moonbridge", "Nowhere"], hereCaernId: from.id,
  });
  await exec(u);
  const fresh = await findByPlayer("mb-3");
  assertEquals(fresh?.gnosisCurrent, 5);
});

Deno.test("+stepside/moonbridge: target caern not bound to a room rejects", OPTS, async () => {
  const exec = getExec("+stepside");
  await makeWta("mb-4", 5);
  const from = await createCaern("Bridge-From-4", 2, "Wisdom");
  from.locationRoomId = "room-from";
  await saveCaern(from);
  await createCaern("Unbound-Caern", 2, "Glory"); // no locationRoomId

  const u = mockU({
    playerId: "mb-4", args: ["moonbridge", "Unbound-Caern"], hereCaernId: from.id,
  });
  await exec(u);
  const fresh = await findByPlayer("mb-4");
  assertEquals(fresh?.gnosisCurrent, 5);
});

Deno.test("+stepside/moonbridge: no Gnosis rejects", OPTS, async () => {
  const exec = getExec("+stepside");
  const c = await makeWta("mb-5", 5);
  c.gnosisCurrent = 0;
  await saveChar(c);

  const from = await createCaern("Bridge-From-5", 2, "Wisdom");
  from.locationRoomId = "room-from";
  await saveCaern(from);
  const to = await createCaern("Bridge-To-5", 2, "Glory");
  to.locationRoomId = "room-to";
  await saveCaern(to);

  const u = mockU({
    playerId: "mb-5", args: ["moonbridge", "Bridge-To-5"], hereCaernId: from.id,
  });
  await exec(u);
  const calls = (u as unknown as { _dbCalls: Array<{ id: string; payload: Record<string, unknown> }> })._dbCalls;
  assert(!calls.some((c) => c.id === "mb-5" && c.payload.location === "room-to"),
    "must not move player when out of Gnosis");

  // sanity: caern lookups don't blow up
  assert(await findCaernById(from.id));
});
