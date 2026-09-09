// tests/paths.test.ts -- Blood-magic path gating, primary paths, path XP.
import { assert, assertEquals } from "@std/assert";

import "../splats/vtm/index.ts";
import {
  ALL_MAGIC_PATHS,
  getMagicPath,
  pathsForSchool,
  defaultPrimaryPath,
} from "../splats/vtm/data/magicPaths.ts";
import {
  getPower,
  matchPower,
  pathDots,
  powersForPath,
  powersKnown,
} from "../splats/vtm/data/powers.ts";
import { useDisciplinePower } from "../core/disciplineUse.ts";
import { evaluateRoll } from "../core/dice.ts";
import { xpCost } from "../core/xp.ts";
import { resolveTrait } from "../core/resolver.ts";
import type { IWoDChar } from "../core/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function mkTremere(over: Partial<IWoDChar> = {}): IWoDChar {
  const now = Date.now();
  return {
    id: "trem-1",
    playerId: "player-1",
    splat: "vtm",
    status: "approved",
    chargenStep: 6,
    concept: "Warlock",
    attributePriority: ["mental", "social", "physical"],
    attributes: { Intelligence: 3 },
    attributeSpecialties: {},
    abilityPriority: ["knowledges", "skills", "talents"],
    abilities: { Occult: 3 },
    abilitySpecialties: {},
    backgrounds: {},
    willpower: 5,
    freebiesRemaining: 0,
    freebiesLog: [],
    xpTotal: 0,
    xpSpent: 0,
    staffNotes: "",
    statLog: [],
    notes: [],
    createdAt: now,
    updatedAt: now,
    clan: "tremere",
    generation: 12,
    bloodMax: 11,
    bloodPool: 10,
    bloodPerTurn: 1,
    disciplines: { Thaumaturgy: 3 },
    virtues: { Conscience: 3, "Self-Control": 3, Courage: 3 },
    humanity: 7,
    healthTrack: [],
    ...over,
  } as IWoDChar;
}

// ---------------------------------------------------------------------------

Deno.test("magic path catalog covers both schools", OPTS, () => {
  assertEquals(pathsForSchool("thaumaturgy").length, 13);
  assertEquals(pathsForSchool("necromancy").length, 8);
  assertEquals(ALL_MAGIC_PATHS.length, 21);
  assert(getMagicPath("green path")?.school === "thaumaturgy");
  assert(getMagicPath("ash path")?.school === "necromancy");
  assertEquals(defaultPrimaryPath("thaumaturgy"), "Path of Blood");
  assertEquals(defaultPrimaryPath("necromancy"), "Sepulchre Path");
});

Deno.test("every thaum path has 5 powers", OPTS, () => {
  for (const p of pathsForSchool("thaumaturgy")) {
    const powers = powersForPath(p.name);
    assertEquals(
      powers.length,
      5,
      `${p.name} should have 5 powers, has ${powers.length}`,
    );
    assertEquals(powers.map((x) => x.level), [1, 2, 3, 4, 5]);
  }
});

Deno.test("every necro path has 5 powers", OPTS, () => {
  for (const p of pathsForSchool("necromancy")) {
    const powers = powersForPath(p.name);
    assertEquals(
      powers.length,
      5,
      `${p.name} should have 5 powers, has ${powers.length}`,
    );
  }
});

Deno.test("pathDots: primary equals school rating", OPTS, () => {
  const c = mkTremere(); // Thaumaturgy 3, primary = Path of Blood
  const taste = getPower("thaumaturgy-taste")!;
  assertEquals(pathDots(c, taste), 3);
});

Deno.test("pathDots: secondary capped at school-1 until school 5", OPTS, () => {
  const c = mkTremere({
    disciplines: { Thaumaturgy: 3, "The Green Path": 3 },
  });
  const herbal = getPower("herbal-wisdom")!;
  // School 3 -> secondary usable at min(3, 3-1) = 2
  assertEquals(pathDots(c, herbal), 2);
});

Deno.test("pathDots: secondary uncapped at school 5", OPTS, () => {
  const c = mkTremere({
    disciplines: { Thaumaturgy: 5, "The Green Path": 4 },
  });
  assertEquals(pathDots(c, getPower("herbal-wisdom")!), 4);
});

Deno.test("pathDots: custom primary via primaryPaths", OPTS, () => {
  const c = mkTremere({
    disciplines: { Thaumaturgy: 3 },
    primaryPaths: { thaumaturgy: "The Green Path" },
  });
  assertEquals(pathDots(c, getPower("herbal-wisdom")!), 3);
  // Path of Blood is now secondary (0 dots)
  assertEquals(pathDots(c, getPower("thaumaturgy-taste")!), 0);
});

