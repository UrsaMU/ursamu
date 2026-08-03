import { assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  clearStaffSideNav,
  getStaffSideNav,
  listStaffSideNav,
  registerStaffSideNav,
  unregisterStaffSideNav,
} from "../src/staff-sidenav.ts";
import {
  clearStaffPages,
  registerStaffPage,
} from "../src/staff-pages.ts";
import {
  clearStaffNav,
  listStaffNav,
} from "../src/staff-nav.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("registerStaffSideNav: stores groups", OPTS, () => {
  clearStaffSideNav();
  registerStaffSideNav({
    pageId: "mytool",
    groups: [
      {
        title: "Queues",
        items: [
          {
            id: "open",
            label: "Open",
            query: { tab: "open" },
          },
          { id: "done", label: "Done", query: { tab: "done" } },
        ],
      },
    ],
  });
  const reg = getStaffSideNav("mytool");
  assertEquals(reg?.groups.length, 1);
  assertEquals(reg?.groups[0]!.items.length, 2);
  assertEquals(
    listStaffSideNav().mytool?.groups[0]!.items[0]!.query?.tab,
    "open",
  );
  unregisterStaffSideNav("mytool");
  assertEquals(getStaffSideNav("mytool"), undefined);
  clearStaffSideNav();
});

Deno.test("registerStaffSideNav: rejects empty", OPTS, () => {
  clearStaffSideNav();
  registerStaffSideNav({ pageId: "x", groups: [] });
  assertEquals(Object.keys(listStaffSideNav()).length, 0);
  registerStaffSideNav({
    pageId: "x",
    groups: [{ items: [{ id: "", label: "" }] }],
  });
  assertEquals(Object.keys(listStaffSideNav()).length, 0);
  clearStaffSideNav();
});

Deno.test("registerStaffPage: cross-origin needs origin", OPTS, () => {
  clearStaffPages();
  clearStaffNav();
  registerStaffPage({
    id: "ext",
    label: "Ext",
    embed: "https://ops.example.com/ui",
    // origin inferred from URL
  });
  const nav = listStaffNav();
  assertEquals(nav.length, 1);
  assertEquals(nav[0]!.embedOrigin, "https://ops.example.com");

  clearStaffPages();
  clearStaffNav();
  registerStaffPage({
    id: "bad",
    label: "Bad",
    embed: "https://ops.example.com/ui",
    embedOrigin: "https://other.example.com",
  });
  assertEquals(listStaffNav().length, 0);
  clearStaffPages();
  clearStaffNav();
});
