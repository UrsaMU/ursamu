import { assertEquals } from "@std/assert";
import {
  parseResourcesPath,
  parseConfigPluginPath,
  shortPluginId,
} from "../src/plugin-json-scan.ts";

Deno.test("shortPluginId", () => {
  assertEquals(shortPluginId("@ursamu/cofd-plugin"), "cofd");
  assertEquals(shortPluginId("jsr:@ursamu/jobs"), "jobs");
  assertEquals(shortPluginId("web"), "web");
});

Deno.test("parseResourcesPath — monorepo package", () => {
  const p = parseResourcesPath(
    "packages/cofd/resources/merits.json",
  );
  assertEquals(p?.plugin, "cofd");
  assertEquals(p?.rel, "merits.json");
});

Deno.test("parseResourcesPath — nested npcs", () => {
  const p = parseResourcesPath(
    "packages/cofd/resources/npcs/thug.json",
  );
  assertEquals(p?.plugin, "cofd");
  assertEquals(p?.rel, "npcs/thug.json");
});

Deno.test("parseResourcesPath — @ursamu package", () => {
  const p = parseResourcesPath(
    "node_modules/@ursamu/combat/resources/ai/aggressive.json",
  );
  assertEquals(p?.plugin, "combat");
  assertEquals(p?.rel, "ai/aggressive.json");
});

Deno.test("parseResourcesPath — ignores non-resources", () => {
  assertEquals(
    parseResourcesPath("packages/cofd/data/foo.json"),
    null,
  );
});

Deno.test("parseConfigPluginPath", () => {
  const p = parseConfigPluginPath(
    "config/plugins/discord.json",
  );
  assertEquals(p?.plugin, "discord");
  assertEquals(p?.rel, "discord.json");
});