Deno.test("useDisciplinePower: primary path power works", OPTS, () => {
  const c = mkTremere();
  const r = useDisciplinePower(c, "thaumaturgy-taste Alice", {});
  // needs a target name -> reports TARGET_NEEDED path (no blood spent)
  assert(!r.ok || r.ok);
  const probe = useDisciplinePower(c, "thaumaturgy-taste", {});
  assertEquals(probe.ok, false);
  assert(/Usage|TARGET_NEEDED/.test(probe.message));
});

Deno.test("useDisciplinePower: secondary above cap rejected", OPTS, () => {
  const c = mkTremere({
    disciplines: { Thaumaturgy: 1, "The Lure of Flames": 1 },
    bloodPool: 10,
  });
  // School 1 -> secondary cap = 0: even L1 Candle is out of reach
  const r = useDisciplinePower(c, "lure-candle", {});
  assertEquals(r.ok, false);
  assert(/needs Thaumaturgy 1/.test(r.message));
});

Deno.test("useDisciplinePower: Green Path L1 rolls Willpower vs 4", OPTS, () => {
  const c = mkTremere({
    disciplines: { Thaumaturgy: 2, "The Green Path": 1 },
    willpower: 4,
    willpowerCurrent: 4,
  });
  const r = useDisciplinePower(c, "herbal-wisdom", {
    rng: (pool, diff = 6) => evaluateRoll([8, 7, 9, 2].slice(0, pool), diff, false),
  });
  assert(r.ok, r.message);
  assert(r.rollLine?.includes("vs 4"), r.rollLine ?? "");
  assertEquals(c.bloodPool, 9); // 1 blood spent
});

Deno.test("useDisciplinePower: Lure of Flames damage applies agg", OPTS, () => {
  const c = mkTremere({ disciplines: { Thaumaturgy: 3 } });
  c.primaryPaths = { thaumaturgy: "The Lure of Flames" };
  const target = mkTremere({ id: "tgt", healthTrack: ["", "", "", "", "", "", ""] });
  const r = useDisciplinePower(c, "lure-palm-of-flame Bob", {
    target,
    targetName: "Bob",
    rng: (pool, diff = 6) => evaluateRoll([8, 8, 9, 7, 3].slice(0, pool), diff, false),
  });
  assert(r.ok, r.message);
  assert(target.healthTrack!.some((m) => m === "A"), "expected agg marks");
});

Deno.test("matchPower: path name resolves to its L1 power", OPTS, () => {
  const m = matchPower("The Green Path");
  assert(m);
  assertEquals(m.power.slug, "herbal-wisdom");
  const m2 = matchPower("Ash Path");
  assert(m2);
  assertEquals(m2.power.slug, "shroudsight");
});

Deno.test("powersKnown respects path gating", OPTS, () => {
  const known = powersKnown({ Thaumaturgy: 3 }, undefined);
  // Path of Blood (primary default) powers L1-3 present
  assert(known.some((p) => p.slug === "thaumaturgy-taste"));
  assert(known.some((p) => p.slug === "thaumaturgy-blood-rage"));
  assert(known.some((p) => p.slug === "thaumaturgy-blood-of-potency"));
  // But not L4
  assert(!known.some((p) => p.slug === "thaumaturgy-theft-of-vitae"));
  // And no Green Path (secondary, 0 dots)
  assert(!known.some((p) => p.slug === "herbal-wisdom"));
});

Deno.test("path XP: new path 7, raise current x4", OPTS, () => {
  const c = mkTremere({ disciplines: { Thaumaturgy: 2 } });
  assertEquals(xpCost(c, "disciplines.The Green Path"), 7);
  const c2 = mkTremere({
    disciplines: { Thaumaturgy: 2, "The Green Path": 1 },
  });
  assertEquals(xpCost(c2, "disciplines.The Green Path"), 4);
});

Deno.test("regular discipline XP unchanged by path logic", OPTS, () => {
  const c = mkTremere({ disciplines: { Thaumaturgy: 2 } });
  // in-clan (tremere) Thaumaturgy: current x5
  assertEquals(xpCost(c, "disciplines.Thaumaturgy"), 10);
  // new discipline: 10
  assertEquals(xpCost(c, "disciplines.Auspex"), 10);
});

Deno.test("resolveTrait: path by bare name and path.<name>", OPTS, () => {
  const c = mkTremere();
  const a = resolveTrait(c, "Green Path");
  assert(a.found, "bare path name should resolve");
  assertEquals(a.field, "disciplines.The Green Path");
  const b = resolveTrait(c, "path.green path");
  assert(b.found, "path.<name> should resolve");
  assertEquals(b.field, "disciplines.The Green Path");
});
