import { assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  clearStaffNav,
  registerStaffNav,
} from "../src/staff-nav.ts";
import {
  clearStaffSideNav,
  registerStaffSideNav,
} from "../src/staff-sidenav.ts";
import {
  flushStaffChrome,
  setStaffChromeNotifier,
} from "../src/staff-chrome.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("notifyStaffChrome pushes after register", OPTS, () => {
  clearStaffNav();
  clearStaffSideNav();
  let hits = 0;
  let lastNav = 0;
  setStaffChromeNotifier(() => {
    hits++;
    lastNav = 1;
  });
  registerStaffNav({
    id: "chrome-t",
    label: "T",
    route: "chrome-t",
  });
  flushStaffChrome();
  assertEquals(hits >= 1, true);
  assertEquals(lastNav, 1);

  registerStaffSideNav({
    pageId: "chrome-t",
    groups: [{
      title: "G",
      items: [{ id: "a", label: "A" }],
    }],
  });
  flushStaffChrome();
  assertEquals(hits >= 2, true);

  setStaffChromeNotifier(null);
  clearStaffNav();
  clearStaffSideNav();
});
