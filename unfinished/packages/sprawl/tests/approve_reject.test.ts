import { assertEquals } from "@std/assert";
import { rewriteStatePaths } from "../../mush/src/commands/sdk.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("reject storage path must be data.sprawl", OPTS, () => {
  // u.db.modify rewrites state.* → data.*; raw dbojs does not.
  const viaSdk = rewriteStatePaths({
    "state.sprawl": {
      chargenComplete: false,
      chargenStatus: "revision",
    },
  }) as Record<string, unknown>;
  assertEquals(
    Object.keys(viaSdk)[0],
    "data.sprawl",
  );
  const sheet = viaSdk["data.sprawl"] as {
    chargenComplete: boolean;
  };
  assertEquals(sheet.chargenComplete, false);
});
