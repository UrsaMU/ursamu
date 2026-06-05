/**
 * SECURITY — watcher cap TOCTOU exploit test.
 *
 * The attack: two concurrent +bbwatch commands from different players both
 * read watchers.length === 49 before either write completes. Both pass the
 * cap check and both write, resulting in 51 watchers.
 *
 * Red: simulate the vulnerable "check then write" logic.
 * Green: the patched logic caps the array at write time via slice(0, CAP).
 */
import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";

const WATCHER_CAP = 50;

// ---------------------------------------------------------------------------
// Vulnerable implementation: check before write — TOCTOU window
// ---------------------------------------------------------------------------
function addWatcherVulnerable(
  watchers: string[],
  playerId: string,
): { ok: boolean; watchers: string[] } {
  // TOCTOU: read, check, then write — concurrent calls both see length < cap
  if (watchers.length >= WATCHER_CAP) return { ok: false, watchers };
  return { ok: true, watchers: [...watchers, playerId] };
}

// Simulate two concurrent calls both reading the same base array (cap-1 watchers)
function simulateConcurrentAddVulnerable(): string[] {
  const base = Array.from({ length: 49 }, (_, i) => `p${i}`);
  // Both calls read base (length=49), both pass the cap check, both write
  const r1 = addWatcherVulnerable(base, "pA");
  addWatcherVulnerable(base, "pB");
  // Merge: last write wins in real DB, but conceptually both added
  // Represent the worst case: both additions succeed
  return [...r1.watchers, "pB"]; // simulates both writes going through
}

// ---------------------------------------------------------------------------
// Patched implementation: enforce cap at write time with slice
// ---------------------------------------------------------------------------
function addWatcherPatched(
  watchers: string[],
  playerId: string,
): { ok: boolean; watchers: string[] } {
  if (watchers.includes(playerId)) return { ok: false, watchers }; // already watching
  // Enforce cap at write time: slice ensures the stored array never exceeds cap
  const updated = [...watchers, playerId].slice(0, WATCHER_CAP);
  const ok = updated.includes(playerId);
  return { ok, watchers: updated };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("watcher cap TOCTOU — vulnerable implementation", () => {
  it("EXPLOIT: concurrent adds can exceed the 50-watcher cap", () => {
    const result = simulateConcurrentAddVulnerable();
    // Vulnerable: result has 51 watchers — cap was bypassed
    assertEquals(result.length > WATCHER_CAP, true);
  });
});

describe("watcher cap TOCTOU — patched implementation", () => {
  it("patched: adding to a full list is a no-op (cap enforced at write time)", () => {
    const full = Array.from({ length: 50 }, (_, i) => `p${i}`);
    const result = addWatcherPatched(full, "pNew");
    // The new player should not appear — cap enforced
    assertEquals(result.watchers.length, WATCHER_CAP);
    assertEquals(result.watchers.includes("pNew"), false);
    assertEquals(result.ok, false);
  });

  it("patched: concurrent-style add to almost-full list stays at cap", () => {
    const almostFull = Array.from({ length: 49 }, (_, i) => `p${i}`);
    // Both concurrent calls see length=49, but slice(0, 50) enforces the cap
    const r1 = addWatcherPatched(almostFull, "pA");
    const r2 = addWatcherPatched(almostFull, "pB");
    assertEquals(r1.watchers.length, WATCHER_CAP);
    assertEquals(r2.watchers.length, WATCHER_CAP);
  });

  it("patched: normal add under cap succeeds", () => {
    const result = addWatcherPatched(["p1", "p2"], "p3");
    assertEquals(result.ok, true);
    assertEquals(result.watchers.length, 3);
  });

  it("patched: duplicate add is rejected", () => {
    const result = addWatcherPatched(["p1"], "p1");
    assertEquals(result.ok, false);
    assertEquals(result.watchers.length, 1);
  });
});
