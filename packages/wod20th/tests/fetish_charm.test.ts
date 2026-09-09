// tests/fetish_charm.test.ts -- +fetish/charm + /charms invocation.

import { assert, assertEquals } from "@std/assert";
import { cmds } from "@ursamu/ursamu";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";

import "../splats/wta/index.ts";
import "../commands/fetish.ts";

import { createChar, findByPlayer, saveChar, setStatus } from "../db/charDb.ts";
import { UNIVERSAL_CHARMS } from "../splats/wta/data/charms.ts";

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
    id: opts.playerId, name: "Storms",
    flags: new Set(["player", "connected"]),
    state: {}, location: "room-1", contents: opts.contents ?? [],
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

async function makeWta(playerId: string): Promise<void> {
  const c = await createChar(playerId, "wta");
  await setStatus(c.id, "approved");
  const fresh = (await findByPlayer(playerId))!;
  fresh.gnosis = 5; fresh.gnosisCurrent = 5;
  fresh.willpower = 5; fresh.willpowerCurrent = 5;
  fresh.rage = 3; fresh.rageCurrent = 3;
  await saveChar(fresh);
}

// -- /charms (lister) ----------------------------------------------------

Deno.test("+fetish/charms: bound fetish lists universals + spirit charms", OPTS, async () => {
  await makeWta("fc-list-1");
  const exec = getExec("+fetish");
  const item = makeItem("fc-i1", "spirit-stone", {
    kind: "fetish", fetishCost: 1, spiritSlug: "wolf",
  });
  const u = mockU({ playerId: "fc-list-1", args: ["charms", "spirit-stone"], contents: [item] });
  await exec(u);
  const sent = (u as unknown as { _sent: string[] })._sent.join("\n");
  // Universals always render (airt-sense / re-form / materialize).
  for (const slug of UNIVERSAL_CHARMS) {
    assert(sent.toLowerCase().includes(slug), `expected universal ${slug} in output`);
  }
});

Deno.test("+fetish/charms: no bound spirit -> friendly message, no crash", OPTS, async () => {
  await makeWta("fc-list-2");
  const exec = getExec("+fetish");
  const item = makeItem("fc-i2", "blank-fetish", { kind: "fetish" });
  const u = mockU({ playerId: "fc-list-2", args: ["charms", "blank-fetish"], contents: [item] });
  await exec(u);
  const sent = (u as unknown as { _sent: string[] })._sent.join("\n");
  assert(/houses no spirit/i.test(sent));
});

Deno.test("+fetish/charms: Wyrm-tainted fetish refuses", OPTS, async () => {
  await makeWta("fc-list-3");
  const exec = getExec("+fetish");
  const item = makeItem("fc-i3", "tainted", { kind: "fetish", wyrmTainted: true });
  const u = mockU({ playerId: "fc-list-3", args: ["charms", "tainted"], contents: [item] });
  await exec(u);
  const sent = (u as unknown as { _sent: string[] })._sent.join("\n");
  assert(/Wyrm-tainted/i.test(sent));
});

// -- /charm (invocation) -------------------------------------------------

Deno.test("+fetish/charm: invoking a universal charm narrates + does not crash", OPTS, async () => {
  // airt-sense in canon is power-only (spirit pays Power, not the user),
  // so the invoker's Gnosis stays unchanged. We assert the charm runs,
  // emits a narration line, and leaves user pools alone.
  await makeWta("fc-inv-1");
  const exec = getExec("+fetish");
  const item = makeItem("fc-ii1", "spirit-stone", {
    kind: "fetish", fetishCost: 1, spiritSlug: "wolf",
  });
  const u = mockU({
    playerId: "fc-inv-1",
    args: ["charm", "spirit-stone=airt-sense"],
    contents: [item],
  });
  await exec(u);
  const sent = (u as unknown as { _sent: string[] })._sent.join("\n");
  assert(/Airt Sense/i.test(sent), "expected the charm name in the narration");
  const fresh = await findByPlayer("fc-inv-1");
  assertEquals(fresh?.gnosisCurrent, 5, "power-only charm must not drain user Gnosis");
});

Deno.test("+fetish/charm: spirit that doesn't grant the charm is rejected", OPTS, async () => {
  await makeWta("fc-inv-2");
  const exec = getExec("+fetish");
  const item = makeItem("fc-ii2", "spirit-stone", {
    kind: "fetish", fetishCost: 1, spiritSlug: "wolf",
  });
  // Try to invoke a charm wolf doesn't grant (e.g., venom).
  const u = mockU({
    playerId: "fc-inv-2",
    args: ["charm", "spirit-stone=venom"],
    contents: [item],
  });
  await exec(u);
  const fresh = await findByPlayer("fc-inv-2");
  assertEquals(fresh?.gnosisCurrent, 5, "no cost spent on illegal charm");
});

Deno.test("+fetish/charm: spent talen rejects without consuming charm cost", OPTS, async () => {
  await makeWta("fc-inv-3");
  const exec = getExec("+fetish");
  const item = makeItem("fc-ii3", "moon-glow", {
    kind: "fetish", talen: true, talenSpent: true, spiritSlug: "lune",
  });
  const u = mockU({
    playerId: "fc-inv-3",
    args: ["charm", "moon-glow=airt-sense"],
    contents: [item],
  });
  await exec(u);
  const fresh = await findByPlayer("fc-inv-3");
  assertEquals(fresh?.gnosisCurrent, 5);
});

Deno.test("+fetish/charm: Wyrm-tainted item refuses invocation", OPTS, async () => {
  await makeWta("fc-inv-4");
  const exec = getExec("+fetish");
  const item = makeItem("fc-ii4", "cursed", {
    kind: "fetish", wyrmTainted: true, spiritSlug: "wolf",
  });
  const u = mockU({
    playerId: "fc-inv-4",
    args: ["charm", "cursed=airt-sense"],
    contents: [item],
  });
  await exec(u);
  const fresh = await findByPlayer("fc-inv-4");
  assertEquals(fresh?.gnosisCurrent, 5);
});
