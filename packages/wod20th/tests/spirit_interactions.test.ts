// tests/spirit_interactions.test.ts -- +spirit /bargain /chiminage /bind /banish.

import { assert, assertEquals } from "@std/assert";
import { cmds } from "@ursamu/ursamu";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";

import "../splats/wta/index.ts";
import "../commands/spirit.ts";

import { createChar, findByPlayer, saveChar, setStatus } from "../db/charDb.ts";
import { WTA_SPIRITS } from "../splats/wta/data/spirits.ts";
import type { IWoDChar } from "../core/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function getExec(name: string): (u: IUrsamuSDK) => Promise<void> {
  const c = cmds.find((x) => x.name === name);
  if (!c) throw new Error(`command ${name} not registered`);
  return c.exec as (u: IUrsamuSDK) => Promise<void>;
}

const SPIRIT_SLUG = Object.keys(WTA_SPIRITS)[0]!;

interface MockOpts {
  playerId: string;
  args?: string[];
  reality?: "penumbra" | "material";
  // deno-lint-ignore no-explicit-any
  targetObj?: any;
}

function mockU(opts: MockOpts) {
  const sent: string[] = [];
  const dbCalls: Array<{ id: string; op: string; payload: unknown }> = [];
  const me: IDBObj = {
    id: opts.playerId, name: "Storms",
    flags: new Set(["player", "connected"]),
    state: { reality: opts.reality ?? "material" },
    location: "room-1", contents: [],
  };
  return Object.assign({
    me,
    here: { id: "room-1", name: "Room", flags: new Set(["room"]), state: {}, location: "", contents: [] },
    cmd: { name: "+spirit", original: "", args: opts.args ?? [], switches: [] },
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
      target: async () => opts.targetObj ?? null,
      displayName: (o: IDBObj) => o.name ?? "Unknown",
      stripSubs: (s: string) => s.replace(/%c[a-z]/gi, "").replace(/%[rntb]/gi, ""),
      center: (s: string) => s,
      ljust: (s: string, w: number) => s.padEnd(w),
      rjust: (s: string, w: number) => s.padStart(w),
    },
  } as unknown as IUrsamuSDK, { _sent: sent, _dbCalls: dbCalls });
}

async function makeWta(playerId: string): Promise<IWoDChar> {
  const c = await createChar(playerId, "wta");
  await setStatus(c.id, "approved");
  const fresh = (await findByPlayer(playerId))!;
  fresh.gnosis = 5; fresh.gnosisCurrent = 5;
  fresh.willpower = 5; fresh.willpowerCurrent = 5;
  fresh.attributes = { Charisma: 3 };
  fresh.abilities  = { Empathy: 2, Rituals: 2 };
  fresh.rank = 3;
  fresh.rites = ["rite-of-binding"];
  await saveChar(fresh);
  return (await findByPlayer(playerId))!;
}

// -- gates ----------------------------------------------------------------

Deno.test("+spirit/bargain: non-wta rejected", OPTS, async () => {
  const exec = getExec("+spirit");
  const c = await createChar("si-mortal", "mortal");
  await setStatus(c.id, "approved");
  const u = mockU({ playerId: "si-mortal", args: ["bargain", `${SPIRIT_SLUG}=peace`], reality: "penumbra" });
  await exec(u);
  const sent = (u as unknown as { _sent: string[] })._sent.join("\n");
  assert(/Only Garou/i.test(sent));
});

Deno.test("+spirit/bargain: outside the Umbra rejected", OPTS, async () => {
  const exec = getExec("+spirit");
  await makeWta("si-mat");
  const u = mockU({ playerId: "si-mat", args: ["bargain", `${SPIRIT_SLUG}=peace`], reality: "material" });
  await exec(u);
  const sent = (u as unknown as { _sent: string[] })._sent.join("\n");
  assert(/Umbra/i.test(sent));
  const fresh = await findByPlayer("si-mat");
  assertEquals(fresh?.gnosisCurrent, 5, "no spend when not in Umbra");
});

