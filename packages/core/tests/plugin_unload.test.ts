/**
 * unloadPlugin calls remove() and drops registry entry.
 */
import { assertEquals } from "@std/assert";
import {
  registerPlugin,
  forceLoadPlugins,
  unloadPlugin,
  listPlugins,
  getPlugin,
} from "../mod.ts";
import type { IPlugin } from "../mod.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("unloadPlugin invokes remove and unregisters", OPTS, async () => {
  // Clear any leftover from other tests by unloading known names.
  await unloadPlugin("unload-test-a");
  await unloadPlugin("unload-test-b");

  let removed = false;
  const plugin: IPlugin = {
    name: "unload-test-a",
    version: "1.0.0",
    init: () => true,
    remove: () => {
      removed = true;
    },
  };
  registerPlugin(plugin);
  await forceLoadPlugins();
  assertEquals(getPlugin("unload-test-a")?.name, "unload-test-a");

  await unloadPlugin("unload-test-a");
  assertEquals(removed, true);
  assertEquals(getPlugin("unload-test-a"), undefined);
  assertEquals(
    listPlugins().some((p) => p.name === "unload-test-a"),
    false,
  );
});

Deno.test("unloadPlugin missing name is no-op", OPTS, async () => {
  await unloadPlugin("does-not-exist-xyz");
});
