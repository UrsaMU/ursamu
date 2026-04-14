/**
 * tests/scripts_attrs.test.ts
 *
 * Tests for engine-owned attribute scripts:
 *   - inventory (i/inv)
 *
 * NOTE: @set, &ATTR, and @examine were moved to builder-plugin.
 * Tests for those commands live in the builder-plugin repo.
 */
import { assertStringIncludes } from "@std/assert";
import type { IDBObj, IUrsamuSDK } from "../src/@types/UrsamuSDK.ts";
import { execInventory } from "../src/commands/home.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const ROOM_ID  = "sa_room1";
const ACTOR_ID = "sa_actor1";

function makeU(contents: IDBObj[] = []): { u: IUrsamuSDK; sent: string[] } {
  const sent: string[] = [];
  const me: IDBObj = {
    id: ACTOR_ID,
    name: "Player",
    flags: new Set(["player", "connected"]),
    state: { name: "Player" },
    location: ROOM_ID,
    contents,
  };
  const u = {
    me,
    here: { id: ROOM_ID, name: "TestRoom", flags: new Set(["room"]), state: {}, location: "", contents: [] },
    cmd: { name: "inventory", original: "i", args: [], switches: [] },
    send: (m: string) => sent.push(m),
    util: {
      displayName: (o: IDBObj) => (o.state?.name as string) || o.name || "Unknown",
    },
  } as unknown as IUrsamuSDK;
  return { u, sent };
}

// ---------------------------------------------------------------------------
// inventory tests
// ---------------------------------------------------------------------------

Deno.test("inventory — empty inventory reports nothing carried", OPTS, () => {
  const { u, sent } = makeU([]);
  execInventory(u);
  assertStringIncludes(sent.join(" "), "not carrying anything");
});

Deno.test("inventory — with items lists each item name", OPTS, () => {
  const items: IDBObj[] = [
    { id: "item1", name: "Lantern", flags: new Set(["thing"]), state: {}, contents: [] },
    { id: "item2", name: "Rope",    flags: new Set(["thing"]), state: {}, contents: [] },
  ];
  const { u, sent } = makeU(items);
  execInventory(u);
  const combined = sent.join("\n");
  assertStringIncludes(combined, "Lantern");
  assertStringIncludes(combined, "Rope");
});
