import { assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  clearStaffNav,
  listStaffNav,
} from "../src/staff-nav.ts";
import {
  clearStaffPages,
  listStaffPages,
  registerStaffPage,
  unregisterStaffPage,
} from "../src/staff-pages.ts";
import {
  clearStaffStatic,
  isStaffStaticId,
  registerStaffStatic,
  getStaffStaticRoot,
  safeJoinStaffStatic,
} from "../src/staff-static.ts";
import { fromFileUrl } from "jsr:@std/path@^0.224.0";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("registerStaffPage: host route", OPTS, () => {
  clearStaffPages();
  clearStaffNav();
  registerStaffPage({
    id: "jobs",
    label: "Jobs",
    route: "jobs",
    order: 40,
  });
  const pages = listStaffPages();
  assertEquals(pages.length, 1);
  assertEquals(pages[0]!.route, "jobs");
  const nav = listStaffNav();
  assertEquals(nav[0]!.route, "jobs");
  assertEquals(nav[0]!.embed, undefined);
  clearStaffPages();
  clearStaffNav();
});

Deno.test("registerStaffPage: embed → plugin-embed nav", OPTS, () => {
  clearStaffPages();
  clearStaffNav();
  registerStaffPage({
    id: "mytool",
    label: "My Tool",
    embed: "/admin/mytool/",
    order: 55,
  });
  const nav = listStaffNav();
  assertEquals(nav.length, 1);
  assertEquals(nav[0]!.route, "plugin-embed");
  assertEquals(nav[0]!.embed, "/admin/mytool/");
  unregisterStaffPage("mytool");
  assertEquals(listStaffNav().length, 0);
  clearStaffPages();
  clearStaffNav();
});

Deno.test("registerStaffPage: route wins over embed", OPTS, () => {
  clearStaffPages();
  clearStaffNav();
  registerStaffPage({
    id: "x",
    label: "X",
    route: "map",
    embed: "/admin/x/",
    href: "/elsewhere",
  });
  const p = listStaffPages()[0]!;
  assertEquals(p.route, "map");
  assertEquals(p.embed, undefined);
  assertEquals(p.href, undefined);
  clearStaffPages();
  clearStaffNav();
});

Deno.test("registerStaffPage: rejects empty target", OPTS, () => {
  clearStaffPages();
  clearStaffNav();
  registerStaffPage({ id: "x", label: "X" });
  assertEquals(listStaffPages().length, 0);
  clearStaffPages();
});

Deno.test("registerStaffStatic: reserved + safe join", OPTS, () => {
  clearStaffStatic();
  assertEquals(isStaffStaticId("wiki"), false);
  assertEquals(isStaffStaticId("mytool"), true);
  const root = fromFileUrl(new URL("./", import.meta.url));
  assertEquals(
    registerStaffStatic({ id: "assets", root }),
    false,
  );
  assertEquals(
    registerStaffStatic({ id: "mytool", root }),
    true,
  );
  assertEquals(getStaffStaticRoot("mytool"), root);
  assertEquals(safeJoinStaffStatic(root, "../x"), null);
  clearStaffStatic();
});
