/**
 * Staff-only help visibility rules.
 */
import { assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  filterTopicsForViewer,
  isStaffOnlyEntry,
  lockImpliesStaff,
  pathImpliesStaff,
  sectionImpliesStaff,
} from "../src/visibility.ts";
import type { HelpEntry } from "../src/registry.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function entry(
  partial: Partial<HelpEntry> & { name: string },
): HelpEntry {
  return {
    section: "general",
    content: "x",
    source: "file",
    tags: [],
    ...partial,
  };
}

Deno.test("lockImpliesStaff", OPTS, () => {
  assertEquals(lockImpliesStaff(""), false);
  assertEquals(lockImpliesStaff("connected"), false);
  assertEquals(lockImpliesStaff("connected admin+"), true);
  assertEquals(lockImpliesStaff("connected wizard"), true);
  assertEquals(lockImpliesStaff("connected builder+"), true);
  assertEquals(lockImpliesStaff("flag(admin)"), true);
});

Deno.test("sectionImpliesStaff", OPTS, () => {
  assertEquals(sectionImpliesStaff("general"), false);
  assertEquals(sectionImpliesStaff("channel"), false);
  assertEquals(sectionImpliesStaff("admin"), true);
  assertEquals(sectionImpliesStaff("bbs-staff"), true);
  assertEquals(sectionImpliesStaff("staff"), true);
});

Deno.test("pathImpliesStaff", OPTS, () => {
  assertEquals(pathImpliesStaff("mail/send"), false);
  assertEquals(pathImpliesStaff("bbs/staff/create"), true);
  assertEquals(pathImpliesStaff("channels/staff/cboot"), true);
  assertEquals(pathImpliesStaff("_draft"), true);
  assertEquals(pathImpliesStaff("language/language-staff"), true);
});

Deno.test("filterTopicsForViewer hides staff from public", OPTS, () => {
  const all = [
    entry({ name: "look", section: "general" }),
    entry({ name: "boot", section: "admin" }),
    entry({ name: "cboot", section: "channel", staffOnly: true }),
    entry({ name: "secret", section: "general", hidden: true }),
    entry({ name: "bbs/staff/mod", section: "bbs" }),
  ];
  const pub = filterTopicsForViewer(all, false).map((e) => e.name);
  assertEquals(pub, ["look"]);
  const staff = filterTopicsForViewer(all, true).map((e) => e.name);
  assertEquals(staff.includes("boot"), true);
  assertEquals(staff.includes("look"), true);
  assertEquals(staff.includes("secret"), true);
});

Deno.test("isStaffOnlyEntry", OPTS, () => {
  assertEquals(
    isStaffOnlyEntry(entry({ name: "look", section: "general" })),
    false,
  );
  assertEquals(
    isStaffOnlyEntry(entry({ name: "x", section: "admin" })),
    true,
  );
});