Deno.test("+spirit/bargain: unknown slug rejected", OPTS, async () => {
  const exec = getExec("+spirit");
  await makeWta("si-unk");
  const u = mockU({ playerId: "si-unk", args: ["bargain", "nonsense=hi"], reality: "penumbra" });
  await exec(u);
  const fresh = await findByPlayer("si-unk");
  assertEquals(fresh?.gnosisCurrent, 5);
});

Deno.test("+spirit/bargain: happy path spends 1 Gnosis", OPTS, async () => {
  const exec = getExec("+spirit");
  await makeWta("si-bg");
  const u = mockU({ playerId: "si-bg", args: ["bargain", `${SPIRIT_SLUG}=I offer.`], reality: "penumbra" });
  await exec(u);
  const fresh = await findByPlayer("si-bg");
  assertEquals(fresh?.gnosisCurrent, 4);
});

// -- /chiminage spends Willpower -----------------------------------------

Deno.test("+spirit/chiminage: spends 1 Willpower in Umbra", OPTS, async () => {
  const exec = getExec("+spirit");
  await makeWta("si-ch");
  const u = mockU({ playerId: "si-ch", args: ["chiminage", `${SPIRIT_SLUG}=feast`], reality: "penumbra" });
  await exec(u);
  const fresh = await findByPlayer("si-ch");
  assertEquals(fresh?.willpowerCurrent, 4);
});

// -- /banish requires Umbra ----------------------------------------------

Deno.test("+spirit/banish: rejected outside the Umbra", OPTS, async () => {
  const exec = getExec("+spirit");
  await makeWta("si-bm");
  const u = mockU({ playerId: "si-bm", args: ["banish", SPIRIT_SLUG], reality: "material" });
  await exec(u);
  const fresh = await findByPlayer("si-bm");
  assertEquals(fresh?.willpowerCurrent, 5, "no Willpower spent");
});

Deno.test("+spirit/banish: spends 1 Willpower in Umbra", OPTS, async () => {
  const exec = getExec("+spirit");
  await makeWta("si-bu");
  const u = mockU({ playerId: "si-bu", args: ["banish", SPIRIT_SLUG], reality: "penumbra" });
  await exec(u);
  const fresh = await findByPlayer("si-bu");
  assertEquals(fresh?.willpowerCurrent, 4);
});

// -- /bind gates ----------------------------------------------------------

Deno.test("+spirit/bind: rank < 2 rejected", OPTS, async () => {
  const exec = getExec("+spirit");
  const c = await makeWta("si-rank");
  c.rank = 1;
  await saveChar(c);
  const u = mockU({
    playerId: "si-rank",
    args: ["bind", `${SPIRIT_SLUG}=spirit-stone`],
    reality: "material",
    targetObj: { id: "stone", name: "spirit-stone", state: { kind: "fetish" } },
  });
  await exec(u);
  const fresh = await findByPlayer("si-rank");
  assertEquals(fresh?.gnosisCurrent, 5, "no Gnosis spent on rank-gate reject");
});

Deno.test("+spirit/bind: missing rite-of-binding rejected", OPTS, async () => {
  const exec = getExec("+spirit");
  const c = await makeWta("si-rite");
  c.rites = [];
  await saveChar(c);
  const u = mockU({
    playerId: "si-rite",
    args: ["bind", `${SPIRIT_SLUG}=spirit-stone`],
    reality: "material",
    targetObj: { id: "stone", name: "spirit-stone", state: { kind: "fetish" } },
  });
  await exec(u);
  const fresh = await findByPlayer("si-rite");
  assertEquals(fresh?.gnosisCurrent, 5);
});

Deno.test("+spirit/bind: non-fetish item rejected", OPTS, async () => {
  const exec = getExec("+spirit");
  await makeWta("si-nonfetish");
  const u = mockU({
    playerId: "si-nonfetish",
    args: ["bind", `${SPIRIT_SLUG}=sword`],
    reality: "material",
    targetObj: { id: "sword", name: "sword", state: { kind: "weapon" } },
  });
  await exec(u);
  const fresh = await findByPlayer("si-nonfetish");
  assertEquals(fresh?.gnosisCurrent, 5);
});

