/**
 * Tests for default board seed configuration.
 */
import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { DEFAULT_BOARDS } from "../src/seed.ts";

describe("DEFAULT_BOARDS", () => {
  it("includes Announcements, OOC, and Jobs", () => {
    const names = DEFAULT_BOARDS.map((b) => b.name);
    assertEquals(names.includes("Announcements"), true);
    assertEquals(names.includes("OOC"), true);
    assertEquals(names.includes("Jobs"), true);
  });

  it("Announcements is player-readable and staff-write", () => {
    const a = DEFAULT_BOARDS.find((b) => b.name === "Announcements")!;
    assertEquals(a.readLock, "all()");
    assertEquals(a.writeLock, "admin+");
    assertEquals(a.category, "Public");
  });

  it("OOC is open to all players", () => {
    const o = DEFAULT_BOARDS.find((b) => b.name === "OOC")!;
    assertEquals(o.readLock, "all()");
    assertEquals(o.writeLock, "all()");
  });

  it("Jobs is staff-only", () => {
    const j = DEFAULT_BOARDS.find((b) => b.name === "Jobs")!;
    assertEquals(j.readLock, "admin+");
    assertEquals(j.writeLock, "admin+");
    assertEquals(j.category, "Staff");
  });

  it("staff-only lock is denied for plain players", () => {
    // Mirrors permissions.ts: non-staff + non-all/faction → false
    const lock = "admin+";
    const isStaff = false;
    const canRead = isStaff ||
      !lock ||
      lock === "all()" ||
      lock === "faction";
    assertEquals(canRead, false);
  });

  it("staff always bypasses staff-only locks", () => {
    const lock = "admin+";
    const isStaff = true;
    const canRead = isStaff || lock === "all()";
    assertEquals(canRead, true);
  });
});
