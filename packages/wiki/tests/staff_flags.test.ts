/**
 * Client staff-flag helper (mirrors admin/app.js).
 */
import { assertEquals } from "@std/assert";

const STAFF = new Set(["admin", "wizard", "superuser"]);

function isStaffFlags(flags: string[] | string | undefined): boolean {
  if (!flags) return false;
  const list = Array.isArray(flags)
    ? flags
    : String(flags).split(/[\s,]+/).filter(Boolean);
  return list.some((f) => STAFF.has(String(f).toLowerCase()));
}

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("isStaffFlags — empty / player denied", OPTS, () => {
  assertEquals(isStaffFlags(undefined), false);
  assertEquals(isStaffFlags([]), false);
  assertEquals(isStaffFlags(["player", "connected"]), false);
  assertEquals(isStaffFlags("player connected"), false);
});

Deno.test("isStaffFlags — admin wizard superuser", OPTS, () => {
  assertEquals(isStaffFlags(["admin"]), true);
  assertEquals(isStaffFlags(["wizard", "player"]), true);
  assertEquals(isStaffFlags(["superuser"]), true);
  assertEquals(isStaffFlags("player admin"), true);
  assertEquals(isStaffFlags(["ADMIN"]), true);
});