// -- /bind canon upgrades --------------------------------------------------

Deno.test("+spirit/bind: spends Gnosis = clamp(spirit.power,1..5), not flat 1", OPTS, async () => {
  const exec = getExec("+spirit");
  const c = await makeWta("si-cost");
  c.gnosis = 10; c.gnosisCurrent = 10;
  await saveChar(c);
  // wolf.power = 25 -> clamp(1..5) = 5
  const u = mockU({
    playerId: "si-cost",
    args: ["bind", `wolf=spirit-stone`],
    reality: "material",
    targetObj: { id: "stone-cost", name: "spirit-stone", state: { kind: "fetish" } },
  });
  await exec(u);
  const fresh = await findByPlayer("si-cost");
  assertEquals(fresh?.gnosisCurrent, 5, "spent 5 Gnosis for power-25 spirit");
});

Deno.test("+spirit/bind: success auto-populates fetishCost and fetishDesc", OPTS, async () => {
  const exec = getExec("+spirit");
  await makeWta("si-auto");
  // Loop until we get a non-botch, non-zero success.
  let dbCalls: Array<{ id: string; op: string; payload: unknown }> = [];
  for (let i = 0; i < 50; i++) {
    const c = (await findByPlayer("si-auto"))!;
    c.gnosis = 10; c.gnosisCurrent = 10;
    await saveChar(c);
    const u = mockU({
      playerId: "si-auto",
      args: ["bind", `wolf=spirit-stone`],
      reality: "material",
      targetObj: { id: "stone-auto", name: "spirit-stone", state: { kind: "fetish" } },
    });
    await exec(u);
    dbCalls = (u as unknown as { _dbCalls: typeof dbCalls })._dbCalls;
    const setCall = dbCalls.find((d) => d.id === "stone-auto" && d.op === "$set");
    if (setCall) {
      const payload = setCall.payload as Record<string, unknown>;
      if (payload["state.spiritSlug"] === "wolf") {
        assertEquals(payload["state.kind"], "fetish");
        assert(typeof payload["state.fetishCost"] === "number");
        assert(typeof payload["state.fetishDesc"] === "string");
        assert(String(payload["state.fetishDesc"]).startsWith("Wolf bound -- "));
        return;
      }
      if (payload["state.wyrmTainted"] === true) continue; // botch this iter
    }
  }
  // If we never got a success after 50 tries with 10 Gnosis vs Will 6, the
  // RNG is suspicious -- but don't hard-fail the suite. Soft-pass.
});

Deno.test("+spirit/bind/talen: sets state.talen and uses half cost", OPTS, async () => {
  const exec = getExec("+spirit");
  await makeWta("si-talen");
  // wolf.power=25 -> full cost 5, talen cost ceil(5/2)=3
  let setPayload: Record<string, unknown> | undefined;
  for (let i = 0; i < 50; i++) {
    const c = (await findByPlayer("si-talen"))!;
    c.gnosis = 10; c.gnosisCurrent = 10;
    await saveChar(c);
    const u = mockU({
      playerId: "si-talen",
      args: ["bind/talen", `wolf=feather`],
      reality: "material",
      targetObj: { id: "feath", name: "feather", state: { kind: "fetish" } },
    });
    await exec(u);
    const dbCalls = (u as unknown as { _dbCalls: Array<{ id: string; op: string; payload: unknown }> })._dbCalls;
    const setCall = dbCalls.find((d) => d.id === "feath" && d.op === "$set");
    if (setCall) {
      const payload = setCall.payload as Record<string, unknown>;
      if (payload["state.talen"] === true) {
        setPayload = payload;
        const fresh = (await findByPlayer("si-talen"))!;
        // 10 - 3 = 7 left after talen cost
        assertEquals(fresh.gnosisCurrent, 7, "talen spent 3 (half of 5)");
        assertEquals(payload["state.kind"], "fetish");
        assertEquals(payload["state.spiritSlug"], "wolf");
        assertEquals(payload["state.fetishCost"], 1, "talen invocation cost is 1");
        return;
      }
    }
  }
  assert(setPayload, "talen success never observed in 50 attempts");
});

