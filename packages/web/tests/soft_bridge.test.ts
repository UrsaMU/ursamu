import { assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  hasStaffConsole,
  softRegisterStaffPage,
  softUnregisterStaffPage,
} from "../src/soft-bridge.ts";
import { clearStaffPages, listStaffPages } from "../src/staff-pages.ts";
import { clearStaffNav, listStaffNav } from "../src/staff-nav.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("softRegisterStaffPage registers nav", OPTS, async () => {
  clearStaffPages();
  clearStaffNav();
  assertEquals(await hasStaffConsole(), true);
  const ok = await softRegisterStaffPage({
    id: "soft-test",
    label: "Soft",
    route: "soft-test",
    order: 99,
  });
  assertEquals(ok, true);
  assertEquals(listStaffPages().some((p) => p.id === "soft-test"), true);
  assertEquals(listStaffNav().some((n) => n.id === "soft-test"), true);
  await softUnregisterStaffPage("soft-test");
  assertEquals(listStaffNav().length, 0);
  clearStaffPages();
  clearStaffNav();
});
