/**
 * tests/scripts_attrs.test.ts
 *
 * Sandbox-driven tests for engine-owned attribute scripts:
 *   - system/scripts/inventory.ts (i/inv)
 *
 * NOTE: @set, &ATTR, and @examine were moved to builder-plugin.
 * Tests for those commands live in the builder-plugin repo.
 */
import { assertStringIncludes } from "@std/assert";
import { sandboxService } from "../src/services/Sandbox/SandboxService.ts";
import { dbojs, DBO } from "../src/services/Database/database.ts";
import { SDKContext } from "../src/services/Sandbox/SDKService.ts";

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
    "u.ui = { ...u.ui, layout: () => {}, panel: (o) => o };",
    "await _main(u);",
    "return _sent;",
  ].join("\n");
}

const SLOW = { timeout: 10000 };
const OPTS = { sanitizeResources: false, sanitizeOps: false };

const ROOM_ID  = "sa_room1";
const ACTOR_ID = "sa_actor1";

async function cleanup(...ids: string[]) {
  for (const id of ids) await dbojs.delete({ id }).catch(() => {});
}

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

  const ctx: SDKContext = {
    id: actor.id,
    state: {},
    me: { id: actor.id, name: "Player", flags: new Set(["player", "connected"]), state: { name: "Player" }, location: ROOM_ID },
    here: { id: ROOM_ID, name: "TestRoom", flags: new Set(["room"]), state: {} },
    cmd: { name: "inventory", original: "i", args: [], switches: [] },
    socketId: "sock-inv",
  };
  const result = await sandboxService.runScript(wrapScript(RAW_INVENTORY), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "not carrying anything");
  await cleanup(ACTOR_ID);
});

Deno.test("inventory — with items lists each item name", OPTS, async () => {
  const _actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player connected",
    data: { name: "Player" },
    location: ROOM_ID,
  });

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
