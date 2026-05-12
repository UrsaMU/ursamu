/**
 * Tests for registerFormatTemplate — the MUSH-softcode shortcut for the
 * format-handler registry.
 */
import { assertEquals } from "@std/assert";
import { dbojs, DBO } from "../src/services/Database/database.ts";
import { createNativeSDK } from "../src/services/SDK/index.ts";
import { resolveFormat } from "../src/utils/resolveFormat.ts";
import {
  _clearFormatHandlers,
  registerFormatTemplate,
  unregisterFormatHandler,
} from "../src/utils/formatHandlers.ts";
import { hydrate } from "../src/utils/evaluateLock.ts";
import type { IDBObj, IUrsamuSDK } from "../src/@types/UrsamuSDK.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };
const SLOW = { timeout: 15000 };

const ROOM = "920001";
const ACTOR = "920002";
const TARGET = "920003";

async function cleanup() {
  for (const id of [ROOM, ACTOR, TARGET]) {
    await dbojs.delete({ id }).catch(() => {});
  }
}

async function seed() {
  await cleanup();
  _clearFormatHandlers();
  await dbojs.create({ id: ROOM, flags: "room", data: { name: "Tpl Room" } });
  await dbojs.create({
    id: ACTOR,
    flags: "player connected wizard",
    data: { name: "Alice" },
    location: ROOM,
  });
  await dbojs.create({
    id: TARGET,
    flags: "thing",
    data: { name: "Widget" },
    location: ROOM,
  });
}

async function ctx(): Promise<{ u: IUrsamuSDK; target: IDBObj }> {
  const u = await createNativeSDK("tpl-sock", ACTOR, {
    name: "test", original: "test", args: [], switches: [],
  });
  const raw = await dbojs.queryOne({ id: TARGET }) as unknown as IDBObj;
  return { u, target: hydrate(raw) };
}

Deno.test("registerFormatTemplate: runs MUSH softcode with %0 = default", { ...OPTS, ...SLOW }, async () => {
  await seed();
  registerFormatTemplate("NAMEFORMAT", "<<%0>>");
  const { u, target } = await ctx();
  const out = await resolveFormat(u, target, "NAMEFORMAT", "Widget");
  assertEquals(out, "<<Widget>>");
  _clearFormatHandlers();
  await cleanup();
});

Deno.test("registerFormatTemplate: returned handler unregisters cleanly", { ...OPTS, ...SLOW }, async () => {
  await seed();
  const h = registerFormatTemplate("DESCFORMAT", "[strcat(BOX:,%0,:BOX)]");
  const { u, target } = await ctx();
  let out = await resolveFormat(u, target, "DESCFORMAT", "hi");
  assertEquals(out, "BOX:hi:BOX");
  unregisterFormatHandler("DESCFORMAT", h);
  out = await resolveFormat(u, target, "DESCFORMAT", "hi");
  assertEquals(out, null);
  await cleanup();
  await DBO.close();
});
