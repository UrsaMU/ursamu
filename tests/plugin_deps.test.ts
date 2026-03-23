/**
 * Tests for the plugin dependency resolution system:
 *   - Topological sort (sortByDependencies)
 *   - Semver checks (checkDependencies)
 *   - PluginConfigManager.initializePlugins() ordering, skipping, and cascade
 *
 * All tests use a local stub ConfigManager and never touch the real DB.
 */
import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert";
import { describe, it, beforeEach, afterEach } from "jsr:@std/testing/bdd";
import { assertSpyCalls, spy } from "jsr:@std/testing/mock";
import type { IPlugin } from "../src/@types/IPlugin.ts";

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Minimal stub that satisfies the ConfigManager interface used by plugin.ts */
function makeStubConfigManager() {
  return {
    registerPlugin: (_name: string, _cfg: unknown) => {},
    getPluginConfig: (_name: string) => undefined,
    updatePluginConfig: (_name: string, _cfg: unknown) => {},
  } as unknown as import("../src/services/Config/index.ts").ConfigManager;
}

function makePlugin(
  name: string,
  version = "1.0.0",
  deps: { name: string; version: string }[] = [],
  initResult: boolean | (() => boolean | Promise<boolean>) = true,
): IPlugin {
  return {
    name,
    version,
    dependencies: deps,
    init: typeof initResult === "function" ? initResult : async () => initResult,
    remove: async () => {},
  };
}

// ─── PluginConfigManager tests ────────────────────────────────────────────────

// We access the private class through a fresh module import each time to avoid
// singleton bleed between tests.
async function freshManager() {
  // crypto.randomUUID() ensures a unique URL even for sub-ms test runs,
  // giving each call an isolated module (and therefore isolated singleton).
  const url = new URL("../src/services/Config/plugin.ts", import.meta.url).href;
  const { PluginConfigManager } = await import(url + `?t=${crypto.randomUUID()}`);
  const stub = makeStubConfigManager();
  return PluginConfigManager.init(stub);
}

const OPTS = { sanitizeResources: false, sanitizeOps: false };

