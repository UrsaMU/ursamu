// tests/attack_weapons.test.ts -- pickWielded helper coverage for +attack
// weapon-required gating.
import { assert, assertEquals } from "@std/assert";
import { describe, it } from "jsr:@std/testing@^1.0.0/bdd";

import { pickWielded } from "../commands/attack.ts";

// deno-lint-ignore no-explicit-any
function item(name: string, state: Record<string, any>): any {
  return { id: "i-" + name, name, state, contents: [] };
}

// deno-lint-ignore no-explicit-any
function actor(contents: any[]): any {
  return { id: "actor", contents };
}

describe("pickWielded", () => {
  it("rejects /melee with no wielded melee weapon", () => {
    const a = actor([]);
    assertEquals(pickWielded(a, "melee"), undefined);
  });

  it("rejects /melee when only an unwielded sword is carried", () => {
    const a = actor([item("sword", { kind: "weapon", weaponType: "melee", damage: 2, damageType: "L" })]);
    assertEquals(pickWielded(a, "melee"), undefined);
  });

  it("returns the wielded melee weapon and exposes damage/damageType", () => {
    const sword = item("sword", { kind: "weapon", weaponType: "melee", damage: 3, damageType: "L", wielded: true });
    const a = actor([sword]);
    const found = pickWielded(a, "melee");
    assert(found);
    assertEquals(found.state.damage, 3);
    assertEquals(found.state.damageType, "L");
  });

  it("picks the first wielded weapon when multiple match", () => {
    const a = actor([
      item("axe",   { kind: "weapon", weaponType: "melee", damage: 2, damageType: "L", wielded: true }),
      item("knife", { kind: "weapon", weaponType: "melee", damage: 1, damageType: "L", wielded: true }),
    ]);
    const found = pickWielded(a, "melee");
    assertEquals(found?.name, "axe");
  });

  it("type mismatch: /firearms is rejected when only melee is wielded", () => {
    const a = actor([item("sword", { kind: "weapon", weaponType: "melee", damage: 2, damageType: "L", wielded: true })]);
    assertEquals(pickWielded(a, "firearms"), undefined);
  });

  it("propagates silver flag", () => {
    const silverBlade = item("silver dagger", {
      kind: "weapon", weaponType: "melee", damage: 2, damageType: "L",
      wielded: true, silver: true,
    });
    const a = actor([silverBlade]);
    const found = pickWielded(a, "melee");
    assertEquals(found?.state.silver, true);
  });

  it("ignores non-weapon items even if marked wielded", () => {
    const a = actor([item("torch", { kind: "tool", wielded: true })]);
    assertEquals(pickWielded(a, "melee"), undefined);
  });
});
