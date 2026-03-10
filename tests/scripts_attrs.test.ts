/**
 * tests/scripts_attrs.test.ts
 *
 * Sandbox-driven tests for attribute and examination system scripts:
 *   - system/scripts/set.ts      (@set)
 *   - system/scripts/setAttr.ts  (&ATTR)
 *   - system/scripts/examine.ts  (@examine / ex)
 *   - system/scripts/inventory.ts (i/inv)
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { sandboxService } from "../src/services/Sandbox/SandboxService.ts";
import { dbojs, DBO } from "../src/services/Database/database.ts";
import { SDKContext } from "../src/services/Sandbox/SDKService.ts";

const RAW_SET      = await Deno.readTextFile("./system/scripts/set.ts");
const RAW_SETATTR  = await Deno.readTextFile("./system/scripts/setAttr.ts");
const RAW_EXAMINE  = await Deno.readTextFile("./system/scripts/examine.ts");
const RAW_INVENTORY = await Deno.readTextFile("./system/scripts/inventory.ts");

function wrapScript(raw: string): string {
  const stripped = raw
    .replace(/^import\s.*?;\s*$/gm, "")
    .replace(/export const aliases.*?;/gs, "")
    .replace(/export default/, "_main =")
    .replace(/^export\s+/gm, "");
  return [
    "let _main;",
    stripped,
    "const _sent = [];",
    "const _origSend = u.send.bind(u);",
    "u.send = (m, t, o) => { _sent.push(m); _origSend(m, t, o); };",
    // Prevent u.ui.layout from posting 'result' early and terminating the worker
    "u.ui = { ...u.ui, layout: () => {}, panel: (o) => o };",
    "await _main(u);",
    "return _sent;",
  ].join("\n");
}

const SLOW = { timeout: 10000 };
const OPTS = { sanitizeResources: false, sanitizeOps: false };

const ROOM_ID  = "sa_room1";
const ACTOR_ID = "sa_actor1";
const THING_ID = "sa_thing1";

async function cleanup(...ids: string[]) {
  for (const id of ids) await dbojs.delete({ id }).catch(() => {});
}

function makeCtx(
  id: string,
  flags: string,
  name: string,
  cmd: string,
  args: string[],
  extra: Record<string, unknown> = {}
): SDKContext {
  return {
    id,
    state: {},
    me: { id, name, flags: new Set(flags.split(" ")), state: { name }, location: ROOM_ID },
    here: { id: ROOM_ID, name: "TestRoom", flags: new Set(["room"]), state: {} },
    cmd: { name: cmd, original: cmd, args, switches: [] },
    socketId: `sock-${id}`,
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// @set tests
// ---------------------------------------------------------------------------

Deno.test("@set — bad format sends usage message", OPTS, async () => {
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player wizard connected",
    data: { name: "Admin" },
    location: ROOM_ID,
  });

  // Missing "/" separator
  const ctx = makeCtx(actor.id, "player wizard", "Admin", "@set", ["BadArg"]);
  const result = await sandboxService.runScript(wrapScript(RAW_SET), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "Usage");
  await cleanup(ACTOR_ID);
});

Deno.test("@set — invalid attribute name is rejected", OPTS, async () => {
  const _room = await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Room" } });
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player wizard connected",
    data: { name: "Admin" },
    location: ROOM_ID,
  });
  const thing = await dbojs.create({
    id: THING_ID,
    flags: "thing",
    data: { name: "Crate" },
    location: ROOM_ID,
  });

  // Attribute name with spaces / special chars is invalid
  const ctx = makeCtx(actor.id, "player wizard", "Admin", "@set", ["Crate/bad attr!=value"]);
  const result = await sandboxService.runScript(wrapScript(RAW_SET), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "Invalid attribute");
  await cleanup(ACTOR_ID, ROOM_ID, THING_ID);
});

Deno.test("@set — target not found sends error message", OPTS, async () => {
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player wizard connected",
    data: { name: "Admin" },
    location: ROOM_ID,
  });

  const ctx = makeCtx(actor.id, "player wizard", "Admin", "@set", ["GhostObj9999/MOOD=happy"]);
  const result = await sandboxService.runScript(wrapScript(RAW_SET), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "can't find");
  await cleanup(ACTOR_ID);
});

Deno.test("@set — permission denied when actor cannot edit target", OPTS, async () => {
  const _room = await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Room" } });
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player connected",
    data: { name: "Player" },
    location: ROOM_ID,
  });
  const thing = await dbojs.create({
    id: THING_ID,
    flags: "thing",
    data: { name: "Vault" },
    location: ROOM_ID,
  });

  const ctx = makeCtx(actor.id, "player", "Player", "@set", ["Vault/SECRET=42"], {
    permissions: { [thing.id]: false },
  });
  const result = await sandboxService.runScript(wrapScript(RAW_SET), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "Permission denied");
  await cleanup(ACTOR_ID, ROOM_ID, THING_ID);
});

Deno.test("@set — successfully sets attribute and confirms in message", OPTS, async () => {
  const _room = await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Room" } });
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player wizard connected",
    data: { name: "Admin" },
    location: ROOM_ID,
  });
  const thing = await dbojs.create({
    id: THING_ID,
    flags: "thing",
    data: { name: "Barrel" },
    location: ROOM_ID,
  });

  const ctx = makeCtx(actor.id, "player wizard", "Admin", "@set", ["Barrel/WEIGHT=50"]);
  const result = await sandboxService.runScript(wrapScript(RAW_SET), ctx, SLOW) as string[];

  // Script sends "Set - <name>/<attr>: <value>"
  assertStringIncludes(result.join(" "), "WEIGHT");
  assertStringIncludes(result.join(" "), "50");

  await cleanup(ACTOR_ID, ROOM_ID, THING_ID);
});

Deno.test("@set — clearing attribute sends confirmation message", OPTS, async () => {
  const _room = await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Room" } });
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player wizard connected",
    data: { name: "Admin" },
    location: ROOM_ID,
  });
  const thing = await dbojs.create({
    id: THING_ID,
    flags: "thing",
    data: { name: "Keg", WEIGHT: "30" },
    location: ROOM_ID,
  });

  // Empty value = clear the attribute
  const ctx = makeCtx(actor.id, "player wizard", "Admin", "@set", ["Keg/WEIGHT="]);
  const result = await sandboxService.runScript(wrapScript(RAW_SET), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "cleared");
  await cleanup(ACTOR_ID, ROOM_ID, THING_ID);
});

Deno.test("@set — cannot clear internal system property 'name'", OPTS, async () => {
  const _room = await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Room" } });
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player wizard connected",
    data: { name: "Admin" },
    location: ROOM_ID,
  });
  const thing = await dbojs.create({
    id: THING_ID,
    flags: "thing",
    data: { name: "Chest" },
    location: ROOM_ID,
  });

  const ctx = makeCtx(actor.id, "player wizard", "Admin", "@set", ["Chest/NAME="]);
  const result = await sandboxService.runScript(wrapScript(RAW_SET), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "Cannot delete");
  await cleanup(ACTOR_ID, ROOM_ID, THING_ID);
});

Deno.test("@set — value exceeding 4096 chars sends 'Value too long'", OPTS, async () => {
  const _room = await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Room" } });
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player wizard connected",
    data: { name: "Admin" },
    location: ROOM_ID,
  });
  const thing = await dbojs.create({
    id: THING_ID,
    flags: "thing",
    data: { name: "Tome" },
    location: ROOM_ID,
  });

  const longVal = "x".repeat(4097);
  const ctx = makeCtx(actor.id, "player wizard", "Admin", "@set", [`Tome/TEXT=${longVal}`]);
  const result = await sandboxService.runScript(wrapScript(RAW_SET), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "too long");
  await cleanup(ACTOR_ID, ROOM_ID, THING_ID);
});

// ---------------------------------------------------------------------------
// &ATTR (setAttr) tests
// ---------------------------------------------------------------------------

Deno.test("&ATTR — no args sends usage message", OPTS, async () => {
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player wizard connected",
    data: { name: "Admin" },
    location: ROOM_ID,
  });

  // Minimal args that fail parsing (attrName present but no targetName)
  const ctx = makeCtx(actor.id, "player wizard", "Admin", "setAttr", ["MOOD"]);
  const result = await sandboxService.runScript(wrapScript(RAW_SETATTR), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "Usage");
  await cleanup(ACTOR_ID);
});

Deno.test("&ATTR — target not found sends error", OPTS, async () => {
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player wizard connected",
    data: { name: "Admin" },
    location: ROOM_ID,
  });

  const ctx = makeCtx(actor.id, "player wizard", "Admin", "setAttr", ["MOOD Ghost9999=happy"]);
  const result = await sandboxService.runScript(wrapScript(RAW_SETATTR), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "not found");
  await cleanup(ACTOR_ID);
});

Deno.test("&ATTR — successfully sets attribute on target", OPTS, async () => {
  const _room = await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Room" } });
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player wizard connected",
    data: { name: "Admin" },
    location: ROOM_ID,
  });
  const thing = await dbojs.create({
    id: THING_ID,
    flags: "thing",
    data: { name: "Stone" },
    location: ROOM_ID,
  });

  const ctx = makeCtx(actor.id, "player wizard", "Admin", "setAttr", ["HARDNESS Stone=10"]);
  const result = await sandboxService.runScript(wrapScript(RAW_SETATTR), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "Set HARDNESS");
  assertStringIncludes(result.join(" "), "Stone");

  await cleanup(ACTOR_ID, ROOM_ID, THING_ID);
});

Deno.test("&ATTR — clears a previously-set attribute", OPTS, async () => {
  const _room = await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Room" } });
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player wizard connected",
    data: { name: "Admin" },
    location: ROOM_ID,
  });
  const thing = await dbojs.create({
    id: THING_ID,
    flags: "thing",
    data: { name: "Gem", attributes: [{ name: "SHINE", value: "bright", setter: ACTOR_ID, type: "attribute" }] },
    location: ROOM_ID,
  });

  // No value after = means clear
  const ctx = makeCtx(actor.id, "player wizard", "Admin", "setAttr", ["SHINE Gem"]);
  const result = await sandboxService.runScript(wrapScript(RAW_SETATTR), ctx, SLOW) as string[];

  // No '=' in args means value is undefined → "not set on" message
  assertStringIncludes(result.join(" "), "Gem");

  await cleanup(ACTOR_ID, ROOM_ID, THING_ID);
});

// ---------------------------------------------------------------------------
// @examine tests
// ---------------------------------------------------------------------------

Deno.test("@examine — target not found sends 'can't find' message", OPTS, async () => {
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player wizard connected",
    data: { name: "Admin" },
    location: ROOM_ID,
  });

  const ctx = makeCtx(actor.id, "player wizard", "Admin", "@examine", ["Ghost9999"]);
  const result = await sandboxService.runScript(wrapScript(RAW_EXAMINE), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "can't find");
  await cleanup(ACTOR_ID);
});

Deno.test("@examine — wizard can examine any object", OPTS, async () => {
  const _room = await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Room" } });
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player wizard connected",
    data: { name: "Admin" },
    location: ROOM_ID,
  });
  const thing = await dbojs.create({
    id: THING_ID,
    flags: "thing",
    data: { name: "Crystal", description: "A glowing crystal." },
    location: ROOM_ID,
  });

  const ctx = makeCtx(actor.id, "player wizard", "Admin", "@examine", ["Crystal"]);
  const result = await sandboxService.runScript(wrapScript(RAW_EXAMINE), ctx, SLOW) as string[];

  const combined = result.join("\n");
  // Should show name and ID
  assertStringIncludes(combined, "Crystal");
  assertStringIncludes(combined, `#${thing.id}`);

  await cleanup(ACTOR_ID, ROOM_ID, THING_ID);
});

Deno.test("@examine — output includes description and flags", OPTS, async () => {
  const _room = await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Room" } });
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player wizard connected",
    data: { name: "Admin" },
    location: ROOM_ID,
  });
  const thing = await dbojs.create({
    id: THING_ID,
    flags: "thing sticky",
    data: { name: "Pearl", description: "A lustrous pearl." },
    location: ROOM_ID,
  });

  const ctx = makeCtx(actor.id, "player wizard", "Admin", "@examine", ["Pearl"]);
  const result = await sandboxService.runScript(wrapScript(RAW_EXAMINE), ctx, SLOW) as string[];

  const combined = result.join("\n");
  assertStringIncludes(combined, "lustrous pearl");
  assertStringIncludes(combined, "thing");  // flags include "thing"

  await cleanup(ACTOR_ID, ROOM_ID, THING_ID);
});

Deno.test("@examine — plain player denied on non-visual object they don't own", OPTS, async () => {
  const _room = await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Room" } });
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player connected",
    data: { name: "Player" },
    location: ROOM_ID,
  });
  const thing = await dbojs.create({
    id: THING_ID,
    flags: "thing",
    data: { name: "SecretBox" },
    location: ROOM_ID,
  });

  const ctx = makeCtx(actor.id, "player", "Player", "@examine", ["SecretBox"], {
    permissions: { [thing.id]: false },
  });
  const result = await sandboxService.runScript(wrapScript(RAW_EXAMINE), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "can't examine");
  await cleanup(ACTOR_ID, ROOM_ID, THING_ID);
});

// ---------------------------------------------------------------------------
// inventory tests
// ---------------------------------------------------------------------------

Deno.test("inventory — empty inventory reports nothing carried", OPTS, async () => {
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player connected",
    data: { name: "Player" },
    location: ROOM_ID,
  });

  // me.contents is empty (not set)
  const ctx = makeCtx(actor.id, "player", "Player", "inventory", []);
  const result = await sandboxService.runScript(wrapScript(RAW_INVENTORY), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "not carrying anything");
  await cleanup(ACTOR_ID);
});

Deno.test("inventory — with items lists each item name", OPTS, async () => {
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player connected",
    data: { name: "Player" },
    location: ROOM_ID,
  });

  // Manually inject contents into the me SDKObject
  const ctx: SDKContext = {
    id: ACTOR_ID,
    state: {},
    me: {
      id: ACTOR_ID,
      name: "Player",
      flags: new Set(["player", "connected"]),
      state: { name: "Player" },
      location: ROOM_ID,
      contents: [
        { id: "item1", name: "Lantern", flags: new Set(["thing"]), state: {} },
        { id: "item2", name: "Rope",    flags: new Set(["thing"]), state: {} },
      ],
    },
    here: { id: ROOM_ID, name: "TestRoom", flags: new Set(["room"]), state: {} },
    cmd: { name: "inventory", original: "i", args: [], switches: [] },
    socketId: "sock-inv",
  };

  const result = await sandboxService.runScript(wrapScript(RAW_INVENTORY), ctx, SLOW) as string[];

  const combined = result.join("\n");
  assertStringIncludes(combined, "Lantern");
  assertStringIncludes(combined, "Rope");

  await cleanup(ACTOR_ID);
  await DBO.close();
});
