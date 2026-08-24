/**
 * Staff wipe of approved / draft CPR sheets.
 */
import {
  assertEquals,
  assertExists,
} from "jsr:@std/assert@^0.224.0";
import { wipeCharacter } from "../src/chargen/wipe_core.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// Minimal dbojs stub via dynamic patch is heavy; unit-test pure
// path guards and shape of success/error without a live DB when
// query returns empty.

Deno.test("wipeCharacter — missing playerId", OPTS, async () => {
  const res = await wipeCharacter({ playerId: "" });
  assertEquals(res.ok, false);
  if (!res.ok) {
    assertEquals(res.error, "playerId required");
  }
});

Deno.test(
  "wipeCharacter — player not found (empty query)",
  OPTS,
  async () => {
    // When DB has no row, wipe reports not found.
    // Use a nonsense id unlikely to exist in unit test DB.
    const res = await wipeCharacter({
      playerId: "___no_such_player_wipe_test___",
    });
    // Depending on DB adapter, may be not found or ok empty.
    if (!res.ok) {
      assertEquals(res.error, "Player not found");
    } else {
      assertEquals(res.hadSheet, false);
    }
  },
);

Deno.test("wipeCharacter result shape docs", OPTS, () => {
  // Compile-time shape smoke via type assignment
  const ok: Extract<
    Awaited<ReturnType<typeof wipeCharacter>>,
    { ok: true }
  > = {
    ok: true,
    name: "Tester",
    hadSheet: true,
    wasApproved: true,
  };
  assertExists(ok.name);
  assertEquals(ok.wasApproved, true);
});
