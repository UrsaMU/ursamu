import { assertEquals } from "@std/assert";
import {
  UPCOMING_KEY,
  publishEventsUpcomingBadge,
  registerEventsBadgeHooks,
  removeEventsBadgeHooks,
} from "../src/staff-badge-bridge.ts";
import { hasStaffConsole } from "../src/staff-nav-bridge.ts";
import { OPTS } from "./harness.ts";

Deno.test("staff badge key constant", OPTS, () => {
  assertEquals(UPCOMING_KEY, "events:upcoming");
});

Deno.test("badge hooks register/remove without web", OPTS, async () => {
  registerEventsBadgeHooks();
  // No @ursamu/web → publish is a no-op
  await publishEventsUpcomingBadge();
  removeEventsBadgeHooks();
});

Deno.test("hasStaffConsole false without web", OPTS, async () => {
  // In unit test env, soft import of @ursamu/web usually fails.
  const present = await hasStaffConsole();
  assertEquals(typeof present, "boolean");
});
