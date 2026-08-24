import { assertEquals } from "@std/assert";
import {
  applyRuling,
  crewAllReady,
  defaultChar,
  layLow,
  setPlan,
  setReady,
  takeJob,
} from "../src/char.ts";
import { defaultCity, tickFeed } from "../src/city.ts";
import { findAction } from "../src/catalog.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function seq(nums: number[]): () => number {
  let i = 0;
  return () => {
    const n = nums[i] ?? 0.5;
    i += 1;
    return n;
  };
}

Deno.test("defaultChar is GM-approved utopia sheet", OPTS, () => {
  const ch = defaultChar("1", "Mira", "r1");
  assertEquals(ch.status, "approved");
  assertEquals(ch.system, "utopia");
});

Deno.test("setPlan locks DV and clears ready", OPTS, () => {
  let ch = defaultChar("1", "Mira", "r1");
  ch = { ...ch, ready: true };
  ch = setPlan(ch, "  Get the sample.  ", seq([0.5, 0.5]));
  assertEquals(ch.plan, "Get the sample.");
  assertEquals(ch.ready, false);
  assertEquals(ch.lockedDv != null, true);
});

Deno.test("setReady requires a plan", OPTS, () => {
  const empty = setReady(defaultChar("1", "Mira", "r1"));
  assertEquals(empty.ready, false);
  const planned = setReady(
    setPlan(empty, "Watch", seq([0.2, 0.2])),
  );
  assertEquals(planned.ready, true);
});

Deno.test("layLow blocked after danger added", OPTS, () => {
  const ch = { ...defaultChar("1", "Mira", "r1"), danger: 3 };
  const ok = layLow(ch);
  assertEquals(ok.ok, true);
  if (ok.ok) assertEquals(ok.char.danger, 1);
  const blocked = layLow({ ...ch, dangerAdded: true });
  assertEquals(blocked.ok, false);
});

Deno.test("applyRuling marks dangerAdded on hitch", OPTS, () => {
  const ch = defaultChar("1", "Mira", "r1");
  const next = applyRuling(ch, {
    total: 8,
    dv: 18,
    result: "hitch",
    danger: 1,
  });
  assertEquals(next.danger, 1);
  assertEquals(next.dangerAdded, true);
  assertEquals(next.lockedDv, 18);
});

Deno.test("takeJob fills a goal slot", OPTS, () => {
  const ch = takeJob(defaultChar("1", "Mira", "r1"), "Steal the PU");
  assertEquals(ch.goals[0], "Steal the PU");
  assertEquals(ch.plan, "Steal the PU");
});

Deno.test("tickFeed advances week and keeps tension", OPTS, () => {
  const city = defaultCity();
  const out = tickFeed(city, seq([0.25, 0.1, 0.2]));
  assertEquals(out.city.week, 2);
  assertEquals(out.city.tension.severity >= 1, true);
});

Deno.test("crewAllReady needs plan and ready", OPTS, () => {
  const a = setReady(
    setPlan(defaultChar("1", "Mira", "r1"), "A", seq([0.2, 0.2])),
  );
  const b = defaultChar("2", "Jane", "r1");
  assertEquals(crewAllReady([a]), true);
  assertEquals(crewAllReady([a, b]), false);
});

Deno.test("findAction known verbs", OPTS, () => {
  assertEquals(findAction("hack")?.label, "Hack");
  assertEquals(findAction("nope"), null);
});
