/**
 * Integration test: format attributes evaluated through the REAL TinyMUX
 * softcode engine (softcodeService.runSoftcode), not the JS sandbox.
 *
 * %0 is the default rendered string passed in by execLook.
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { dbojs, DBO } from "../src/services/Database/database.ts";
import { createNativeSDK } from "../src/services/SDK/index.ts";
import { execLook } from "../src/commands/look.ts";
import { hydrate } from "../src/utils/evaluateLock.ts";
import { _clearFormatHandlers } from "../src/utils/formatHandlers.ts";
import type { IDBObj } from "../src/@types/UrsamuSDK.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };
const SLOW = { timeout: 15000 };

// Numeric ids so softcode #N dbref resolution (name(%i0), etc.) works.
const ROOM = "900001";
const ACTOR = "900002";
const NPC = "900003";
const THING = "900004";
const EXIT = "900005";

async function cleanup() {
  for (const id of [ROOM, ACTOR, NPC, THING, EXIT]) {
    await dbojs.delete({ id }).catch(() => {});
  }
}

async function seed(opts: { attrs?: Record<string, string>; withContents?: boolean; withExit?: boolean } = {}) {
  await cleanup();
  _clearFormatHandlers();
  const attributes = Object.entries(opts.attrs ?? {}).map(([name, value]) => ({
    name, value, setter: ACTOR, type: "attribute",
  }));
  await dbojs.create({
    id: ROOM,
    flags: "room",
    data: { name: "LFI Room", description: "A test room.", attributes },
  });
  await dbojs.create({
    id: ACTOR,
    flags: "player connected wizard",
    data: { name: "Alice" },
    location: ROOM,
  });
  if (opts.withContents) {
    await dbojs.create({
      id: NPC,
      flags: "player connected",
      data: { name: "Bob" },
      location: ROOM,
    });
    await dbojs.create({
      id: THING,
      flags: "thing",
      data: { name: "ball" },
      location: ROOM,
    });
  }
  if (opts.withExit) {
    await dbojs.create({
      id: EXIT,
      flags: "exit",
      data: { name: "North;n" },
      location: ROOM,
    });
  }
}

async function runLook(): Promise<string> {
  const u = await createNativeSDK("lfi-sock", ACTOR, { name: "look", original: "look", args: [""], switches: [] });
  const roomChildren = await dbojs.find({ location: ROOM });
  (u.here as unknown as { contents: IDBObj[] }).contents = roomChildren
    .filter((c) => c.id !== ACTOR)
    .map((c) => hydrate(c));
  const sent: string[] = [];
  u.send = (m: string) => { sent.push(m); };
  (u.here as unknown as { broadcast: (m: string) => void }).broadcast = () => {};
  await execLook(u);
  return sent.join("\n");
}

Deno.test("softcode: no attrs — default rendering", { ...OPTS, ...SLOW }, async () => {
  await seed();
  const out = await runLook();
  assertStringIncludes(out, "LFI Room");
  assertStringIncludes(out, "A test room.");
  await cleanup();
});

Deno.test("softcode: @nameformat with %0 wraps the default name", { ...OPTS, ...SLOW }, async () => {
  await seed({ attrs: { NAMEFORMAT: "<<%0>>" } });
  const out = await runLook();
  assertStringIncludes(out, "<<LFI Room(#" + ROOM + ")>>");
  assertEquals(out.includes("%chLFI Room"), false);
  await cleanup();
});

Deno.test("softcode: @descformat with %0 wraps the description", { ...OPTS, ...SLOW }, async () => {
  await seed({ attrs: { DESCFORMAT: ">> %0 <<" } });
  const out = await runLook();
  assertStringIncludes(out, ">> A test room. <<");
  await cleanup();
});

Deno.test("softcode: @conformat — %0 carries id list, iter() resolves names", { ...OPTS, ...SLOW }, async () => {
  // iter(%0, name(%i0)) — for each id in %0, look up its name. TinyMUX idiom.
  await seed({
    withContents: true,
    attrs: { CONFORMAT: "Here: [iter(%0,name(%i0))]" },
  });
  const out = await runLook();
  // Both content names should appear in the resolved listing
  assertStringIncludes(out, "Here:");
  assertStringIncludes(out, "Bob");
  assertStringIncludes(out, "ball");
  assertEquals(out.includes("%chCharacters:%cn"), false);
  await cleanup();
});

Deno.test("softcode: @exitformat — iter() over exit ids", { ...OPTS, ...SLOW }, async () => {
  await seed({
    withExit: true,
    attrs: { EXITFORMAT: "Exits: [iter(%0,name(%i0))]" },
  });
  const out = await runLook();
  assertStringIncludes(out, "Exits:");
  assertStringIncludes(out, "North");
  assertEquals(out.includes("%chExits:%cn"), false);
  await cleanup();
});

Deno.test("softcode: priority — @nameformat attr wins over plugin handler", { ...OPTS, ...SLOW }, async () => {
  const { registerFormatHandler, unregisterFormatHandler } = await import(
    "../src/utils/formatHandlers.ts"
  );
  await seed({ attrs: { NAMEFORMAT: "ATTR:%0" } });
  const handler = () => "HANDLER";
  registerFormatHandler("NAMEFORMAT", handler);
  try {
    const out = await runLook();
    assertStringIncludes(out, "ATTR:LFI Room");
    assertEquals(out.includes("HANDLER"), false);
  } finally {
    unregisterFormatHandler("NAMEFORMAT", handler);
    await cleanup();
  }
});

Deno.test("softcode: priority — plugin handler runs when no attr set", { ...OPTS, ...SLOW }, async () => {
  const { registerFormatHandler, unregisterFormatHandler } = await import(
    "../src/utils/formatHandlers.ts"
  );
  await seed();
  const handler = (_u: unknown, _t: unknown, arg: string) => `PLUGIN[${arg}]`;
  registerFormatHandler("DESCFORMAT", handler);
  try {
    const out = await runLook();
    assertStringIncludes(out, "PLUGIN[A test room.]");
  } finally {
    unregisterFormatHandler("DESCFORMAT", handler);
    await cleanup();
  }
});

Deno.test("softcode: priority — built-in default when no attr, no handler", { ...OPTS, ...SLOW }, async () => {
  await seed();
  const out = await runLook();
  assertStringIncludes(out, "%chLFI Room(#" + ROOM + ")%cn");
  await cleanup();
  await DBO.close();
});