describe("plugin dependency system", () => {
  // ─── ordering ──────────────────────────────────────────────────────────────

  it("initializes plugins in dependency order", OPTS, async () => {
    const order: string[] = [];
    const jobs    = makePlugin("jobs",    "1.1.0", [],                            async () => { order.push("jobs");    return true; });
    const discord = makePlugin("discord", "1.1.0", [{ name: "jobs", version: "^1.0.0" }], async () => { order.push("discord"); return true; });

    const mgr = await freshManager();
    // Register in reverse order to prove topo sort works
    mgr.registerPlugin(discord);
    mgr.registerPlugin(jobs);
    await mgr.initializePlugins();

    assertEquals(order, ["jobs", "discord"]);
  });

  it("handles plugins with no dependencies (backwards compatible)", OPTS, async () => {
    const ran: string[] = [];
    const a = makePlugin("a", "1.0.0", [], async () => { ran.push("a"); return true; });
    const b = makePlugin("b", "1.0.0", [], async () => { ran.push("b"); return true; });

    const mgr = await freshManager();
    mgr.registerPlugin(a);
    mgr.registerPlugin(b);
    await mgr.initializePlugins();

    assertEquals(ran.sort(), ["a", "b"]);
  });

  // ─── semver checks ─────────────────────────────────────────────────────────

  it("halts startup when dep version is out of range", OPTS, async () => {
    const jobs    = makePlugin("jobs",    "1.0.0");
    const initSpy = spy(async () => true);
    const discord = makePlugin("discord", "1.1.0", [{ name: "jobs", version: "^2.0.0" }], initSpy);

    const mgr = await freshManager();
    mgr.registerPlugin(jobs);
    mgr.registerPlugin(discord);

    await assertRejects(
      () => mgr.initializePlugins(),
      Error,
      "jobs@^2.0.0",
    );
    assertSpyCalls(initSpy, 0);
  });

  it("accepts plugin when version satisfies range", OPTS, async () => {
    const initSpy = spy(async () => true);
    const jobs    = makePlugin("jobs",    "1.2.3");
    const discord = makePlugin("discord", "1.0.0", [{ name: "jobs", version: "^1.0.0" }], initSpy);

    const mgr = await freshManager();
    mgr.registerPlugin(jobs);
    mgr.registerPlugin(discord);
    await mgr.initializePlugins();

    assertSpyCalls(initSpy, 1);
  });

  // ─── missing dep ───────────────────────────────────────────────────────────

  it("halts startup when dependency is absent entirely", OPTS, async () => {
    const initSpy = spy(async () => true);
    const discord = makePlugin("discord", "1.1.0", [{ name: "jobs", version: "^1.0.0" }], initSpy);

    const mgr = await freshManager();
    mgr.registerPlugin(discord); // jobs not registered

    await assertRejects(
      () => mgr.initializePlugins(),
      Error,
      "jobs@^1.0.0",
    );
    assertSpyCalls(initSpy, 0);
  });

  // ─── cascade ───────────────────────────────────────────────────────────────

  it("cascades skip to dependents when dep init returns false", OPTS, async () => {
    const jobs      = makePlugin("jobs",    "1.0.0", [], async () => false); // fails
    const initSpy   = spy(async () => true);
    const discord   = makePlugin("discord", "1.0.0", [{ name: "jobs", version: "^1.0.0" }], initSpy);

    const mgr = await freshManager();
    mgr.registerPlugin(jobs);
    mgr.registerPlugin(discord);
    await mgr.initializePlugins();

    assertSpyCalls(initSpy, 0); // discord cascaded
  });

  it("cascades skip when dep init() returns false", OPTS, async () => {
    // jobs init returns false → discord (depends on jobs) is cascade-skipped
    const jobs      = makePlugin("jobs",    "1.0.0", [], async () => false);
    const discordInit = spy(async () => true);
    const discord   = makePlugin("discord", "1.0.0", [{ name: "jobs", version: "^1.0.0" }], discordInit);

    const mgr = await freshManager();
    mgr.registerPlugin(jobs);
    mgr.registerPlugin(discord);
    await mgr.initializePlugins(); // does NOT throw — init failure is not a config error

    assertSpyCalls(discordInit, 0);
  });

  // ─── circular dep detection ────────────────────────────────────────────────

  it("halts startup on circular dependencies", OPTS, async () => {
    const a = makePlugin("a", "1.0.0", [{ name: "b", version: "^1.0.0" }]);
    const b = makePlugin("b", "1.0.0", [{ name: "a", version: "^1.0.0" }]);

    const mgr = await freshManager();
    mgr.registerPlugin(a);
    mgr.registerPlugin(b);

    await assertRejects(
      () => mgr.initializePlugins(),
      Error,
      "Circular dependency",
    );
  });

  // ─── L2: plugin name collision ─────────────────────────────────────────────
  // Exploit: registerPlugin() only warns on duplicate name — it overwrites the
  // existing entry.  A rogue plugin declaring name="jobs" with a lower version
  // can shadow the real plugin after it loads, making dep checks pass against
  // the wrong version.

  it("L2 exploit: registerPlugin overwrites same-named plugin without throwing (pre-fix)", OPTS, async () => {
    const mgr = await freshManager();
    const real    = makePlugin("jobs", "2.0.0");
    const imposter = makePlugin("jobs", "0.1.0"); // same name, older version

    mgr.registerPlugin(real);
    // Before fix: this silently overwrites — dependency checks now run against 0.1.0
    // After fix:  this throws
    let threw = false;
    try { mgr.registerPlugin(imposter); } catch { threw = true; }
    // BEFORE FIX: threw === false  (vulnerability confirmed)
    // AFTER FIX:  threw === true   (imposter rejected)
    assertEquals(threw, true, "duplicate plugin name with different version must be rejected");
  });

  it("L2 red: same-version re-registration is idempotent (hot-reload safe)", OPTS, async () => {
    const mgr  = await freshManager();
    const jobs = makePlugin("jobs", "2.0.0");
    mgr.registerPlugin(jobs);
    // Same object, same version — should NOT throw (allows idempotent reload)
    mgr.registerPlugin(jobs);
    // verify it's still registered
    assertEquals(mgr.getPlugin("jobs")?.version, "2.0.0");
  });

  // ─── IPlugin type ──────────────────────────────────────────────────────────

  it("dependencies field is optional — plugin without it registers fine", OPTS, async () => {
    const ran: string[] = [];
    const p: IPlugin = {
      name:    "simple",
      version: "1.0.0",
      init:    async () => { ran.push("simple"); return true; },
    };

    const mgr = await freshManager();
    mgr.registerPlugin(p);
    await mgr.initializePlugins();

    assertEquals(ran, ["simple"]);
  });
});
