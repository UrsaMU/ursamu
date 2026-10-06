/** Supplement rules: templates, powers, prereqs, sensing. */
import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  clearTemplate,
  setTemplate,
} from "../src/template.ts";
import { powerSignatures, maskVerdict, resolveSense } from "../src/sensing.ts";
import { prereqMissing, validateQuality } from "../src/validation.ts";
import { formatCg, STEPS } from "../src/cg.ts";
import { qualitySpent } from "../src/rules.ts";
import { blankChar, readChar, type ICinChar } from "../src/types.ts";

function hero(): ICinChar {
  const c = blankChar();
  c.type = "hero";
  c.status = "draft";
  c.attrs.dexterity = 5;
  c.attrs.strength = 3;
  c.attrs.constitution = 3;
  c.attrs.intelligence = 3;
  c.attrs.perception = 3;
  c.attrs.willpower = 3;
  c.dramaPoints = 10;
  return c;
}

Deno.test("vampire template — bonus, weaknesses, granted HK, 12 pts", () => {
  const c = hero();
  assertEquals(setTemplate(c, "Vampire"), null);
  assertEquals(c.attrBonus, { strength: 3, dexterity: 2, constitution: 2 });
  assertEquals(c.weaknesses, "Blood, daylight, undead");
  assertEquals(c.qualities.some((e) => e.granted), true);
  assertEquals(qualitySpent(c), 12);
});

Deno.test("lycanthrope template — 10 pts, granted regeneration", () => {
  const c = hero();
  setTemplate(c, "Lycanthrope");
  assertEquals(qualitySpent(c), 10);
  assertEquals(c.attrBonus, { strength: 2, constitution: 2 });
  const regen = c.qualities.find((e) => e.slug === "regeneration");
  assertEquals(regen?.granted, true);
});

Deno.test("clear template drops package", () => {
  const c = hero();
  setTemplate(c, "Vampire");
  clearTemplate(c);
  assertEquals(c.template, "");
  assertEquals(c.attrBonus, {});
  assertEquals(c.weaknesses, "");
  assertEquals(c.qualities.length, 0);
});

Deno.test("power attrBonus layers onto template bonus", () => {
  const c = hero();
  setTemplate(c, "Vampire");
  c.qualities.push({ slug: "master-vampire", level: 1, note: "" });
  setTemplate(c, "Vampire"); // re-apply recomputes
  assertEquals(c.attrBonus.willpower, 1);
});

Deno.test("prereqs — necromancer lists all missing", () => {
  const c = hero();
  const errors = prereqMissing(c, {
    q: "animator",
    qLevel: ["animation", 3],
    attr: ["willpower", 4],
    skill: ["occultism", 3],
  });
  assertEquals(errors.length, 4);
});

Deno.test("powers are quality-side only", () => {
  assertEquals(validateQuality("sorcery", "quality"), true);
  assertEquals(
    typeof validateQuality("sorcery", "drawback"),
    "string",
  );
  assertEquals(validateQuality("animator", "quality"), true);
});

Deno.test("mask verdict — ties to target, narrow win partial", () => {
  assertEquals(maskVerdict(16, 16), "surface");
  assertEquals(maskVerdict(14, 16), "surface");
  assertEquals(maskVerdict(17, 16), "partial");
  assertEquals(maskVerdict(18, 16), "partial");
  assertEquals(maskVerdict(19, 16), "full");
});

Deno.test("signatures derive from purchases", () => {
  const c = hero();
  c.qualities = [
    { slug: "vampire", level: 1, note: "" },
    { slug: "master-vampire", level: 1, note: "" },
    { slug: "telepathy", level: 1, note: "" },
  ];
  const sigs = powerSignatures(c);
  assertEquals(sigs.includes("Vampire"), true);
  assertEquals(sigs.includes("Master Vampire"), true);
  assertEquals(sigs.includes("Telepathy"), true);
});

Deno.test("masked failure never leaks signatures", () => {
  const sensor = hero();
  const target = hero();
  target.qualities = [
    { slug: "vampire", level: 1, note: "" },
    { slug: "master-vampire", level: 1, note: "" },
    { slug: "mask", level: 2, note: "" },
  ];
  target.mask = { active: true, aspects: [], impression: "" };
  const r = resolveSense(sensor, target, 2, 9);
  assertEquals(r.verdict, "surface");
  assertEquals(r.message.includes("Master Vampire"), false);
  assertEquals(r.message.includes("Nothing beyond"), true);
});

Deno.test("unmasked target reveals signatures", () => {
  const sensor = hero();
  const target = hero();
  target.qualities = [{ slug: "vampire", level: 1, note: "" }];
  const r = resolveSense(sensor, target, 9, 0);
  assertStringIncludes(r.message, "Vampire");
  assertEquals(r.masked, false);
});

Deno.test("chargen is 10 steps; screens render", () => {
  assertEquals(STEPS.length, 10);
  const c = hero();
  for (const step of [3, 7, 8]) {
    c.step = step;
    const out = formatCg("Riley", c);
    assertStringIncludes(out, `STEP ${step}:`);
  }
  c.step = 3;
  assertStringIncludes(formatCg("Riley", c), "SUPERNATURAL TYPES");
});

Deno.test("mask state defaults for legacy chars", () => {
  const c = readChar({ cinematic: { step: 2 } });
  assertEquals(c.mask.active, false);
  assertEquals(c.step, 2);
});
