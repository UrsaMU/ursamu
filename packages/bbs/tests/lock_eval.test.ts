/**
 * Pure board lock evaluation (flag/perm/&&/||/!).
 */
import { assertEquals } from "@std/assert";
import {
  evalBoardLock,
  flagsPassLevel,
} from "../src/lock-eval.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("flagsPassLevel — exact and ladder", OPTS, () => {
  const admin = new Set(["player", "admin"]);
  assertEquals(flagsPassLevel(admin, "admin"), true);
  assertEquals(flagsPassLevel(admin, "wizard"), false);
  assertEquals(flagsPassLevel(admin, "builder+"), true);
  assertEquals(flagsPassLevel(admin, "admin+"), true);
  assertEquals(flagsPassLevel(admin, "wizard+"), false);
});

Deno.test("evalBoardLock — open", OPTS, () => {
  assertEquals(evalBoardLock("", new Set()), true);
  assertEquals(evalBoardLock("all()", new Set()), true);
});

Deno.test("evalBoardLock — flag()", OPTS, () => {
  const f = new Set(["player", "builder"]);
  assertEquals(evalBoardLock("flag(builder)", f), true);
  assertEquals(evalBoardLock("flag(admin)", f), false);
});

Deno.test("evalBoardLock — perm()", OPTS, () => {
  const f = new Set(["player", "admin"]);
  assertEquals(evalBoardLock("perm(builder)", f), true);
  assertEquals(evalBoardLock("perm(admin)", f), true);
  assertEquals(evalBoardLock("perm(wizard)", f), false);
});

Deno.test("evalBoardLock — and/or/not", OPTS, () => {
  const f = new Set(["player", "builder"]);
  assertEquals(
    evalBoardLock("flag(builder) && !flag(guest)", f),
    true,
  );
  assertEquals(
    evalBoardLock("flag(admin) || flag(builder)", f),
    true,
  );
  assertEquals(
    evalBoardLock("flag(admin) && flag(builder)", f),
    false,
  );
  assertEquals(evalBoardLock("!flag(builder)", f), false);
});

Deno.test("evalBoardLock — legacy bare ladder", OPTS, () => {
  const f = new Set(["player", "wizard"]);
  assertEquals(evalBoardLock("admin+", f), true);
  assertEquals(evalBoardLock("wizard", f), true);
  assertEquals(evalBoardLock("superuser", f), false);
});

Deno.test("evalBoardLock — fail closed", OPTS, () => {
  assertEquals(
    evalBoardLock("attr(approved,1)", new Set(["player"])),
    false,
  );
  assertEquals(evalBoardLock("(((broken", new Set()), false);
});
