/**
 * H1 — DoS via unbounded width/count in layout softcode helpers.
 *
 * Any softcode author (i.e. any player who can set an attribute on
 * themselves) can write `[repeat(x,99999999)]` to allocate ~100 MB strings
 * per evaluation. The softcode timeout doesn't stop the allocation —
 * `String.prototype.repeat` returns in a single call.
 *
 * Fix: clamp width/count to a sane ceiling.
 */
import { assertEquals } from "@std/assert";
import { softcodeService } from "../src/services/Softcode/index.ts";
import { dbojs, DBO } from "../src/services/Database/database.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false, timeout: 15000 };

const ACTOR = "700001";
const MAX = 10_000; // expected clamp ceiling

async function seedActor() {
  await dbojs.delete({ id: ACTOR }).catch(() => {});
  await dbojs.create({
    id: ACTOR,
    flags: "player connected",
    data: { name: "Mallory" },
    location: ACTOR,
  });
}

async function evalCode(code: string): Promise<string> {
  return await softcodeService.runSoftcode(code, {
    actorId:    ACTOR,
    executorId: ACTOR,
    args:       [],
  });
}

Deno.test("H1: repeat() clamps count to safe ceiling", OPTS, async () => {
  await seedActor();
  const out = await evalCode("[repeat(x,99999999)]");
  // Must NOT have produced a giant string.
  if (out.length > MAX) {
    throw new Error(`repeat() produced ${out.length} chars — exceeds ${MAX} clamp`);
  }
  assertEquals(out.length, MAX);
});

Deno.test("H1: space() clamps count", OPTS, async () => {
  const out = await evalCode("[space(50000000)]");
  if (out.length > MAX) {
    throw new Error(`space() produced ${out.length} chars — exceeds ${MAX} clamp`);
  }
  assertEquals(out.length, MAX);
});

Deno.test("H1: header() clamps width", OPTS, async () => {
  const out = await evalCode("[header(Title,99999999)]");
  if (out.length > MAX) {
    throw new Error(`header() produced ${out.length} chars — exceeds ${MAX} clamp`);
  }
  assertEquals(out.length, MAX);
});

Deno.test("H1: divider() clamps width", OPTS, async () => {
  const out = await evalCode("[divider(Title,99999999)]");
  if (out.length > MAX) {
    throw new Error(`divider() produced ${out.length} chars — exceeds ${MAX} clamp`);
  }
  assertEquals(out.length, MAX);
});

Deno.test("H1: footer() clamps width", OPTS, async () => {
  const out = await evalCode("[footer(99999999)]");
  if (out.length > MAX) {
    throw new Error(`footer() produced ${out.length} chars — exceeds ${MAX} clamp`);
  }
  assertEquals(out.length, MAX);
});

Deno.test("H1: ljust() clamps width (pre-existing helper, same risk)", OPTS, async () => {
  const out = await evalCode("[ljust(x,99999999,.)]");
  if (out.length > MAX) {
    throw new Error(`ljust() produced ${out.length} chars — exceeds ${MAX} clamp`);
  }
  assertEquals(out.length, MAX);
});

Deno.test("H1: rjust() clamps width", OPTS, async () => {
  const out = await evalCode("[rjust(x,99999999,.)]");
  if (out.length > MAX) {
    throw new Error(`rjust() produced ${out.length} chars — exceeds ${MAX} clamp`);
  }
  assertEquals(out.length, MAX);
});

Deno.test("H1: center() clamps width", OPTS, async () => {
  const out = await evalCode("[center(x,99999999,.)]");
  if (out.length > MAX) {
    throw new Error(`center() produced ${out.length} chars — exceeds ${MAX} clamp`);
  }
  assertEquals(out.length, MAX);
});

Deno.test("H1: cleanup", OPTS, async () => {
  await dbojs.delete({ id: ACTOR }).catch(() => {});
  await DBO.close();
});
