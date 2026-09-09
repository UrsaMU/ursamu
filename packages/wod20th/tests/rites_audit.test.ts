// tests/rites_audit.test.ts -- /tdd-audit security pass for +rite / core/rites.
//
// Vectors: bogus slugs, duplicate learns, no-op forgets, staff-only switches,
// difficulty injection, data integrity, exception safety, slug normalization.
import { assert, assertEquals, assertFalse } from "@std/assert";
import { describe, it } from "jsr:@std/testing@^1.0.0/bdd";

import {
  castRite,
  forgetRite,
  getRite,
  knowsRite,
  learnRite,
} from "../core/rites.ts";
import { WTA_RITES, type RiteCategory } from "../splats/wta/data/rites.ts";
import type { IWoDChar } from "../core/types.ts";

const VALID_CATEGORIES: ReadonlySet<RiteCategory> = new Set([
  "mystic", "minor", "seasonal", "accord", "caern",
  "death", "renown", "punishment", "passage",
]);

function mkChar(overrides: Partial<IWoDChar> = {}): IWoDChar {
  return {
    id: "c-rite",
    playerId: "p1",
    splat: "wta",
    status: "approved",
    chargenStep: 6,
    concept: "test",
    attributePriority: ["", "", ""],
    attributes: {},
    attributeSpecialties: {},
    abilityPriority: ["", "", ""],
    abilities: {},
    abilitySpecialties: {},
    backgrounds: {},
    willpower: 6,
    rage: 3,
    gnosis: 5,
    freebiesRemaining: 0,
    freebiesLog: [],
    xpTotal: 0,
    xpSpent: 0,
    notes: [],
    staffNotes: "",
    statLog: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

const RITE_CMD_SRC = await Deno.readTextFile(
  new URL("../commands/rite.ts", import.meta.url),
);

describe("/tdd-audit +rite / core rites", () => {
  // E-1: learnRite rejects unknown slugs.
  it("E-1: learnRite rejects unknown slug (no garbage inserts)", () => {
    const char = mkChar({ rites: [] });
    const res = learnRite(char, "rite-of-handwavium");
    assertFalse(res.ok);
    assertEquals(res.rites, undefined);
    // Caller persists res.rites; with no array returned, char.rites stays empty.
    assertEquals(char.rites, []);
  });

  // E-2: learnRite is idempotent (no duplicates).
  it("E-2: learnRite is idempotent on a slug already known", () => {
    const char = mkChar({ rites: ["rite-of-cleansing"] });
    const res = learnRite(char, "rite-of-cleansing");
    assertFalse(res.ok);
    assertEquals(res.rites, ["rite-of-cleansing"]);
    // Also through case-variant input.
    const res2 = learnRite(char, "RITE-OF-CLEANSING");
    assertFalse(res2.ok);
    assertEquals(res2.rites, ["rite-of-cleansing"]);
  });

  // E-3: forgetRite on a non-known rite is a safe no-op (no throw).
  it("E-3: forgetRite on unknown is a safe no-op, never throws", () => {
    const char = mkChar({ rites: ["rite-of-cleansing"] });
    const res = forgetRite(char, "rite-of-nothing");
    assertFalse(res.ok);
    assertEquals(res.rites, ["rite-of-cleansing"], "list must be unchanged");
    // Unknown slug whose name lookup fails -- message must still resolve.
    assert(typeof res.message === "string" && res.message.length > 0);
  });

  // E-4: /forget and /teach are staff-gated.
  it("E-4: /teach and /forget are staff-gated in the command (regression guard)", () => {
    // Both switches must be preceded by an isStaff(u) check that returns on false.
    const teachIdx = RITE_CMD_SRC.indexOf('sw === "teach"');
    const forgetIdx = RITE_CMD_SRC.indexOf('sw === "forget"');
    assert(teachIdx > 0 && forgetIdx > 0, "teach/forget branches must exist");

    // Slice the body of each switch up to the next `// /` separator and assert
    // the staff gate appears before any persistence.
    const teachBody = RITE_CMD_SRC.slice(teachIdx, teachIdx + 800);
    const forgetBody = RITE_CMD_SRC.slice(forgetIdx, forgetIdx + 800);
    assert(
      /if \(!isStaff\(u\)\) \{ u\.send\("%crPermission denied\.%cn"\); return; \}/.test(teachBody),
      "/teach must gate on isStaff before any persistence",
    );
    assert(
      /if \(!isStaff\(u\)\) \{ u\.send\("%crPermission denied\.%cn"\); return; \}/.test(forgetBody),
      "/forget must gate on isStaff before any persistence",
    );
    // /teach must also confirm canEdit against the chosen target.
    assert(
      /await u\.canEdit\(u\.me, target\)/.test(teachBody),
      "/teach must verify canEdit(actor, target)",
    );
  });

  // E-5: castRite rolls vs the rite's declared difficulty, not a caller string.
  it("E-5: castRite uses the rite's difficulty, ignoring undeclared overrides at the command boundary", () => {
    const char = mkChar({ gnosis: 4 });
    const res = castRite(char, "rite-of-cleansing");
    const def = getRite("rite-of-cleansing")!;
    const expected = def.difficulty ?? 7;
    // evaluateRoll clamps difficulty to [2,10]; verify the actual value
    // matches the table-defined difficulty (no silent override).
    assertEquals(res.roll.difficulty, Math.max(2, Math.min(10, expected)));

    // Regression guard: the command surface for /cast does NOT pass a
    // caller-supplied difficulty override -- the third arg of castRite,
    // if present, must be `undefined`. (The fourth arg `extraDice` is
    // allowed -- it carries caern bonuses, not difficulty.)
    const castIdx = RITE_CMD_SRC.indexOf('sw === "cast"');
    assert(castIdx > 0, "cast branch must exist");
    const castBody = RITE_CMD_SRC.slice(castIdx, castIdx + 1600);
    // Either castRite(char, slug) OR castRite(char, slug, undefined, ...).
    assert(
      /castRite\(char,\s*slug(?:\s*\)|\s*,\s*undefined(?:\s*,\s*[^)]+)?\s*\))/.test(castBody),
      "/cast must not pass a caller-supplied difficulty override",
    );
  });

  // E-6: WTA_RITES data integrity.
  it("E-6: WTA_RITES has valid categories, levels, and unique slugs", () => {
    const entries = Object.entries(WTA_RITES);
    assert(entries.length >= 30, `expected >=30 rites, got ${entries.length}`);

    const slugs = new Set<string>();
    for (const [slug, def] of entries) {
      assert(/^[a-z0-9-]+$/.test(slug), `bad slug: ${slug}`);
      assertFalse(slugs.has(slug), `duplicate slug: ${slug}`);
      slugs.add(slug);
      assert(VALID_CATEGORIES.has(def.category), `bad category: ${def.category}`);
      assert(
        [1, 2, 3, 4, 5].includes(def.level),
        `bad level for ${def.name}: ${def.level}`,
      );
      if (def.difficulty !== undefined) {
        assert(
          def.difficulty >= 2 && def.difficulty <= 10,
          `bad difficulty for ${def.name}: ${def.difficulty}`,
        );
      }
      assert(def.name && def.description, `${slug} missing name/description`);
    }
  });

  // E-7: castRite never throws -- even on unknown slug it returns a roll shape.
  it("E-7: castRite returns a roll object on unknown slug rather than throwing", () => {
    const char = mkChar({ gnosis: 3 });
    let res;
    try {
      res = castRite(char, "rite-of-nope");
    } catch (e) {
      throw new Error("castRite must not throw on unknown slug: " + (e as Error).message);
    }
    assertFalse(res.ok);
    assert(res.roll && Array.isArray(res.roll.dice));
    assert(typeof res.message === "string");
  });

  // E-8: slug normalization across learn/cast/knows.
  it("E-8: slug operations normalize case + whitespace consistently", () => {
    const char = mkChar({ rites: [] });
    const learned = learnRite(char, "  Rite-Of-Cleansing  ");
    assert(learned.ok);
    // The stored slug is the lowercased+trimmed key.
    assertEquals(learned.rites, ["rite-of-cleansing"]);
    char.rites = learned.rites!;

    // knowsRite recognizes case-variant inputs.
    assert(knowsRite(char, "RITE-of-Cleansing"));
    assert(knowsRite(char, "  rite-of-cleansing  "));

    // castRite resolves the same way.
    const cast = castRite(char, "RITE-OF-CLEANSING");
    assert(cast.message.includes("Rite of Cleansing"));

    // forgetRite likewise.
    const forgot = forgetRite(char, "Rite-Of-Cleansing");
    assert(forgot.ok);
    assertEquals(forgot.rites, []);
  });

  // Bonus: hook emit on cast carries the normalized slug.
  it("/cast hook payload normalizes slug before emit (regression guard)", () => {
    const castIdx = RITE_CMD_SRC.indexOf('sw === "cast"');
    const castBody = RITE_CMD_SRC.slice(castIdx, castIdx + 1800);
    assert(
      /const slug = arg\.toLowerCase\(\)\.trim\(\);/.test(castBody),
      "/cast must normalize the slug locally before emitting/looking up",
    );
    assert(
      /slug,\s*roll: res\.roll/.test(castBody),
      "hook payload must reference the normalized slug",
    );
  });
});
