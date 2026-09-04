import { assertEquals, assert } from "@std/assert";
import {
  descCue,
  failGetMsg,
  interactKind,
  isNoGet,
  useAction,
} from "../src/world/interact.ts";
import type { IDBObj } from "@ursamu/mush";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function thing(
  name: string,
  dnd: Record<string, unknown>,
  flags: string[] = ["thing"],
): IDBObj {
  return {
    id: "1",
    name,
    flags: new Set(flags),
    location: "r",
    contents: [],
    state: { name, dnd },
  } as unknown as IDBObj;
}

Deno.test("chest cue is subtle open, action is open verb", OPTS, () => {
  const c = thing("Iron Chest", { type: "chest", opened: false });
  assertEquals(interactKind(c), "chest");
  assert(isNoGet(c));
  assert(descCue(c).includes("%chopen%cn"));
  assert(!descCue(c).includes(">>"));
  assert(!descCue(c).includes("+chest"));
  assertEquals(useAction(c)?.cmd, "open #1");
  assert(failGetMsg(c).toLowerCase().includes("open"));
});

Deno.test("altar / campfire use verb", OPTS, () => {
  const a = thing("Stone Altar", { type: "altar" });
  assert(descCue(a).includes("%chtouch%cn"));
  assertEquals(useAction(a)?.cmd, "use #1");
  const f = thing("Campfire", { type: "campfire" });
  assert(descCue(f).includes("%chuse%cn"));
});

Deno.test("no >> in cues", OPTS, () => {
  for (const t of ["chest", "altar", "corpse", "player_corpse"]) {
    const o = thing("X", { type: t });
    assert(!descCue(o).includes(">>"));
  }
});

Deno.test("normal loot is gettable", OPTS, () => {
  const s = thing("Longsword", { type: "weapon" });
  assertEquals(isNoGet(s), false);
  assertEquals(descCue(s), "");
});
