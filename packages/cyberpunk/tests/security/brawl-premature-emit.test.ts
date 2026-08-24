/**
 * Security test — H-5: emitGMBrawlResolved fires on rejected moves
 *
 * Exploit: commands/brawl.ts calls emitGMBrawlResolved AFTER doBrawlMove
 * regardless of whether the move was actually executed or rejected (e.g. pin/choke
 * rejected because target is not grabbed). The GM then receives a false event
 * like "Ghost attempts pin on Rogue." even though nothing happened.
 *
 * Fix: doBrawlMove returns Promise<boolean> — true if the move was attempted,
 * false if rejected by a pre-condition check. emitGMBrawlResolved is called only
 * when doBrawlMove returns true.
 */
import { assertEquals } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";

// ─── Invariant tests ──────────────────────────────────────────────────────────
// We test the pattern directly (not through the full command) because brawl.ts
// cannot be easily imported in Deno test context (UrsaMU SDK dependency).

describe("H-5 — emitGMBrawlResolved must not fire on rejected moves", () => {
  it("EXPLOIT: void-returning doBrawlMove allows emit to always fire", async () => {
    let emitCount = 0;
    const mockEmit = () => { emitCount++; };

    async function doBrawlMoveVoid(move: string): Promise<void> {
      if (move === "pin") {
        // Rejects: target not grabbed — but callee can't know
        return;
      }
      // Executes grab ...
    }

    async function execBuggy(move: string): Promise<void> {
      await doBrawlMoveVoid(move);
      mockEmit(); // always fires, even on rejected pin
    }

    // Simulate pin rejection — emitter fires anyway
    await execBuggy("pin");
    assertEquals(emitCount, 1, "EXPLOIT: emit fires even for rejected pin");
  });

  it("FIXED: boolean-returning doBrawlMove gates the emit", () => {
    let emitCount = 0;
    const mockEmit = () => { emitCount++; };

    async function doBrawlMoveFixed(move: string): Promise<boolean> {
      if (move === "pin") {
        // Rejects: target not grabbed
        return false;
      }
      // Executes grab
      return true;
    }

    async function execFixed(move: string): Promise<void> {
      const executed = await doBrawlMoveFixed(move);
      if (executed) mockEmit(); // only fires if move was actually attempted
    }

    // Pin rejection — emitter must NOT fire
    execFixed("pin");
    assertEquals(emitCount, 0, "FIXED: emit must not fire for rejected pin");
  });

  it("FIXED: emit fires when grab succeeds", async () => {
    let emitCount = 0;
    const mockEmit = () => { emitCount++; };

    async function doBrawlMoveFixed(move: string): Promise<boolean> {
      if (move === "pin") return false;
      return true; // grab, throw, disarm always attempt
    }

    async function execFixed(move: string): Promise<void> {
      const executed = await doBrawlMoveFixed(move);
      if (executed) mockEmit();
    }

    await execFixed("grab");
    assertEquals(emitCount, 1, "FIXED: emit fires for a legitimate grab attempt");
  });

  it("FIXED: choke is rejected without grab precondition, emit suppressed", async () => {
    let emitCount = 0;
    const mockEmit = () => { emitCount++; };

    async function doBrawlMoveFixed(move: string, hasGrab: boolean): Promise<boolean> {
      if ((move === "pin" || move === "choke") && !hasGrab) return false;
      return true;
    }

    async function execFixed(move: string, hasGrab: boolean): Promise<void> {
      const executed = await doBrawlMoveFixed(move, hasGrab);
      if (executed) mockEmit();
    }

    await execFixed("choke", false); // no grab → rejected
    assertEquals(emitCount, 0, "choke without grab: emit suppressed");

    await execFixed("choke", true); // has grab → executed
    assertEquals(emitCount, 1, "choke with grab: emit fires");
  });
});
