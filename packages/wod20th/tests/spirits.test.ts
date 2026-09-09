// tests/spirits.test.ts -- WTA_SPIRITS catalog integrity + helpers.
import { assert, assertEquals } from "@std/assert";
import { describe, it } from "jsr:@std/testing@^1.0.0/bdd";

import {
  WTA_SPIRITS,
  getSpirit,
  findByType,
  SPIRIT_TYPES,
} from "../splats/wta/data/spirits.ts";
import type { SpiritType } from "../core/types.ts";

const VALID_TYPES: ReadonlySet<SpiritType> = new Set(SPIRIT_TYPES);

describe("WTA_SPIRITS catalog", () => {
  it("has a reasonable number of entries", () => {
    const count = Object.keys(WTA_SPIRITS).length;
    assert(count >= 30, `expected at least 30 entries, got ${count}`);
  });

  it("every entry has all required fields, well-typed", () => {
    for (const [slug, def] of Object.entries(WTA_SPIRITS)) {
      assertEquals(slug, def.slug, `slug key must match def.slug for ${slug}`);
      assert(/^[a-z0-9][a-z0-9-]*$/.test(def.slug), `slug must be kebab: ${def.slug}`);
      assert(typeof def.name === "string" && def.name.length > 0, `name required: ${slug}`);
      assert(VALID_TYPES.has(def.type), `unknown type for ${slug}: ${def.type}`);
      for (const stat of ["rage", "gnosis", "willpower", "power"] as const) {
        assert(typeof def[stat] === "number" && def[stat] >= 0,
          `${stat} must be non-negative number for ${slug}`);
      }
      assert(Array.isArray(def.charms), `charms must be array for ${slug}`);
      for (const c of def.charms) {
        assert(typeof c === "string" && c.length > 0, `charm must be non-empty string for ${slug}`);
      }
      assert(typeof def.ban === "string" && def.ban.length > 0, `ban required for ${slug}`);
    }
  });

  it("totems carry totemCost and totemBoons", () => {
    const totems = findByType("totem");
    assert(totems.length >= 10, `expected >=10 totems, got ${totems.length}`);
    for (const t of totems) {
      assert(typeof t.totemCost === "number" && t.totemCost > 0,
        `totem ${t.slug} must have totemCost > 0`);
      assert(Array.isArray(t.totemBoons) && t.totemBoons.length > 0,
        `totem ${t.slug} must have non-empty totemBoons`);
    }
  });

  it("includes canon tribal totems", () => {
    for (const slug of ["wolf", "stag", "bear", "raven", "falcon", "owl",
                        "pegasus", "unicorn", "grandfather-thunder",
                        "cockroach", "rat", "wendigo", "fenris", "uktena"]) {
      assert(getSpirit(slug), `missing canon totem: ${slug}`);
    }
  });
});

describe("getSpirit / findByType helpers", () => {
  it("getSpirit is case-insensitive and trims", () => {
    const a = getSpirit("wolf");
    const b = getSpirit("  WOLF  ");
    assertEquals(a, b);
    assert(a !== undefined);
  });

  it("getSpirit returns undefined for unknown slugs", () => {
    assertEquals(getSpirit("not-a-spirit"), undefined);
    assertEquals(getSpirit(""), undefined);
  });

  it("findByType returns only matching type", () => {
    const gafflings = findByType("gaffling");
    assert(gafflings.length > 0);
    for (const g of gafflings) assertEquals(g.type, "gaffling");
  });
});
