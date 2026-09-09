// tests/eq_template.test.ts -- captureEqTemplate of core/eq.ts.
//
// These are pure-function tests; the @eq/copy and @eq/give command wiring is
// exercised manually against a live server. This file locks down what a
// template captures (static eq fields + name/desc + verb attrs) and, just as
// importantly, what it must NOT capture (live-state flags that are per-holder).

import { assertEquals } from "@std/assert";
import { captureEqTemplate } from "../core/eq.ts";

// deno-lint-ignore no-explicit-any
function item(state: Record<string, any>): any {
  return { id: "i1", name: "Silver Klaive", state };
}

// deno-lint-ignore no-explicit-any
function bare(state: Record<string, any>): any {
  return { id: "i1", state };
}

Deno.test("captureEqTemplate: copies static eq fields", () => {
  const src = item({
    kind: "weapon",
    weaponType: "melee",
    damage: 4,
    damageType: "L",
    silver: true,
    armorRating: 1,
    concealability: "T",
    description: "A klaive of iron and silver that hums.",
  });
  const p = captureEqTemplate(src);
  assertEquals(p.name, "Silver Klaive");
  assertEquals(p.desc, "A klaive of iron and silver that hums.");
  assertEquals(p.eq?.kind, "weapon");
  assertEquals(p.eq?.weaponType, "melee");
  assertEquals(p.eq?.damage, 4);
  assertEquals(p.eq?.damageType, "L");
  assertEquals(p.eq?.silver, true);
  assertEquals(p.eq?.armorRating, 1);
  assertEquals(p.eq?.concealability, "T");
});

Deno.test("captureEqTemplate: excludes live-state flags", () => {
  const src = item({
    kind: "weapon",
    weaponType: "melee",
    damage: 3,
    damageType: "L",
    worn: true,
    wielded: true,
    concealed: false,
    fetishActive: true,
    talenSpent: true,
  });
  const p = captureEqTemplate(src);
  // Live-state must NOT leak into the template.
  assertEquals(p.eq?.worn, undefined);
  assertEquals(p.eq?.wielded, undefined);
  assertEquals(p.eq?.concealed, undefined);
  assertEquals(p.eq?.fetishActive, undefined);
  assertEquals(p.eq?.talenSpent, undefined);
  // Static fields still captured.
  assertEquals(p.eq?.kind, "weapon");
  assertEquals(p.eq?.damage, 3);
});

Deno.test("captureEqTemplate: captures verb attrs from state.attributes", () => {
  const src = item({
    kind: "weapon",
    weaponType: "melee",
    damage: 4,
    attributes: [
      { name: "succ", value: "The blade sings its hunger back to you." },
      { name: "osucc", value: "'s klaive hums with an answering note." },
      { name: "kind", value: "weapon" }, // non-verb attr is ignored for verbs
    ],
  });
  const p = captureEqTemplate(src);
  assertEquals(p.verbs?.SUCC, "The blade sings its hunger back to you.");
  assertEquals(p.verbs?.OSUCC, "'s klaive hums with an answering note.");
  // Only the six verb attrs are captured, not arbitrary attrs.
  assertEquals(p.verbs?.KIND, undefined);
  // eq still populated from state fields, not attributes.
  assertEquals(p.eq?.kind, "weapon");
});

Deno.test("captureEqTemplate: empty template when nothing set", () => {
  const p = captureEqTemplate(bare({}));
  assertEquals(p.name, undefined);
  assertEquals(p.desc, undefined);
  assertEquals(p.eq, undefined);
  assertEquals(p.verbs, undefined);
});