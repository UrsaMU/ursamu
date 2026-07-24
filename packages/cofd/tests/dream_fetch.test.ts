// Oneiromancy light + Fetch/Echoes pure tests.

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "@std/assert";
import { defaultSheet } from "../src/stats/index.ts";
import {
  enterHorn,
  enterIvory,
  enterOtherBastion,
  readDreamState,
  resolveWeave,
  wakeDream,
  WEAVE_EFFECTS,
  attributeMaxForWyrd,
  buildChangelingDreamForm,
} from "../src/dream/index.ts";
import {
  activateEcho,
  buildFetchSheet,
  defaultOwnedEchoes,
  findEcho,
  isFetchSheet,
  linkChangelingToFetch,
  markMetOriginal,
  readFetchState,
} from "../src/fetch/index.ts";
import { getNpcTemplate } from "../src/npc/catalog.ts";
import { COFD_TEMPLATES } from "../src/gamelines/templates.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function ctl() {
  const s = defaultSheet();
  s.template = "changeling";
  s.powerStatValue = 2;
  s.moralityValue = 7;
  s.energyCurrent = 15;
  s.attributes.presence = 3;
  s.attributes.manipulation = 2;
  s.attributes.composure = 3;
  s.attributes.resolve = 2;
  s.attributes.wits = 3;
  s.skills.empathy = 2;
  s.skills.survival = 2;
  return s;
}

Deno.test("attributeMaxForWyrd table", OPTS, () => {
  assertEquals(attributeMaxForWyrd(1), 5);
  assertEquals(attributeMaxForWyrd(5), 6);
  assertEquals(attributeMaxForWyrd(10), 10);
});

Deno.test("enterIvory on success builds dream form", OPTS, () => {
  const r = enterIvory(ctl(), 2);
  assert(r.ok);
  const d = readDreamState(r.sheet!);
  assert(d);
  assertEquals(d!.gate, "ivory");
  assertEquals(d!.bastionOf, "self");
  assertEquals(d!.power, 3);
  assertEquals(d!.finesse, 2);
  assertEquals(d!.resistance, 3);
  // Dream Health = Clarity 7 + attr max 5 = 12
  assertEquals(d!.dreamHealthMax, 12);
});

Deno.test("enterIvory fails on zero successes", OPTS, () => {
  const r = enterIvory(ctl(), 0);
  assertEquals(r.ok, false);
});

Deno.test("enterHorn requires Hedge", OPTS, () => {
  const fail = enterHorn(ctl(), {
    inHedge: false,
    successes: 3,
  });
  assertEquals(fail.ok, false);
  const ok = enterHorn(ctl(), {
    inHedge: true,
    successes: 2,
  });
  assert(ok.ok);
  assertEquals(readDreamState(ok.sheet!)!.gate, "horn");
});

Deno.test("enterOtherBastion respects Fortification", OPTS, () => {
  let sheet = ctl();
  sheet = enterIvory(sheet, 3).sheet!;
  const blocked = enterOtherBastion(sheet, {
    ownerId: "p2",
    ownerName: "Alice",
    fortification: 4,
    successes: 3,
  });
  assertEquals(blocked.ok, false);
  const open = enterOtherBastion(sheet, {
    ownerId: "p2",
    ownerName: "Alice",
    fortification: 2,
    successes: 4,
  });
  assert(open.ok);
  assertEquals(readDreamState(open.sheet!)!.bastionOf, "p2");
  assert(readDreamState(open.sheet!)!.leftOwnBastion);
});

Deno.test("wakeDream clears state", OPTS, () => {
  const entered = enterIvory(ctl(), 2);
  const w = wakeDream(entered.sheet!);
  assert(w.ok);
  assertEquals(readDreamState(w.sheet!), null);
});

Deno.test("resolveWeave memory spends Glamour", OPTS, () => {
  const sheet = ctl();
  const dream = buildChangelingDreamForm(sheet, {
    gate: "ivory",
    bastionOf: "self",
  });
  const r = resolveWeave(sheet, dream, "memory", 3);
  assert(r.ok);
  assertEquals(r.sheet!.energyCurrent, 14);
  assertEquals(readDreamState(r.sheet!)!.weavesLeft, dream.weavesLeft - 1);
});

Deno.test("weave catalog has exit and role", OPTS, () => {
  assert(WEAVE_EFFECTS.some((e) => e.slug === "exit"));
  assert(WEAVE_EFFECTS.some((e) => e.slug === "role"));
});

Deno.test("buildFetchSheet mirrors attributes, no contracts", OPTS, () => {
  const orig = ctl();
  orig.contracts = ["Chrysalis"];
  const f = buildFetchSheet(orig, {
    originalId: "c1",
    originalName: "Bob",
    fetchName: "Bobby",
    flaw: "Cannot cry",
  });
  assert(isFetchSheet(f));
  assertEquals(f.contracts?.length ?? 0, 0);
  assertEquals(f.attributes.presence, orig.attributes.presence);
  const st = readFetchState(f)!;
  assertEquals(st.originalId, "c1");
  assert(st.echoes.includes("attuned") || st.echoes.length >= 1);
  assert(findEcho("summon-shard"));
});

Deno.test("linkChangelingToFetch stores id", OPTS, () => {
  const c = linkChangelingToFetch(ctl(), "f9", "Bobby");
  assertEquals(readFetchState(c)!.fetchId, "f9");
});

Deno.test("activateEcho normalcy toggles", OPTS, () => {
  const f = buildFetchSheet(ctl(), {
    originalId: "c1",
    originalName: "Bob",
  });
  const r = activateEcho(f, "normalcy");
  assert(r.ok);
  assertEquals(readFetchState(r.sheet!)!.normalcyOn, false);
});

Deno.test("activateEcho blocked by normalcy", OPTS, () => {
  const f = buildFetchSheet(ctl(), {
    originalId: "c1",
    originalName: "Bob",
  });
  // default normalcy on
  const r = activateEcho(f, "summon-shard");
  assertEquals(r.ok, false);
  assertStringIncludes(r.reason ?? "", "Normalcy");
});

Deno.test("mimic requires met original", OPTS, () => {
  let f = buildFetchSheet(ctl(), {
    originalId: "c1",
    originalName: "Bob",
  });
  // drop normalcy, grant mimic
  f = activateEcho(f, "normalcy").sheet!;
  const st = readFetchState(f)!;
  f = {
    ...f,
    fetchState: {
      ...st,
      echoes: [...st.echoes, "mimic-contract"],
      normalcyOn: false,
    },
  };
  const blocked = activateEcho(f, "mimic-contract");
  assertEquals(blocked.ok, false);
  f = markMetOriginal(f);
  const ok = activateEcho(f, "mimic-contract", "Chrysalis");
  assert(ok.ok);
});

Deno.test("defaultOwnedEchoes includes attuned", OPTS, () => {
  const e = defaultOwnedEchoes(2);
  assert(e.includes("attuned"));
  assert(e.includes("normalcy"));
});

Deno.test("fetch template and npc load", OPTS, () => {
  assert(COFD_TEMPLATES.fetch);
  assertEquals(COFD_TEMPLATES.fetch.powerStatName, "Wyrd");
  const npc = getNpcTemplate("fetch-double");
  assert(npc);
  assertEquals(npc!.lineage, "fetch");
});
