/**
 * Tests for src/utils/resolveFormat.ts — the lifted format-resolution helper.
 *
 * Resolution order:
 *   1. softcode attribute on target (evaluated through softcodeService)
 *   2. plugin-registered handlers (first non-null wins)
 *   3. null fallback (caller renders default)
 */
import { assertEquals } from "@std/assert";
import { dbojs, DBO } from "../src/services/Database/database.ts";
import { createNativeSDK } from "../src/services/SDK/index.ts";
import { resolveFormat, resolveFormatOr } from "../src/utils/resolveFormat.ts";
import {
  _clearFormatHandlers,
  registerFormatHandler,
} from "../src/utils/formatHandlers.ts";
import { hydrate } from "../src/utils/evaluateLock.ts";
import type { IDBObj, IUrsamuSDK } from "../src/@types/UrsamuSDK.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };
const SLOW = { timeout: 15000 };

const ROOM = "910001";
const ACTOR = "910002";
const TARGET = "910003";

async function cleanup() {
  for (const id of [ROOM, ACTOR, TARGET]) {
    await dbojs.delete({ id }).catch(() => {});
  }
}

async function seed(attrs: Record<string, string> = {}) {
  await cleanup();
  _clearFormatHandlers();
  const attributes = Object.entries(attrs).map(([name, value]) => ({
    name, value, setter: ACTOR, type: "attribute",
  }));
  await dbojs.create({
    id: ROOM,
    flags: "room",
    data: { name: "RF Room" },
  });
  await dbojs.create({
    id: ACTOR,
    flags: "player connected wizard",
    data: { name: "Alice" },
    location: ROOM,
  });
  await dbojs.create({
    id: TARGET,
    flags: "thing",
    data: { name: "Widget", attributes },
    location: ROOM,
  });
}

async function makeContext(): Promise<{ u: IUrsamuSDK; target: IDBObj }> {
  const u = await createNativeSDK("rf-sock", ACTOR, {
    name: "test", original: "test", args: [], switches: [],
  });
  const raw = await dbojs.queryOne({ id: TARGET }) as unknown as IDBObj;
  const target = hydrate(raw);
  return { u, target };
}

Deno.test("resolveFormat: softcode attribute wins", { ...OPTS, ...SLOW }, async () => {
  await seed({ NAMEFORMAT: "<<%0>>" });
  const { u, target } = await makeContext();
  const out = await resolveFormat(u, target, "NAMEFORMAT", "Widget");
  assertEquals(out, "<<Widget>>");
  await cleanup();
});

Deno.test("resolveFormat: no attr, registered handler used", { ...OPTS, ...SLOW }, async () => {
  await seed();
  registerFormatHandler("DESCFORMAT", (_u, _t, arg) => `H[${arg}]`);
  const { u, target } = await makeContext();
  const out = await resolveFormat(u, target, "DESCFORMAT", "hi");
  assertEquals(out, "H[hi]");
  _clearFormatHandlers();
  await cleanup();
});

Deno.test("resolveFormat: handler returns null → falls through to null", { ...OPTS, ...SLOW }, async () => {
  await seed();
  registerFormatHandler("CONFORMAT", () => null);
  const { u, target } = await makeContext();
  const out = await resolveFormat(u, target, "CONFORMAT", "x");
  assertEquals(out, null);
  _clearFormatHandlers();
  await cleanup();
});

Deno.test("resolveFormat: no attr, no handler → null", { ...OPTS, ...SLOW }, async () => {
  await seed();
  const { u, target } = await makeContext();
  const out = await resolveFormat(u, target, "EXITFORMAT", "x");
  assertEquals(out, null);
  await cleanup();
});

Deno.test("resolveFormat: softcode throw falls through to plugin handler", { ...OPTS, ...SLOW }, async () => {
  await seed({ NAMEFORMAT: "<<%0>>" });
  const { u, target } = await makeContext();
  // Force softcode path to throw — attr.get throws.
  u.attr.get = () => { throw new Error("boom"); };
  registerFormatHandler("NAMEFORMAT", (_u, _t, arg) => `HANDLER[${arg}]`);
  const out = await resolveFormat(u, target, "NAMEFORMAT", "Widget");
  assertEquals(out, "HANDLER[Widget]");
  _clearFormatHandlers();
  await cleanup();
});

Deno.test("resolveFormat: first non-null handler wins; later handlers don't run", { ...OPTS, ...SLOW }, async () => {
  await seed();
  let secondCalls = 0;
  registerFormatHandler("CONFORMAT", () => "first");
  registerFormatHandler("CONFORMAT", () => { secondCalls++; return "second"; });
  const { u, target } = await makeContext();
  const out = await resolveFormat(u, target, "CONFORMAT", "x");
  assertEquals(out, "first");
  assertEquals(secondCalls, 0);
  _clearFormatHandlers();
  await cleanup();
});

Deno.test("resolveFormatOr: returns fallback when resolver yields null", { ...OPTS, ...SLOW }, async () => {
  await seed();
  const { u, target } = await makeContext();
  const out = await resolveFormatOr(u, target, "EXITFORMAT", "x", "FALLBACK");
  assertEquals(out, "FALLBACK");
  await cleanup();
  await DBO.close();
});
