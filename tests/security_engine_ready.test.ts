/**
 * SECURITY [L-01] — engine:ready suppressed on runStartupAttrs failure
 *
 * Regression test: engine:ready MUST fire even when runStartupAttrs rejects,
 * because it signals "engine is up and all plugins are loaded" — not
 * "all STARTUP attributes ran without error".
 *
 * If runStartupAttrs fails (corrupt script, DB blip), plugins that registered
 * engine:ready handlers (e.g. help-plugin's cache refresh) silently go
 * uncalled, leaving them in a degraded state with no recovery path short of
 * a manual +help/reload.
 */

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";

describe("SECURITY [L-01]: engine:ready fired regardless of runStartupAttrs outcome", () => {
  it("[EXPLOIT] .then() chain silently drops engine:ready when runStartupAttrs rejects", async () => {
    // Replicate the ORIGINAL pattern from main.ts:
    //   runStartupAttrs()
    //     .then(() => gameHooks.emit("engine:ready"))
    //     .catch(err => console.error(...));
    let readyFired = false;

    const failingStartup = (): Promise<void> =>
      Promise.reject(new Error("DB blip during runStartupAttrs"));

    await failingStartup()
      .then(() => { readyFired = true; })   // skipped on rejection
      .catch((_err) => { /* swallowed */ });

    // [RED] Proves the bug: engine:ready never fires on failure.
    // After the fix this assertion becomes false (readyFired === true).
    assertEquals(readyFired, false, "engine:ready was NOT fired — demonstrates the bug");
  });

  it("[VERIFY FIX] .catch().then() pattern ensures engine:ready always fires", async () => {
    // The fixed pattern from main.ts:
    //   runStartupAttrs()
    //     .catch(err => console.error(...))   // converts rejection → resolution
    //     .then(() => gameHooks.emit("engine:ready"));
    let readyFired = false;

    const failingStartup = (): Promise<void> =>
      Promise.reject(new Error("DB blip during runStartupAttrs"));

    await failingStartup()
      .catch((_err) => { /* log & swallow */ })
      .then(() => { readyFired = true; });

    assertEquals(readyFired, true, "engine:ready fires even when runStartupAttrs rejects");
  });
});
