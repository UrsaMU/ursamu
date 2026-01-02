// deno-lint-ignore-file no-import-prefix
import { assertEquals } from "https://deno.land/std/assert/mod.ts";
import plugin from "../src/index.ts";

Deno.test("test-standalone-plugin plugin metadata", () => {
  assertEquals(plugin.name, "test-standalone-plugin");
  assertEquals(plugin.version, "1.0.0");
});

Deno.test("test-standalone-plugin plugin initialization", async () => {
  // @ts-ignore: init might not be on the type but we know it's there
  const result = await plugin.init?.();
  assertEquals(result, true);
});
