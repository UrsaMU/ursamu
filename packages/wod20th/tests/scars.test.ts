// tests/scars.test.ts -- battle scar table + +scar list/clear flow.

import { assert, assertEquals } from "@std/assert";
import { cmds } from "@ursamu/ursamu";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";

import "../splats/wta/index.ts";
import "../commands/scar.ts";

import { allScars, getScar, rollBattleScar, BATTLE_SCARS } from "../core/battleScars.ts";
import { createChar, findByPlayer, saveChar, setStatus } from "../db/charDb.ts";
import type { IWoDChar, SplatId } from "../core/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function getExec(name: string): (u: IUrsamuSDK) => Promise<void> {
  const c = cmds.find((x) => x.name === name);
  if (!c) throw new Error(`command ${name} not registered`);
  return c.exec as (u: IUrsamuSDK) => Promise<void>;
}

interface MockOpts {
  playerId: string;
  args?: string[];
  staff?: boolean;
  // deno-lint-ignore no-explicit-any
  targetObj?: any;
}

function mockU(opts: MockOpts) {
  const sent: string[] = [];
  const flags = new Set(["player", "connected"]);
  if (opts.staff) flags.add("admin");
  const me: IDBObj = {
    id: opts.playerId, name: "Hero",
    flags, state: {}, location: "room-1", contents: [],
  };
  return Object.assign({
    me,
    here: { id: "room-1", name: "Room", flags: new Set(["room"]), state: {}, location: "", contents: [] },
    cmd: { name: "+scar", original: "", args: opts.args ?? [], switches: [] },
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
      target: async () => opts.targetObj ?? null,
      displayName: (o: IDBObj) => o.name ?? "Unknown",
      stripSubs: (s: string) => s.replace(/%c[a-z]/gi, "").replace(/%[rntb]/gi, ""),
      center: (s: string) => s,
      ljust: (s: string, w: number) => s.padEnd(w),
      rjust: (s: string, w: number) => s.padStart(w),
    },
  } as unknown as IUrsamuSDK, { _sent: sent });
}

async function makeChar(playerId: string, splat: SplatId): Promise<IWoDChar> {
  const c = await createChar(playerId, splat);
  await setStatus(c.id, "approved");
  return (await findByPlayer(playerId))!;
}

// -- Table integrity --------------------------------------------------------

Deno.test("BATTLE_SCARS: at least 10 entries, unique kebab slugs, glory>=1", OPTS, () => {
  const xs = allScars();
  assert(xs.length >= 10, `expected >=10 scars, got ${xs.length}`);
  const slugs = new Set<string>();
  for (const s of xs) {
    assert(/^[a-z0-9][a-z0-9-]*$/.test(s.slug), `bad slug: ${s.slug}`);
    assert(!slugs.has(s.slug), `dup: ${s.slug}`);
    slugs.add(s.slug);
    assert(s.glory >= 1);
    assert(s.description.length > 0);
  }
});

Deno.test("BATTLE_SCARS: severity spread (Glory 1/2/3)", OPTS, () => {
  const xs = allScars();
  assert(xs.some((s) => s.glory === 1), "expected at least one 1-Glory scar");
  assert(xs.some((s) => s.glory === 2), "expected at least one 2-Glory scar");
  assert(xs.some((s) => s.glory === 3), "expected at least one 3-Glory scar");
});

Deno.test("getScar guards prototype lookups", OPTS, () => {
  assertEquals(getScar("toString"), undefined);
  assertEquals(getScar("__proto__"), undefined);
  assertEquals(getScar(""), undefined);
  assert(getScar("missing-eye") !== undefined || getScar(Object.keys(BATTLE_SCARS)[0]) !== undefined);
});

// -- rollBattleScar ---------------------------------------------------------

Deno.test("rollBattleScar: deterministic RNG picks deterministically", OPTS, () => {
  const a = rollBattleScar(() => 0);
  const b = rollBattleScar(() => 0);
  assertEquals(a.slug, b.slug);
  assertEquals(a.glory, b.glory);
  assert(a.acquiredAt > 0);
});

Deno.test("rollBattleScar: cause propagates", OPTS, () => {
  const a = rollBattleScar(() => 0.5, "silver bullet");
  assertEquals(a.cause, "silver bullet");
});

