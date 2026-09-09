// tests/fetish.test.ts -- +fetish use / deactivate / list / info flow.
//
// Exec-level tests against the real cmds registry. Items live in the
// actor's `contents`; we mock u.db.modify and snapshot what gets written.

import { assert, assertEquals } from "@std/assert";
import { cmds } from "@ursamu/ursamu";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";

import "../splats/wta/index.ts";
import "../splats/mortal/index.ts";
import "../splats/kinfolk/index.ts";
import "../commands/fetish.ts";

import { createChar, findByPlayer, saveChar, setStatus } from "../db/charDb.ts";
import { getEqMeta } from "../core/eq.ts";
import type { IWoDChar, SplatId } from "../core/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function getExec(name: string): (u: IUrsamuSDK) => Promise<void> {
  const c = cmds.find((x) => x.name === name);
  if (!c) throw new Error(`command ${name} not registered`);
  return c.exec as (u: IUrsamuSDK) => Promise<void>;
}

// deno-lint-ignore no-explicit-any
function makeItem(id: string, name: string, state: Record<string, unknown> = {}): any {
  return { id, name, state, contents: [], flags: new Set() };
}

interface MockOpts {
  playerId: string;
  args?: string[];
  // deno-lint-ignore no-explicit-any
  contents?: any[];
}

