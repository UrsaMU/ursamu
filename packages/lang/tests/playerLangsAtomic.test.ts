import { assert, assertEquals } from "@std/assert";
import { setActive, setSkill } from "../src/playerLangs.ts";
import { mockU } from "./helpers/mockU.ts";

Deno.test("setSkill — writes only the targeted language sub-path (no overwrite)", async () => {
  const u = mockU();
  await setSkill(u, u.me, "huttese", 50);
  const calls = (u as unknown as { _dbCalls: unknown[][] })._dbCalls;
  const [, op, payload] = calls[0] as [string, string, Record<string, unknown>];
  assertEquals(op, "$set");
  const keys = Object.keys(payload);
  assertEquals(keys.length, 1, `expected single sub-path key, got: ${keys.join(",")}`);
  assert(
    keys[0] === "data.languages.known.huttese",
    `expected sub-path "data.languages.known.huttese", got "${keys[0]}"`,
  );
  assertEquals(payload[keys[0]], 50);
});

Deno.test("setActive — writes only the active sub-path", async () => {
  const u = mockU();
  await setActive(u, u.me, "Shyriiwook");
  const calls = (u as unknown as { _dbCalls: unknown[][] })._dbCalls;
  const [, op, payload] = calls[0] as [string, string, Record<string, unknown>];
  assertEquals(op, "$set");
  const keys = Object.keys(payload);
  assertEquals(keys, ["data.languages.active"]);
  assertEquals(payload["data.languages.active"], "shyriiwook");
});

Deno.test("setActive(null) — uses $unset on active sub-path", async () => {
  const u = mockU();
  await setActive(u, u.me, null);
  const calls = (u as unknown as { _dbCalls: unknown[][] })._dbCalls;
  const [, op, payload] = calls[0] as [string, string, Record<string, unknown>];
  assertEquals(op, "$unset");
  assertEquals(Object.keys(payload), ["data.languages.active"]);
});
