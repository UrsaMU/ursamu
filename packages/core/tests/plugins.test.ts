/**
 * Tests for the core plugin dependency resolution system:
 *   - Topological sort
 *   - Semver checks
 *   - Dependency ordering and initialization
 */
import { assertEquals, assertRejects } from "@std/assert";
import { describe, it, beforeEach } from "@std/testing/bdd";
import { registerPlugin, forceLoadPlugins as loadPlugins, listPlugins, _registryRemove } from "../src/plugins/loader.ts";
import type { IPlugin } from "../src/plugins/types.ts";

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
    init: typeof initResult === "function" ? initResult : () => Promise.resolve(initResult),
    remove: () => Promise.resolve(),
  };
}

describe("core plugin system", () => {
  beforeEach(() => {
    // Clear registry before each test
    for (const p of listPlugins()) {
      _registryRemove(p.name);
    }
  });

  it("initializes plugins in dependency order", async () => {
    const order: string[] = [];
    const jobs    = makePlugin("jobs",    "1.1.0", [],                            () => { order.push("jobs");    return true; });
    const discord = makePlugin("discord", "1.1.0", [{ name: "jobs", version: "^1.0.0" }], () => { order.push("discord"); return true; });

    // Register in reverse order to prove topo sort works
    registerPlugin(discord);
    registerPlugin(jobs);
    await loadPlugins();

    assertEquals(order, ["jobs", "discord"]);
  });

  it("halts startup when dep version is out of range", async () => {
    const jobs    = makePlugin("jobs_range", "1.0.0");
    const discord = makePlugin("discord_range", "1.1.0", [{ name: "jobs_range", version: "^2.0.0" }]);

    registerPlugin(jobs);
    registerPlugin(discord);

    await assertRejects(() => loadPlugins(), Error, "does not satisfy ^2.0.0");
  });

  it("accepts plugin when version satisfies range", async () => {
    const jobs    = makePlugin("jobs_ok", "1.2.3");
    const discord = makePlugin("discord_ok", "1.0.0", [{ name: "jobs_ok", version: "^1.0.0" }]);

    registerPlugin(jobs);
    registerPlugin(discord);
    await loadPlugins();

    assertEquals(listPlugins().some(p => p.name === "discord_ok"), true);
  });
});