// -- saveChar roundtrip -----------------------------------------------------

Deno.test("saveChar persists scars[] roundtrip", OPTS, async () => {
  const c = await makeChar("scar-rt-1", "wta");
  c.scars = [
    {
      slug: "missing-eye", name: "Missing Eye", glory: 2,
      description: "Lost an eye.", acquiredAt: 1700000000000,
    },
  ];
  await saveChar(c);
  const fresh = await findByPlayer("scar-rt-1");
  assertEquals(fresh?.scars?.length, 1);
  assertEquals(fresh?.scars?.[0].slug, "missing-eye");
});

// -- +scar /list ------------------------------------------------------------

Deno.test("+scar /list (self): shows scars or empty", OPTS, async () => {
  const exec = getExec("+scar");
  const c = await makeChar("scar-self-1", "wta");
  c.scars = [{
    slug: "deep-scar", name: "Deep Scar", glory: 1,
    description: "Aches in cold.", acquiredAt: 1,
  }];
  await saveChar(c);
  const u = mockU({ playerId: "scar-self-1", args: ["", ""] });
  await exec(u);
  const sent = (u as unknown as { _sent: string[] })._sent.join("\n");
  assert(/Deep Scar/.test(sent));
});

Deno.test("+scar /list (empty): says no scars", OPTS, async () => {
  const exec = getExec("+scar");
  await makeChar("scar-empty-1", "wta");
  const u = mockU({ playerId: "scar-empty-1", args: ["list", ""] });
  await exec(u);
  const sent = (u as unknown as { _sent: string[] })._sent.join("\n");
  assert(/No scars/i.test(sent));
});

// -- +scar /clear staff gating ----------------------------------------------

Deno.test("+scar/clear: non-staff rejected", OPTS, async () => {
  const exec = getExec("+scar");
  const target = await makeChar("scar-clr-target-1", "wta");
  target.scars = [{
    slug: "broken-jaw", name: "Broken Jaw", glory: 1,
    description: ".", acquiredAt: 1,
  }];
  await saveChar(target);

  const u = mockU({
    playerId: "scar-clr-actor-1",
    args: ["clear", "victim=broken-jaw"],
    staff: false,
    targetObj: { id: "scar-clr-target-1", name: "Victim", flags: new Set(["player"]) },
  });
  await exec(u);

  const fresh = await findByPlayer("scar-clr-target-1");
  assertEquals(fresh?.scars?.length, 1, "non-staff must not clear");
});

Deno.test("+scar/clear: staff removes by slug", OPTS, async () => {
  const exec = getExec("+scar");
  const target = await makeChar("scar-clr-target-2", "wta");
  target.scars = [
    { slug: "broken-jaw", name: "Broken Jaw", glory: 1, description: ".", acquiredAt: 1 },
    { slug: "missing-eye", name: "Missing Eye", glory: 2, description: ".", acquiredAt: 2 },
  ];
  await saveChar(target);

  const u = mockU({
    playerId: "scar-clr-actor-2",
    args: ["clear", "victim=broken-jaw"],
    staff: true,
    targetObj: { id: "scar-clr-target-2", name: "Victim", flags: new Set(["player"]) },
  });
  await exec(u);

  const fresh = await findByPlayer("scar-clr-target-2");
  assertEquals(fresh?.scars?.length, 1);
  assertEquals(fresh?.scars?.[0].slug, "missing-eye");
});

Deno.test("+scar/clear: unknown slug rejected without write", OPTS, async () => {
  const exec = getExec("+scar");
  const target = await makeChar("scar-clr-target-3", "wta");
  target.scars = [
    { slug: "broken-jaw", name: "Broken Jaw", glory: 1, description: ".", acquiredAt: 1 },
  ];
  await saveChar(target);

  const u = mockU({
    playerId: "scar-clr-actor-3",
    args: ["clear", "victim=does-not-exist"],
    staff: true,
    targetObj: { id: "scar-clr-target-3", name: "Victim", flags: new Set(["player"]) },
  });
  await exec(u);

  const fresh = await findByPlayer("scar-clr-target-3");
  assertEquals(fresh?.scars?.length, 1, "no removal on unknown slug");
});
