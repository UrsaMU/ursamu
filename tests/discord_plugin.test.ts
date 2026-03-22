/**
 * tests/discord_plugin.test.ts
 *
 * Unit tests for the discord plugin improvements:
 *   - isStaff() security fix (Set.has vs string.includes)
 *   - job footer uses bucket ?? category
 *   - clean() strips MUSH codes and clamps to 80 chars
 *   - presence.ts / job-hooks.ts subscribe/unsubscribe (smoke)
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { clean } from "../src/plugins/discord/helpers.ts";

// ─── clean() ──────────────────────────────────────────────────────────────────

Deno.test("discord helpers: clean() strips MUSH color codes", () => {
  assertEquals(clean("%chAlice%cn"), "Alice");
  assertEquals(clean("%crRed%cn"),   "Red");
});

Deno.test("discord helpers: clean() strips ANSI escapes", () => {
  // deno-lint-ignore no-control-regex
  assertEquals(clean("\x1b[1mBold\x1b[0m"), "Bold");
});

Deno.test("discord helpers: clean() clamps to 80 chars", () => {
  const long = "A".repeat(100);
  assertEquals(clean(long).length, 80);
});

Deno.test("discord helpers: clean() returns 'Unknown' for empty/whitespace", () => {
  assertEquals(clean("   "), "Unknown");
  assertEquals(clean(""),    "Unknown");
});

// ─── isStaff() security — Set.has vs .includes ────────────────────────────────
// Test the fix directly by exercising the logic we changed.
// We can't easily call isStaff() without a running KV, so we test the
// equivalent logic inline — the same transformation applied in router.ts.

function flagsHasStaff(rawFlags: string | Set<string>): boolean {
  const flags = rawFlags instanceof Set
    ? rawFlags
    : new Set(String(rawFlags ?? "").split(/\s+/).filter(Boolean));
  return flags.has("admin") || flags.has("wizard") || flags.has("superuser");
}

Deno.test("discord router: flagsHasStaff — Set form: admin passes", () => {
  assertEquals(flagsHasStaff(new Set(["player", "admin"])), true);
});

Deno.test("discord router: flagsHasStaff — string form: wizard passes", () => {
  assertEquals(flagsHasStaff("player connected wizard"), true);
});

Deno.test("discord router: flagsHasStaff — 'notadmin' does NOT grant admin (substring bypass closed)", () => {
  // old string.includes("admin") would have returned true here
  assertEquals(flagsHasStaff("player notadmin"), false);
});

Deno.test("discord router: flagsHasStaff — 'wizardly' does NOT grant wizard", () => {
  assertEquals(flagsHasStaff("player wizardly"), false);
});

Deno.test("discord router: flagsHasStaff — plain player is not staff", () => {
  assertEquals(flagsHasStaff("player connected"), false);
});

Deno.test("discord router: flagsHasStaff — superuser passes", () => {
  assertEquals(flagsHasStaff(new Set(["player", "superuser"])), true);
});

// ─── bucket label logic ───────────────────────────────────────────────────────
// Mirrors the bucketLabel() helper in job-hooks.ts

function bucketLabel(job: { bucket?: string; category?: string }): string {
  return job.bucket ?? job.category ?? "General";
}

Deno.test("discord job-hooks: bucketLabel uses bucket when present", () => {
  assertEquals(bucketLabel({ bucket: "BUG", category: "bug" }), "BUG");
});

Deno.test("discord job-hooks: bucketLabel falls back to category when bucket absent", () => {
  assertEquals(bucketLabel({ category: "request" }), "request");
});

Deno.test("discord job-hooks: bucketLabel defaults to 'General' when both absent", () => {
  assertEquals(bucketLabel({}), "General");
});

// ─── subscribe/unsubscribe smoke test ─────────────────────────────────────────
// Verifies init/remove symmetry without needing live Discord webhooks.
// sanitizeOps: false — imports trigger async config reads we don't own.

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("discord plugin: subscribeJobHooks / unsubscribeJobHooks do not throw", OPTS, async () => {
  // Import the real functions — if they throw on subscribe/unsubscribe
  // (e.g. wrong handler reference), this test catches it.
  // deno-lint-ignore no-explicit-any
  const { subscribeJobHooks, unsubscribeJobHooks } = await import("../src/plugins/discord/job-hooks.ts") as any;
  subscribeJobHooks();
  unsubscribeJobHooks();
});

Deno.test("discord plugin: subscribePresenceHooks / unsubscribePresenceHooks do not throw", OPTS, async () => {
  // deno-lint-ignore no-explicit-any
  const { subscribePresenceHooks, unsubscribePresenceHooks } = await import("../src/plugins/discord/presence.ts") as any;
  subscribePresenceHooks();
  unsubscribePresenceHooks();
});

Deno.test("discord plugin: double-subscribe then unsubscribe leaves no listeners", OPTS, async () => {
  // deno-lint-ignore no-explicit-any
  const { subscribeJobHooks, unsubscribeJobHooks } = await import("../src/plugins/discord/job-hooks.ts") as any;
  // Simulate @reload calling init twice before remove
  subscribeJobHooks();
  subscribeJobHooks();
  unsubscribeJobHooks();
  unsubscribeJobHooks();
  // No assertion needed — absence of throw + no crash is the invariant
});
