// Parser for the free-form `special` field on weapon entries.

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";

import { parseWeaponTags } from "../src/equipment/tags.ts";

describe("parseWeaponTags", () => {
  it("returns defaults for empty / undefined / null input", () => {
    const t = parseWeaponTags(undefined);
    assertEquals(t.again, 10);
    assertEquals(t.armorPiercing, 0);
    assertEquals(t.reach, 1);
    assertEquals(t.stun, false);
    assertEquals(t.knockdown, false);
    assertEquals(parseWeaponTags("").again, 10);
    assertEquals(parseWeaponTags(null).again, 10);
  });

  it("parses 9-again from a comma-delimited string", () => {
    const t = parseWeaponTags("9-again, two-handed");
    assertEquals(t.again, 9);
    assertEquals(t.twoHanded, true);
  });

  it("parses 8-again", () => {
    assertEquals(parseWeaponTags("8-again").again, 8);
  });

  it("parses armor piercing N", () => {
    assertEquals(parseWeaponTags("Armor piercing 2").armorPiercing, 2);
    assertEquals(parseWeaponTags("armor-piercing 1").armorPiercing, 1);
  });

  it("parses reach N", () => {
    assertEquals(parseWeaponTags("Reach 2").reach, 2);
  });

  it("parses stun + knockdown", () => {
    const t = parseWeaponTags("Stun, Knockdown");
    assertEquals(t.stun, true);
    assertEquals(t.knockdown, true);
  });

  it("parses blast and force from grenade-style special strings", () => {
    const t = parseWeaponTags("Blast 10, Force 3; Aerodynamic; Knockdown, Stun");
    assertEquals(t.blast, 10);
    assertEquals(t.force, 3);
    assertEquals(t.aerodynamic, true);
    assertEquals(t.knockdown, true);
    assertEquals(t.stun, true);
  });

  it("ignores unknown tokens (degrades gracefully on prose specials)", () => {
    const t = parseWeaponTags("Must hit heart (-3); 5+ dmg required");
    // No matches — defaults all the way down.
    assertEquals(t.again, 10);
    assertEquals(t.stun, false);
  });

  it("is case-insensitive and tolerates 'and' as a delimiter", () => {
    const t = parseWeaponTags("AUTOFIRE and 9-Again");
    assertEquals(t.autofire, true);
    assertEquals(t.again, 9);
  });

  it("parses Slow", () => {
    assertEquals(parseWeaponTags("Slow, Stun").slow, true);
  });
});
