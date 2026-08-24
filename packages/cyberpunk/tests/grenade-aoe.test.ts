/**
 * Tests — Grenade AoE per-target damage and save resolution.
 */
import { assert, assertEquals } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";
import { resolveGrenadeHit, resolveAoeSave } from "../engine/grenade.ts";
import { getWeapon } from "../data/weapons.ts";
import { defaultAmmoForWeaponType } from "../data/ammo.ts";

describe("resolveGrenadeHit() — frag grenade applies to all targets with AP", () => {
  it("3-target frag scenario: every target rolls damage with AP applied", () => {
    const frag = getWeapon("frag_grenade");
    assert(frag);
    const ammo = defaultAmmoForWeaponType(frag.type); // "armor_piercing"
    assertEquals(ammo, "armor_piercing");

    // Three targets with different SP tiers.
    const sps = [0, 11, 14]; // none, medium, heavy
    const results = sps.map((sp) =>
      resolveGrenadeHit({ damageDice: frag.damageDice, ammoType: ammo, defenderSp: sp })
    );

    // Each result is computed; none blocked (AP cannot be blocked).
    for (const r of results) {
      assertEquals(r.blockedByArmor, false);
      assert(r.rawDamage >= 0);
      assert(r.netDamage >= 0);
    }

    // Unarmored target takes more net damage than the heavy-armor one
    // most of the time — guarantee at least that the heavy SP reduces net
    // damage relative to the raw roll.
    const heavy = results[2];
    // AP halves SP 14 -> 7; net = raw - 7 (floor 0).
    assertEquals(heavy.netDamage, Math.max(0, heavy.rawDamage - 7));
  });

  it("rocket (AP default) vs metal armor: SP halved before reduction", () => {
    const rpg = getWeapon("rpg_a");
    assert(rpg);
    const r = resolveGrenadeHit({
      damageDice: rpg.damageDice,
      ammoType: "armor_piercing",
      defenderSp: 18, // metal tier
    });
    // SP 18 -> halved to 9; metal tier is NOT light/medium so raw not halved.
    assertEquals(r.netDamage, Math.max(0, r.rawDamage - 9));
  });
});

describe("resolveAoeSave() — flashbang triggers saves, not damage", () => {
  it("flashbang has aoeSave def and 0 damage dice (save-only)", () => {
    const fb = getWeapon("flashbang");
    assert(fb);
    assertEquals(fb.damageDice, 0);
    assert(fb.aoeSave);
    assertEquals(fb.aoeSave!.effect, "blinded");
    assertEquals(fb.aoeSave!.dv, 15);
    assertEquals(fb.aoeSave!.stat, "body");
  });

  it("save with very high stat passes DV15 the vast majority of the time", () => {
    let passes = 0;
    for (let i = 0; i < 100; i++) {
      const s = resolveAoeSave({ saveStatValue: 20, saveDV: 15 });
      if (s.success) passes++;
    }
    // Only natural-1 fumbles where extra >= 6 can drop below 15; rare.
    assert(passes >= 90, `expected >=90 passes, got ${passes}`);
  });

  it("save with BODY 0 against DV15 mostly fails (d10 max=10, crits possible)", () => {
    let fails = 0;
    for (let i = 0; i < 50; i++) {
      const s = resolveAoeSave({ saveStatValue: 0, saveDV: 15 });
      if (!s.success) fails++;
    }
    // Most rolls (non-crit) max at 10; should fail vs DV15 unless crit.
    assert(fails > 25);
  });
});