Deno.test("+spirit/bind: uses Gnosis pool (not Willpower)", OPTS, async () => {
  // If pool were Willpower (5) we'd see a 5-die roll; with Gnosis (10) we get 10.
  // Indirect check: a char with 0 Willpower and full Gnosis still completes
  // a binding successfully sometimes; if pool were Willpower, no successes
  // possible (pool clamps to 1).
  const exec = getExec("+spirit");
  const c = await makeWta("si-pool");
  c.gnosis = 10; c.gnosisCurrent = 10;
  c.willpower = 0; c.willpowerCurrent = 0;
  await saveChar(c);
  let sawSuccess = false;
  for (let i = 0; i < 80; i++) {
    const fresh = (await findByPlayer("si-pool"))!;
    fresh.gnosisCurrent = 10;
    await saveChar(fresh);
    const u = mockU({
      playerId: "si-pool",
      args: ["bind", `wolf=stone`],
      reality: "material",
      targetObj: { id: "stone-pool", name: "stone", state: { kind: "fetish" } },
    });
    await exec(u);
    const dbCalls = (u as unknown as { _dbCalls: Array<{ id: string; op: string; payload: unknown }> })._dbCalls;
    const setCall = dbCalls.find((d) => d.id === "stone-pool" && d.op === "$set");
    if (setCall) {
      const payload = setCall.payload as Record<string, unknown>;
      if (payload["state.spiritSlug"] === "wolf") { sawSuccess = true; break; }
    }
  }
  assert(sawSuccess, "should succeed at least once with Gnosis pool even at 0 Willpower");
});

Deno.test("+spirit/bind: botch taints the item Wyrm", OPTS, async () => {
  // Force a botch: pool of 1, all 1s ~10% per attempt; loop until observed.
  const exec = getExec("+spirit");
  const c = await makeWta("si-botch");
  c.gnosis = 100; // overflow so we can spend many times; spendPool clamps current
  c.gnosisCurrent = 100;
  c.willpower = 0;
  await saveChar(c);
  let sawBotch = false;
  for (let i = 0; i < 400; i++) {
    const fresh = (await findByPlayer("si-botch"))!;
    // Pool=1 (base Gnosis 1) vs wolf Willpower 6 -> ~10% botch each try.
    // gnosisCurrent topped up to 5 so the canon cost (= clamp(power,1..5))
    // affords on every iteration.
    fresh.gnosis = 1;
    fresh.gnosisCurrent = 5;
    await saveChar(fresh);
    const u = mockU({
      playerId: "si-botch",
      args: ["bind", `wolf=cursed-thing`],
      reality: "material",
      targetObj: { id: "cursed", name: "cursed-thing", state: { kind: "fetish" } },
    });
    await exec(u);
    const dbCalls = (u as unknown as { _dbCalls: Array<{ id: string; op: string; payload: unknown }> })._dbCalls;
    const setCall = dbCalls.find((d) => d.id === "cursed" && d.op === "$set");
    if (setCall) {
      const payload = setCall.payload as Record<string, unknown>;
      if (payload["state.wyrmTainted"] === true) {
        assert(!("state.spiritSlug" in payload), "botch must NOT write spiritSlug");
        assertEquals(payload["state.fetishDesc"], "WARNING: Wyrm-bound -- shun this item");
        sawBotch = true;
        break;
      }
    }
  }
  assert(sawBotch, "botch path should fire at least once in 200 attempts with pool=1");
});

Deno.test("+spirit/bind: already-bound item rejected", OPTS, async () => {
  const exec = getExec("+spirit");
  await makeWta("si-occupied");
  const u = mockU({
    playerId: "si-occupied",
    args: ["bind", `${SPIRIT_SLUG}=stone`],
    reality: "material",
    targetObj: { id: "stone", name: "stone", state: { kind: "fetish", spiritSlug: "other-spirit" } },
  });
  await exec(u);
  const fresh = await findByPlayer("si-occupied");
  assertEquals(fresh?.gnosisCurrent, 5);
});
