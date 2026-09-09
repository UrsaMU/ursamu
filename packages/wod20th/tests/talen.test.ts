// tests/talen.test.ts -- talen-specific behavior on +fetish.
//
// Talens reuse the fetish substrate but are single-use:
//   - On /use: spend Gnosis, set state.talenSpent (not fetishActive).
//   - Already-spent /use: reject without spend.
//   - /deactivate: reject (talens are consumed, not bound).
//   - getEqMeta: `talen` builder-attr resolution, `talenSpent` live-state only.

import { assert, assertEquals } from "@std/assert";
import { cmds } from "@ursamu/ursamu";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";

import "../splats/wta/index.ts";
import "../splats/mortal/index.ts";
import "../splats/kinfolk/index.ts";
import "../commands/fetish.ts";

import { createChar, findByPlayer, saveChar, setStatus } from "../db/charDb.ts";
import { getEqMeta } from "../core/eq.ts";
import { allTalens, getTalen } from "../splats/wta/data/talens.ts";
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

// -- IEqMeta surface --------------------------------------------------------

Deno.test("getEqMeta reads talen (builder-attr) and talenSpent (live-state)", OPTS, () => {
  const itm = makeItem("t-1", "moon-glow", {
    kind: "fetish",
    talen: true,
    fetishCost: 1,
  });
  const m = getEqMeta(itm);
  assertEquals(m.talen, true);
  assertEquals(m.talenSpent, undefined);
});

Deno.test("getEqMeta talenSpent does NOT read from state.attributes", OPTS, () => {
  const itm = makeItem("t-2", "moon-glow", {
    kind: "fetish",
    talen: true,
    attributes: [{ name: "TALENSPENT", value: true }],
  });
  // Live flag must come from direct state only.
  assertEquals(getEqMeta(itm).talenSpent, undefined);
});

// -- Data catalog -----------------------------------------------------------

Deno.test("WTA_TALENS has at least 8 entries; slugs unique + kebab", OPTS, () => {
  const xs = allTalens();
  assert(xs.length >= 8, `expected >=8 talens, got ${xs.length}`);
  const slugs = new Set<string>();
  for (const t of xs) {
    assert(/^[a-z0-9][a-z0-9-]*$/.test(t.slug), `bad slug: ${t.slug}`);
    assert(!slugs.has(t.slug), `duplicate slug: ${t.slug}`);
    slugs.add(t.slug);
    assert(t.name && t.name.length > 0);
    assert(t.description && t.description.length > 0);
    assert(t.cost >= 0);
  }
});

Deno.test("getTalen guards prototype lookups", OPTS, () => {
  assertEquals(getTalen("toString"), undefined);
  assertEquals(getTalen("__proto__"), undefined);
  assertEquals(getTalen(""), undefined);
});

// -- /use happy path: spends Gnosis, sets talenSpent (NOT fetishActive) -----

Deno.test("+fetish/use on a talen: spend Gnosis, set talenSpent, no fetishActive", OPTS, async () => {
  const exec = getExec("+fetish");
  await makeChar("talen-use-1", "wta", 5);
  const item = makeItem("t-mg", "moon-glow", { kind: "fetish", talen: true, fetishCost: 1 });
  const u = mockU({ playerId: "talen-use-1", args: ["use", "moon-glow"], contents: [item] });
  await exec(u);

  const calls = (u as unknown as { _dbCalls: Array<{ id: string; op: string; payload: Record<string, unknown> }> })._dbCalls;
  const itemWrite = calls.find((c) => c.id === "t-mg");
  assert(itemWrite, "expected $set on item");
  assertEquals(itemWrite!.payload["state.talenSpent"], true);
  assertEquals(itemWrite!.payload["state.fetishActive"], undefined,
    "talen should NOT set fetishActive");

  const refreshed = await findByPlayer("talen-use-1");
  assertEquals(refreshed?.gnosisCurrent, 4);
});

// -- /use guards ------------------------------------------------------------

Deno.test("+fetish/use on a spent talen rejects without spend", OPTS, async () => {
  const exec = getExec("+fetish");
  await makeChar("talen-spent-1", "wta", 5);
  const item = makeItem("t-x", "moon-glow", {
    kind: "fetish", talen: true, talenSpent: true, fetishCost: 1,
  });
  const u = mockU({ playerId: "talen-spent-1", args: ["use", "moon-glow"], contents: [item] });
  await exec(u);

  const refreshed = await findByPlayer("talen-spent-1");
  assertEquals(refreshed?.gnosisCurrent, 5, "no spend on spent talen");
  const calls = (u as unknown as { _dbCalls: Array<{ id: string }> })._dbCalls;
  assert(!calls.some((c) => c.id === "t-x"), "must not write to item");
  const sent = (u as unknown as { _sent: string[] })._sent.join("\n");
  assert(/spent/i.test(sent));
});

Deno.test("+fetish/use on insufficient Gnosis leaves talen unspent", OPTS, async () => {
  const exec = getExec("+fetish");
  await makeChar("talen-broke-1", "wta", 0);
  const item = makeItem("t-b", "moon-glow", { kind: "fetish", talen: true, fetishCost: 1 });
  const u = mockU({ playerId: "talen-broke-1", args: ["use", "moon-glow"], contents: [item] });
  await exec(u);

  const calls = (u as unknown as { _dbCalls: Array<{ id: string }> })._dbCalls;
  assert(!calls.some((c) => c.id === "t-b"), "must not write talenSpent on failed spend");
});

// -- /deactivate guard ------------------------------------------------------

Deno.test("+fetish/deactivate on a talen rejects", OPTS, async () => {
  const exec = getExec("+fetish");
  await makeChar("talen-deac-1", "wta", 5);
  const item = makeItem("t-d", "moon-glow", { kind: "fetish", talen: true });
  const u = mockU({ playerId: "talen-deac-1", args: ["deactivate", "moon-glow"], contents: [item] });
  await exec(u);

  const calls = (u as unknown as { _dbCalls: Array<{ id: string }> })._dbCalls;
  assert(!calls.some((c) => c.id === "t-d"), "no DB write on talen deactivate");
  const sent = (u as unknown as { _sent: string[] })._sent.join("\n");
  assert(/talen/i.test(sent) || /cannot be released/i.test(sent));
});

// -- Non-talen unaffected ---------------------------------------------------

Deno.test("+fetish/use on a non-talen fetish still sets fetishActive", OPTS, async () => {
  const exec = getExec("+fetish");
  await makeChar("talen-norm-1", "wta", 5);
  const item = makeItem("t-n", "spirit-stone", { kind: "fetish", fetishCost: 1 });
  const u = mockU({ playerId: "talen-norm-1", args: ["use", "spirit-stone"], contents: [item] });
  await exec(u);

  const calls = (u as unknown as { _dbCalls: Array<{ id: string; payload: Record<string, unknown> }> })._dbCalls;
  const write = calls.find((c) => c.id === "t-n");
  assert(write);
  assertEquals(write!.payload["state.fetishActive"], true);
  assertEquals(write!.payload["state.talenSpent"], undefined);
});
