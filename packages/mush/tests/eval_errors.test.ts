/**
 * Softcode eval errors must surface to the enactor, not echo input.
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { runSoftcodeSimple } from "../src/softcode/engine.ts";
import { formatEvalError } from "../src/softcode/eval-errors.ts";
import "../src/softcode/stdlib/index.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("formatEvalError: Error message", OPTS, () => {
  const s = formatEvalError(new Error("boom"));
  assertEquals(s.startsWith("#-1 "), true);
  assertStringIncludes(s, "boom");
});

Deno.test("formatEvalError: unknown", OPTS, () => {
  const s = formatEvalError("raw");
  assertStringIncludes(s, "raw");
});

Deno.test(
  "runSoftcodeSimple: unknown fn returns #-1",
  OPTS,
  async () => {
    const out = await runSoftcodeSimple("[nosuchfn(1)]", {
      actorId: "ev_a",
      executorId: "ev_a",
    });
    assertEquals(out.startsWith("#-1"), true);
    assertStringIncludes(out.toLowerCase(), "not found");
  },
);

Deno.test(
  "runSoftcodeSimple: div by zero returns #-1",
  OPTS,
  async () => {
    const out = await runSoftcodeSimple("[div(1,0)]", {
      actorId: "ev_a",
      executorId: "ev_a",
    });
    assertEquals(out.startsWith("#-1"), true);
  },
);

Deno.test(
  "runSoftcodeSimple: good path unchanged",
  OPTS,
  async () => {
    assertEquals(
      await runSoftcodeSimple("[add(2,3)]", {
        actorId: "ev_a",
        executorId: "ev_a",
      }),
      "5",
    );
  },
);

Deno.test(
  "softcode width/height use executor term size",
  OPTS,
  async () => {
    const { dbojs } = await import("../src/world/dbobjs.ts");
    const id = "ev_term_actor";
    const prior = await dbojs.queryOne({ id });
    if (prior) await dbojs.delete({ id });
    await dbojs.create({
      id,
      flags: "player connected",
      data: {
        name: "TermActor",
        termWidth: 100,
        termHeight: 40,
      },
    });
    assertEquals(
      await runSoftcodeSimple("[width()]", {
        actorId: id,
        executorId: id,
      }),
      "100",
    );
    assertEquals(
      await runSoftcodeSimple("[height()]", {
        actorId: id,
        executorId: id,
      }),
      "40",
    );
    await dbojs.delete({ id });
  },
);
