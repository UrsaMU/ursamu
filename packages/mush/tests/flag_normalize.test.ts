import { assertEquals } from "@std/assert";
import { normalizeFlagList } from "../src/routes/players.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("normalizeFlagList string", OPTS, () => {
  assertEquals(
    normalizeFlagList("player superuser connected"),
    ["player", "superuser", "connected"],
  );
});
Deno.test("normalizeFlagList Set", OPTS, () => {
  assertEquals(
    normalizeFlagList(new Set(["player", "superuser"])).sort(),
    ["player", "superuser"].sort(),
  );
});
Deno.test("normalizeFlagList empty", OPTS, () => {
  assertEquals(normalizeFlagList(undefined), []);
});
