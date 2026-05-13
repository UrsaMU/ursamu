/**
 * v2.5.0 stdlib TDD audit — covers M1, M2, L1, L3 findings.
 *
 * M1: noiseseed() with empty/missing arg must NOT silently reset seed to 0.
 * M2: Unreal vector aliases (vsize/vsizesq/vdistance/vdistsquared/vlerp/vclamp)
 *     must return MUSH-style "#-1 ARGUMENT MISSING" on missing args, not throw.
 * L1: parseVec3 (vreflect inputs) must reject non-numeric input rather than
 *     silently coercing to zero.
 * L3: randseed must accept any numeric seed value (truncating documented in help)
 *     and randseed("clear") must restore Math.random() fallback.
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { softcodeService } from "../src/services/Softcode/index.ts";
import { dbojs, DBO } from "../src/services/Database/database.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false, timeout: 15000 };

const ACTOR = "audit_v2_5";

async function evalCode(code: string): Promise<string> {
  return await softcodeService.runSoftcode(code, {
    actorId:    ACTOR,
    executorId: ACTOR,
    args:       [],
  });
}

Deno.test("audit setup", OPTS, async () => {
  await dbojs.delete({ id: ACTOR }).catch(() => {});
  await dbojs.create({
    id: ACTOR,
    flags: "player connected",
    data: { name: "Auditor" },
    location: ACTOR,
  });
});

// ── M1 ──────────────────────────────────────────────────────────────────────
// Softcode module state is per-eval (each runSoftcode spawns a fresh worker),
// so we exercise read/write semantics within a single eval.

Deno.test("M1: noiseseed() with no arg reads current seed without resetting", OPTS, async () => {
  // After noiseseed(42), a no-arg noiseseed() must report 42 (not "" / 0).
  const out = await evalCode("[noiseseed(42)][noiseseed()]");
  assertStringIncludes(out, "42");
});

Deno.test("M1: noiseseed() with no arg on fresh worker returns empty (unseeded)", OPTS, async () => {
  const out = await evalCode("[noiseseed()]");
  assertEquals(out, "", "fresh worker has no seed; read should be empty");
});

Deno.test("M1: noiseseed() with explicit numeric arg returns prev seed and updates state", OPTS, async () => {
  // After noiseseed(42), call noiseseed(99) → returns "42" (prev). Then a
  // read returns "99". Final concat: "4299" — three chars from prev plus
  // empty from the noop set return.
  const out = await evalCode("[noiseseed(42)][noiseseed(99)][noiseseed()]");
  // Expect: first set returns "" (no prev), second set returns "42", read returns "99"
  assertEquals(out, "4299");
});

// ── M2 ──────────────────────────────────────────────────────────────────────
Deno.test("M2: vsize() with no arg returns MUSH error, doesn't throw", OPTS, async () => {
  const out = await evalCode("[vsize()]");
  assertStringIncludes(out, "#-1");
  assertStringIncludes(out, "ARGUMENT");
});

Deno.test("M2: vsizesq() with no arg returns MUSH error", OPTS, async () => {
  const out = await evalCode("[vsizesq()]");
  assertStringIncludes(out, "#-1");
});

Deno.test("M2: vdistance() with missing second arg returns MUSH error", OPTS, async () => {
  const out = await evalCode("[vdistance(0 0 0)]");
  assertStringIncludes(out, "#-1");
});

Deno.test("M2: vdistsquared() with missing second arg returns MUSH error", OPTS, async () => {
  const out = await evalCode("[vdistsquared(0 0 0)]");
  assertStringIncludes(out, "#-1");
});

Deno.test("M2: vlerp() with missing args returns MUSH error", OPTS, async () => {
  const out = await evalCode("[vlerp()]");
  assertStringIncludes(out, "#-1");
});

Deno.test("M2: vclamp() with missing args returns MUSH error", OPTS, async () => {
  const out = await evalCode("[vclamp()]");
  assertStringIncludes(out, "#-1");
});

Deno.test("M2: well-formed calls still work after the guards", OPTS, async () => {
  assertEquals(await evalCode("[vsize(3 0 4)]"), "5");
  assertEquals(await evalCode("[vsizesq(3 0 4)]"), "25");
  assertEquals(await evalCode("[vdistance(0 0 0,3 0 4)]"), "5");
});

// ── L1 ──────────────────────────────────────────────────────────────────────
Deno.test("L1: vreflect() with non-numeric input returns MUSH error", OPTS, async () => {
  const out = await evalCode("[vreflect(foo bar baz,0 1 0)]");
  assertStringIncludes(out, "#-1");
});

Deno.test("L1: pointinaabb() with non-numeric input returns MUSH error", OPTS, async () => {
  const out = await evalCode("[pointinaabb(foo,0,0,0,0,0,1,1,1)]");
  assertStringIncludes(out, "#-1");
});

Deno.test("L1: rayaabb() with non-numeric input returns MUSH error", OPTS, async () => {
  const out = await evalCode("[rayaabb(foo,0,0,1,0,0,0,0,0,1,1,1)]");
  assertStringIncludes(out, "#-1");
});

Deno.test("L1: physics functions still work on valid input", OPTS, async () => {
  assertEquals(await evalCode("[pointinaabb(0.5,0.5,0.5,0,0,0,1,1,1)]"), "1");
  assertEquals(await evalCode("[pointinaabb(2,0.5,0.5,0,0,0,1,1,1)]"), "0");
});

// ── L3 ──────────────────────────────────────────────────────────────────────
// Same per-worker scope caveat: do all reads/writes inside one eval.
Deno.test("L3: randseed(clear) restores Math.random() fallback within one eval", OPTS, async () => {
  // Set seed → read seed → clear → read seed. All in one softcode eval.
  // Expected concat: "123" (set returns the new seed) + "123" (read) + "" (clear returns empty) + "" (read post-clear) = "123123"
  const out = await evalCode("[randseed(123)][randseed()][randseed(clear)][randseed()]");
  assertEquals(out, "123123", `concat was: ${JSON.stringify(out)}`);
});

Deno.test("audit cleanup", OPTS, async () => {
  await dbojs.delete({ id: ACTOR }).catch(() => {});
  await DBO.close();
});
