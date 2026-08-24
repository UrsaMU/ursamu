/**
 * Web chargen must store on data.cpr (hydrate path), not top-level state.cpr.
 */
import { assertEquals } from "@std/assert";
import { rewriteStatePaths } from "@ursamu/ursamu";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("rewriteStatePaths maps state.cpr → data.cpr", OPTS, () => {
  const out = rewriteStatePaths({
    "state.cpr": { role: "solo", chargenStage: "method" },
  }) as Record<string, unknown>;
  assertEquals(out["data.cpr"] != null, true);
  assertEquals(out["state.cpr"], undefined);
  assertEquals(
    (out["data.cpr"] as { role: string }).role,
    "solo",
  );
});

Deno.test("cprOf prefers data.cpr over orphan state.cpr", OPTS, () => {
  // Mirror http.ts cprOf logic
  // deno-lint-ignore no-explicit-any
  function cprOf(obj: any) {
    return obj?.data?.cpr ?? obj?.state?.cpr;
  }
  const dual = {
    data: { cpr: { role: "from-game" } },
    state: { cpr: { role: "from-web" } },
  };
  assertEquals(cprOf(dual).role, "from-game");
  assertEquals(
    cprOf({ state: { cpr: { role: "web-only" } } }).role,
    "web-only",
  );
});
