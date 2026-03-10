/**
 * tests/utils_db.test.ts
 *
 * Tests for flag-based utilities:
 *   - checkFlags   (src/utils/checkFlags.ts)
 *   - isAdmin      (src/utils/isAdmin.ts)
 *   - canEdit      (src/utils/canEdit.ts)
 *   - displayName  (src/utils/displayName.ts)
 *
 * NOTE: sanitizeOps/sanitizeResources are disabled because importing the
 * service layer triggers an async CmdParser file-read at module init time.
 */
import { assertEquals } from "@std/assert";
import { checkFlags } from "../src/utils/checkFlags.ts";
import { isAdmin } from "../src/utils/isAdmin.ts";
import { canEdit } from "../src/utils/canEdit.ts";
import { displayName } from "../src/utils/displayName.ts";
import type { IDBOBJ } from "../src/@types/IDBObj.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function mkObj(id: string, flags: string, data: Record<string, unknown> = {}): IDBOBJ {
  return { id, flags, data };
}

// ---------------------------------------------------------------------------
// checkFlags
// ---------------------------------------------------------------------------

Deno.test("checkFlags — single flag present returns true", OPTS, () => {
  const obj = mkObj("1", "player connected");
  assertEquals(checkFlags(obj, "player"), true);
});

Deno.test("checkFlags — flag not present returns false", OPTS, () => {
  const obj = mkObj("1", "player");
  assertEquals(checkFlags(obj, "wizard"), false);
});

Deno.test("checkFlags — multiple flags, all present", OPTS, () => {
  const obj = mkObj("1", "player connected wizard");
  assertEquals(checkFlags(obj, "player wizard"), true);
});

Deno.test("checkFlags — multiple flags, one missing returns false", OPTS, () => {
  const obj = mkObj("1", "player connected");
  assertEquals(checkFlags(obj, "player wizard"), false);
});

Deno.test("checkFlags — empty check string is always true (Tags library behavior)", OPTS, () => {
  const obj = mkObj("1", "player");
  assertEquals(checkFlags(obj, ""), true);
});

// ---------------------------------------------------------------------------
// isAdmin
// ---------------------------------------------------------------------------

Deno.test("isAdmin — storyteller (lvl 8) qualifies", OPTS, () => {
  assertEquals(isAdmin(mkObj("1", "player storyteller")), true);
});

Deno.test("isAdmin — admin (lvl 9) qualifies", OPTS, () => {
  assertEquals(isAdmin(mkObj("1", "player admin")), true);
});

Deno.test("isAdmin — superuser (lvl 10) qualifies", OPTS, () => {
  assertEquals(isAdmin(mkObj("1", "player superuser")), true);
});

Deno.test("isAdmin — plain player does not qualify", OPTS, () => {
  assertEquals(isAdmin(mkObj("1", "player")), false);
});

Deno.test("isAdmin — builder (lvl 7) does not qualify", OPTS, () => {
  assertEquals(isAdmin(mkObj("1", "player builder")), false);
});

Deno.test("isAdmin — 'wizard' (lvl 9) qualifies", OPTS, () => {
  assertEquals(isAdmin(mkObj("1", "player wizard")), true);
});

// ---------------------------------------------------------------------------
// canEdit
// ---------------------------------------------------------------------------

Deno.test("canEdit — superuser can edit anything", OPTS, async () => {
  assertEquals(await canEdit(mkObj("su1", "player superuser"), mkObj("obj1", "player")), true);
});

Deno.test("canEdit — actor can always edit themselves", OPTS, async () => {
  assertEquals(await canEdit(mkObj("self1", "player"), mkObj("self1", "player")), true);
});

Deno.test("canEdit — admin (lvl 9) can edit plain player (lvl 1)", OPTS, async () => {
  assertEquals(await canEdit(mkObj("a1", "player admin"), mkObj("p1", "player")), true);
});

Deno.test("canEdit — same-level actors: enactor cannot edit", OPTS, async () => {
  assertEquals(await canEdit(mkObj("p1", "player"), mkObj("p2", "player")), false);
});

Deno.test("canEdit — lower-level cannot edit higher-level", OPTS, async () => {
  assertEquals(await canEdit(mkObj("p1", "player"), mkObj("a1", "player admin")), false);
});

// ---------------------------------------------------------------------------
// displayName
// ---------------------------------------------------------------------------

Deno.test("displayName — actor viewing themselves gets dbref form", OPTS, () => {
  const actor = mkObj("p1", "player", { name: "Alice" });
  const name = displayName(actor, actor);
  assertEquals(name.includes("(#p1"), true);
  assertEquals(name.includes("Alice"), true);
});

Deno.test("displayName — superuser actor sees target dbref form", OPTS, () => {
  const actor = mkObj("su1", "player superuser", { name: "God" });
  const tar   = mkObj("obj1", "thing", { name: "Pebble" });
  assertEquals(displayName(actor, tar).includes("(#obj1"), true);
});

Deno.test("displayName — plain player sees only target name (no dbref)", OPTS, () => {
  const actor = mkObj("p1", "player", { name: "Bob" });
  const tar   = mkObj("obj1", "thing", { name: "Rock" });
  const name = displayName(actor, tar);
  assertEquals(name.includes("(#"), false);
  assertEquals(name, "Rock");
});

Deno.test("displayName — actor who owns target sees dbref form", OPTS, () => {
  const actor = mkObj("p1", "player", { name: "Builder" });
  const tar   = mkObj("obj2", "thing", { name: "Box", owner: "p1" });
  assertEquals(displayName(actor, tar).includes("(#obj2"), true);
});

Deno.test("displayName — moniker is used instead of name when set", OPTS, () => {
  const actor = mkObj("p1", "player", { name: "Bob" });
  const tar   = mkObj("p2", "player", { name: "Alice", moniker: "Alicia" });
  assertEquals(displayName(actor, tar), "Alicia");
});

Deno.test("displayName — controls param true forces dbref form", OPTS, () => {
  const actor = mkObj("p1", "player", { name: "Bob" });
  const tar   = mkObj("obj3", "thing", { name: "Widget" });
  assertEquals(displayName(actor, tar, true).includes("(#obj3"), true);
});
