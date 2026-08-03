import { assertEquals } from "@std/assert";
import {
  clearStaffNav,
  listStaffNav,
  registerStaffNav,
  unregisterStaffNav,
} from "../src/staff-nav.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("registerStaffNav — sorts by order then id", OPTS, () => {
  clearStaffNav();
  registerStaffNav({
    id: "z-app",
    label: "Z",
    href: "/admin/z/",
    order: 10,
  });
  registerStaffNav({
    id: "a-app",
    label: "A",
    href: "/admin/a/",
    order: 10,
  });
  registerStaffNav({
    id: "mid",
    label: "Mid",
    href: "/admin/m/",
    order: 5,
  });
  const ids = listStaffNav().map((i) => i.id);
  assertEquals(ids, ["mid", "a-app", "z-app"]);
  clearStaffNav();
});

Deno.test("registerStaffNav — rejects empty target", OPTS, () => {
  clearStaffNav();
  registerStaffNav({ id: "x", label: "X" });
  assertEquals(listStaffNav().length, 0);
  clearStaffNav();
});

Deno.test("registerStaffNav — embed alone ok", OPTS, () => {
  clearStaffNav();
  registerStaffNav({
    id: "tool",
    label: "Tool",
    embed: "/admin/tool/",
  });
  const items = listStaffNav();
  assertEquals(items.length, 1);
  assertEquals(items[0]!.route, "plugin-embed");
  assertEquals(items[0]!.embed, "/admin/tool/");
  clearStaffNav();
});

Deno.test("registerStaffNav — last write wins", OPTS, () => {
  clearStaffNav();
  registerStaffNav({
    id: "bbs",
    label: "Old",
    href: "/old/",
    order: 1,
  });
  registerStaffNav({
    id: "bbs",
    label: "Bulletin Board System",
    description: "Boards and posts.",
    route: "bbs",
    order: 45,
    badgeKey: "bbs:activity",
  });
  const items = listStaffNav();
  assertEquals(items.length, 1);
  assertEquals(items[0]?.label, "Bulletin Board System");
  assertEquals(items[0]?.description, "Boards and posts.");
  assertEquals(items[0]?.route, "bbs");
  assertEquals(items[0]?.href, undefined);
  assertEquals(items[0]?.badgeKey, "bbs:activity");
  clearStaffNav();
});

Deno.test("unregisterStaffNav", OPTS, () => {
  clearStaffNav();
  registerStaffNav({
    id: "bbs",
    label: "BBS",
    href: "/admin/bbs/",
  });
  unregisterStaffNav("bbs");
  assertEquals(listStaffNav().length, 0);
  clearStaffNav();
});
