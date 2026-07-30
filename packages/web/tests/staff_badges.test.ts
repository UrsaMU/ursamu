import { assertEquals } from "@std/assert";
import {
  clearAllStaffBadges,
  clearStaffBadge,
  getStaffBadge,
  listStaffBadges,
  setStaffBadge,
  setStaffBadgePusher,
} from "../src/staff-badges.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("setStaffBadge — number and clear on zero", OPTS, () => {
  clearAllStaffBadges();
  setStaffBadge("bbs:flagged", 3, "Flagged posts");
  assertEquals(getStaffBadge("bbs:flagged")?.value, "3");
  assertEquals(getStaffBadge("bbs:flagged")?.title, "Flagged posts");
  setStaffBadge("bbs:flagged", 0);
  assertEquals(getStaffBadge("bbs:flagged")?.value, "");
  clearAllStaffBadges();
});

Deno.test("setStaffBadge — pushes to hub", OPTS, () => {
  clearAllStaffBadges();
  const pushed: unknown[] = [];
  setStaffBadgePusher((m) => pushed.push(m));
  setStaffBadge("jobs:open", 2);
  assertEquals(pushed.length, 1);
  assertEquals(
    (pushed[0] as { type: string; value: string }).value,
    "2",
  );
  setStaffBadgePusher(null);
  clearAllStaffBadges();
});

Deno.test("clearStaffBadge — removes key and pushes empty", OPTS, () => {
  clearAllStaffBadges();
  const pushed: unknown[] = [];
  setStaffBadgePusher((m) => pushed.push(m));
  setStaffBadge("wiki:drafts", 1);
  clearStaffBadge("wiki:drafts");
  assertEquals(getStaffBadge("wiki:drafts"), undefined);
  assertEquals(
    (pushed[pushed.length - 1] as { value: string }).value,
    "",
  );
  setStaffBadgePusher(null);
  clearAllStaffBadges();
});

Deno.test("listStaffBadges — map copy", OPTS, () => {
  clearAllStaffBadges();
  setStaffBadge("a", 1);
  setStaffBadge("b", 2);
  const m = listStaffBadges();
  assertEquals(Object.keys(m).sort(), ["a", "b"]);
  clearAllStaffBadges();
});