function mockU(opts: MockOpts) {
  const sent: string[] = [];
  const dbCalls: Array<{ id: string; op: string; payload: unknown }> = [];
  const me: IDBObj = {
    id: opts.playerId,
    name: "Storms",
    flags: new Set(["player", "connected"]),
    state: {},
    location: "room-1",
    contents: opts.contents ?? [],
  };
  return Object.assign({
    me,
    here: { id: "room-1", name: "Room", flags: new Set(["room"]), state: {}, location: "", contents: [] },
    cmd: { name: "+fetish", original: "", args: opts.args ?? [], switches: [] },
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

async function makeChar(playerId: string, splat: SplatId, gnosis = 5): Promise<IWoDChar> {
  const c = await createChar(playerId, splat);
  await setStatus(c.id, "approved");
  const fresh = (await findByPlayer(playerId))!;
  fresh.gnosis = gnosis;
  fresh.gnosisCurrent = gnosis;
  fresh.willpower = 5;
  await saveChar(fresh);
  return (await findByPlayer(playerId))!;
}

// -- IEqMeta surface tests --------------------------------------------------

Deno.test("getEqMeta reads fetishDesc (builder-attr) and fetishActive (live-state)", OPTS, () => {
  const itm = makeItem("i-1", "spirit-stone", {
    kind: "fetish",
    fetishCost: 2,
    fetishDesc: "Sings.",
    fetishActive: true,
  });
  const m = getEqMeta(itm);
  assertEquals(m.kind, "fetish");
  assertEquals(m.fetishCost, 2);
  assertEquals(m.fetishDesc, "Sings.");
  assertEquals(m.fetishActive, true);
});

Deno.test("getEqMeta fetishActive does NOT read from state.attributes (live-state only)", OPTS, () => {
  const itm = makeItem("i-2", "klaive", {
    kind: "fetish",
    attributes: [{ name: "FETISHACTIVE", value: true }],
  });
  // Live flag should be undefined; only direct state.fetishActive counts.
  assertEquals(getEqMeta(itm).fetishActive, undefined);
});

// -- /list ------------------------------------------------------------------

Deno.test("+fetish /list shows carried fetishes only", OPTS, async () => {
  const exec = getExec("+fetish");
  await makeChar("fetish-list-1", "wta");
  const u = mockU({
    playerId: "fetish-list-1",
    args: ["list", ""],
    contents: [
      makeItem("i-stone", "spirit-stone", { kind: "fetish", fetishCost: 1 }),
      makeItem("i-sword", "sword", { kind: "weapon" }),
    ],
  });
  await exec(u);
  const sent = (u as unknown as { _sent: string[] })._sent.join("\n");
  assert(/spirit-stone/.test(sent));
  assert(!/sword/.test(sent));
});

// -- /use happy path --------------------------------------------------------

Deno.test("+fetish/use -- happy path: -fetishCost Gnosis, sets fetishActive, emits", OPTS, async () => {
  const exec = getExec("+fetish");
  await makeChar("fetish-use-1", "wta", 5);
  const item = makeItem("i-stone", "spirit-stone", { kind: "fetish", fetishCost: 2 });
  const u = mockU({ playerId: "fetish-use-1", args: ["use", "spirit-stone"], contents: [item] });
  await exec(u);

  const calls = (u as unknown as { _dbCalls: Array<{ id: string; op: string; payload: unknown }> })._dbCalls;
  const setActive = calls.find((c) => c.id === "i-stone" && c.op === "$set");
  assert(setActive, "expected $set on item.state.fetishActive");
  assertEquals((setActive!.payload as Record<string, unknown>)["state.fetishActive"], true);

  const refreshed = await findByPlayer("fetish-use-1");
  assertEquals(refreshed?.gnosisCurrent, 3, "should have spent 2 Gnosis");
});

Deno.test("+fetish/use -- default cost 1 when fetishCost unset", OPTS, async () => {
  const exec = getExec("+fetish");
  await makeChar("fetish-use-2", "wta", 5);
  const item = makeItem("i-bare", "rune", { kind: "fetish" });
  const u = mockU({ playerId: "fetish-use-2", args: ["use", "rune"], contents: [item] });
  await exec(u);
  const refreshed = await findByPlayer("fetish-use-2");
  assertEquals(refreshed?.gnosisCurrent, 4, "default cost is 1");
});

// -- /use guards ------------------------------------------------------------

Deno.test("+fetish/use -- not carrying rejects without spend", OPTS, async () => {
  const exec = getExec("+fetish");
  await makeChar("fetish-noitem-1", "wta", 5);
  const u = mockU({ playerId: "fetish-noitem-1", args: ["use", "ghost"], contents: [] });
  await exec(u);
  const refreshed = await findByPlayer("fetish-noitem-1");
  assertEquals(refreshed?.gnosisCurrent, 5, "no spend when item missing");
  const sent = (u as unknown as { _sent: string[] })._sent.join("\n");
  assert(/aren't carrying/.test(sent));
});

Deno.test("+fetish/use -- non-fetish item rejects without spend", OPTS, async () => {
  const exec = getExec("+fetish");
  await makeChar("fetish-notfetish-1", "wta", 5);
  const item = makeItem("i-sword", "sword", { kind: "weapon" });
  const u = mockU({ playerId: "fetish-notfetish-1", args: ["use", "sword"], contents: [item] });
  await exec(u);
  const refreshed = await findByPlayer("fetish-notfetish-1");
  assertEquals(refreshed?.gnosisCurrent, 5);
  const sent = (u as unknown as { _sent: string[] })._sent.join("\n");
  assert(/not a fetish/.test(sent));
});

Deno.test("+fetish/use -- already active rejects without spend", OPTS, async () => {
  const exec = getExec("+fetish");
  await makeChar("fetish-active-1", "wta", 5);
  const item = makeItem("i-on", "on-stone", { kind: "fetish", fetishCost: 1, fetishActive: true });
  const u = mockU({ playerId: "fetish-active-1", args: ["use", "on-stone"], contents: [item] });
  await exec(u);
  const refreshed = await findByPlayer("fetish-active-1");
  assertEquals(refreshed?.gnosisCurrent, 5);
});

Deno.test("+fetish/use -- insufficient Gnosis rejects without setting active", OPTS, async () => {
  const exec = getExec("+fetish");
  await makeChar("fetish-broke-1", "wta", 0);
  const item = makeItem("i-need", "stone", { kind: "fetish", fetishCost: 1 });
  const u = mockU({ playerId: "fetish-broke-1", args: ["use", "stone"], contents: [item] });
  await exec(u);
  const calls = (u as unknown as { _dbCalls: Array<{ id: string }> })._dbCalls;
  assert(!calls.some((c) => c.id === "i-need"), "must not have written fetishActive");
});

Deno.test("+fetish/use -- frenzied char rejects without spend", OPTS, async () => {
  const exec = getExec("+fetish");
  const c = await makeChar("fetish-frenzy-1", "wta", 5);
  c.frenzyState = "berserk";
  await saveChar(c);

  const item = makeItem("i-fr", "stone", { kind: "fetish", fetishCost: 1 });
  const u = mockU({ playerId: "fetish-frenzy-1", args: ["use", "stone"], contents: [item] });
  await exec(u);
  const refreshed = await findByPlayer("fetish-frenzy-1");
  assertEquals(refreshed?.gnosisCurrent, 5);
});

// -- splat gating -----------------------------------------------------------

Deno.test("+fetish/use -- mortal blocked", OPTS, async () => {
  const exec = getExec("+fetish");
  await makeChar("fetish-mortal-1", "mortal", 3);
  const item = makeItem("i-m", "stone", { kind: "fetish", fetishCost: 1 });
  const u = mockU({ playerId: "fetish-mortal-1", args: ["use", "stone"], contents: [item] });
  await exec(u);
  const refreshed = await findByPlayer("fetish-mortal-1");
  // Mortals don't track gnosisCurrent the same way; just assert reject message.
  const sent = (u as unknown as { _sent: string[] })._sent.join("\n");
  assert(/Garou and Kinfolk/.test(sent), `expected splat-gate reject, got: ${sent}`);
  assert(refreshed);
});

Deno.test("+fetish/use -- kinfolk allowed (per canon Gnosis merit)", OPTS, async () => {
  const exec = getExec("+fetish");
  await makeChar("fetish-kin-1", "kinfolk", 3);
  const item = makeItem("i-k", "stone", { kind: "fetish", fetishCost: 1 });
  const u = mockU({ playerId: "fetish-kin-1", args: ["use", "stone"], contents: [item] });
  await exec(u);
  const refreshed = await findByPlayer("fetish-kin-1");
  assertEquals(refreshed?.gnosisCurrent, 2, "kinfolk should be able to bind");
});

// -- /deactivate ------------------------------------------------------------

Deno.test("+fetish/deactivate -- unsets fetishActive", OPTS, async () => {
  const exec = getExec("+fetish");
  await makeChar("fetish-deac-1", "wta", 5);
  const item = makeItem("i-off", "stone", { kind: "fetish", fetishCost: 1, fetishActive: true });
  const u = mockU({ playerId: "fetish-deac-1", args: ["deactivate", "stone"], contents: [item] });
  await exec(u);
  const calls = (u as unknown as { _dbCalls: Array<{ id: string; payload: Record<string, unknown> }> })._dbCalls;
  const off = calls.find((c) => c.id === "i-off");
  assert(off);
  assertEquals(off!.payload["state.fetishActive"], false);
});

Deno.test("+fetish/deactivate -- not active rejects", OPTS, async () => {
  const exec = getExec("+fetish");
  await makeChar("fetish-deac-2", "wta", 5);
  const item = makeItem("i-off2", "stone", { kind: "fetish", fetishCost: 1 });
  const u = mockU({ playerId: "fetish-deac-2", args: ["deactivate", "stone"], contents: [item] });
  await exec(u);
  const calls = (u as unknown as { _dbCalls: Array<{ id: string }> })._dbCalls;
  assert(!calls.some((c) => c.id === "i-off2"));
});
