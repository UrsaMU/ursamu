/**
 * SECURITY — +bbmod must reject non-player objects.
 *
 * The attack: a staff member passes a #dbref for a room or item.
 * Without a type check, that object's ID is added to moderators[],
 * which is meaningless but could cause isBoardMod() to return true
 * for whoever gains control of that object's dbref — or causes confusion.
 */
import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";

interface ITarget { id: string; name: string; flags: Set<string>; }

// Vulnerable: no type check — any target accepted
function addModVulnerable(mods: string[], target: ITarget): { ok: boolean; mods: string[] } {
  return { ok: true, mods: [...mods, target.id] };
}

// Patched: reject non-player targets
function addModPatched(mods: string[], target: ITarget): { ok: boolean; mods: string[]; error?: string } {
  if (!target.flags.has("player")) {
    return { ok: false, mods, error: "Target must be a player." };
  }
  return { ok: true, mods: [...mods, target.id] };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("+bbmod type guard — vulnerable", () => {
  it("EXPLOIT: room object can be added as moderator without patch", () => {
    const room: ITarget = { id: "room-1", name: "A Room", flags: new Set(["room"]) };
    const result = addModVulnerable([], room);
    assertEquals(result.ok, true);
    assertEquals(result.mods.includes("room-1"), true);
  });
});

describe("+bbmod type guard — patched", () => {
  it("rejects room objects", () => {
    const room: ITarget = { id: "room-1", name: "A Room", flags: new Set(["room"]) };
    const result = addModPatched([], room);
    assertEquals(result.ok, false);
    assertEquals(result.mods.includes("room-1"), false);
  });

  it("rejects objects without player flag", () => {
    const item: ITarget = { id: "item-1", name: "Sword", flags: new Set(["thing"]) };
    const result = addModPatched([], item);
    assertEquals(result.ok, false);
  });

  it("accepts player objects", () => {
    const player: ITarget = { id: "p1", name: "Alice", flags: new Set(["player", "connected"]) };
    const result = addModPatched([], player);
    assertEquals(result.ok, true);
    assertEquals(result.mods.includes("p1"), true);
  });

  it("accepts admin players", () => {
    const admin: ITarget = { id: "p2", name: "Staff", flags: new Set(["player", "admin"]) };
    assertEquals(addModPatched([], admin).ok, true);
  });
});
