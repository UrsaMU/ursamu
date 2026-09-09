// tests/wearwield_audit.test.ts -- /tdd-audit security pass for +wear,
// +remove, +wield, +sheathe.
//
// The exec bodies all funnel through:
//   1. resolveCarriedItem(u, arg)  -- exact-match first, substring fallback,
//      then ambient u.util.target as last resort.
//   2. carried-in-contents guard (+wear / +wield only).
//   3. kind guard via isArmor() / isWeapon().
//   4. live-state guard (already-worn / already-wielded, etc).
//   5. wieldedWeapons(u.me).length < MAX_WIELDED for +wield.
//
// Tests cover the pure pieces directly; the gate ordering is asserted via
// source-text regression guards.
import { assert, assertEquals, assertFalse } from "@std/assert";
import { describe, it } from "jsr:@std/testing@^1.0.0/bdd";

import {
  getEqMeta,
  isArmor,
  isWeapon,
  wieldedWeapons,
} from "../core/eq.ts";

const WEAR_SRC  = await Deno.readTextFile(new URL("../commands/wear.ts",  import.meta.url));
const WIELD_SRC = await Deno.readTextFile(new URL("../commands/wield.ts", import.meta.url));

// deno-lint-ignore no-explicit-any
function item(name: string, state: Record<string, unknown>): any {
  return { id: `i-${name}`, name, state, contents: [] };
}

// Mirror of findInContents() so we can exercise the ordering directly.
// deno-lint-ignore no-explicit-any
function findInContents(holder: any, q: string): any | undefined {
  // deno-lint-ignore no-explicit-any
  const items: any[] = Array.isArray(holder?.contents) ? holder.contents : [];
  const ql = q.toLowerCase();
  for (const it of items) {
    const raw = String(it?.state?.name ?? it?.name ?? "");
    const first = raw.split(";")[0]?.trim().toLowerCase();
    if (first === ql || raw.toLowerCase() === ql) return it;
  }
  for (const it of items) {
    const raw = String(it?.state?.name ?? it?.name ?? "").toLowerCase();
    if (raw.includes(ql)) return it;
  }
  return undefined;
}

describe("/tdd-audit +wear / +remove / +wield / +sheathe", () => {
  // -- W-1 wear rejects non-armor ---------------------------------------------
  it("W-1: +wear rejects items whose kind isn't armor/shield", () => {
    // pure: isArmor predicate
    assert(isArmor(item("jacket", { kind: "armor" })));
    assert(isArmor(item("shield", { kind: "shield" })));
    assertFalse(isArmor(item("sword", { kind: "weapon" })));
    assertFalse(isArmor(item("fetish", { kind: "fetish" })));
    assertFalse(isArmor(item("nothing", {})));

    // source guard: wear gates on isArmor with a clear refusal.
    assert(/isArmor\(item\)/.test(WEAR_SRC));
    assert(/That isn't armor or a shield/.test(WEAR_SRC));
  });

  // -- W-2 wield rejects non-weapon -------------------------------------------
  it("W-2: +wield rejects items whose kind isn't weapon", () => {
    assert(isWeapon(item("sword", { kind: "weapon" })));
    assertFalse(isWeapon(item("jacket", { kind: "armor" })));
    assertFalse(isWeapon(item("fetish", { kind: "fetish" })));
    assertFalse(isWeapon(item("misc", { kind: "misc" })));

    assert(/isWeapon\(item\)/.test(WIELD_SRC));
    assert(/That isn't a weapon/.test(WIELD_SRC));
  });

  // -- W-3 must be in u.me.contents -------------------------------------------
  it("W-3: +wear / +wield require the item to be in u.me.contents", () => {
    // Source: both must have an explicit contents.some(c.id === item.id) gate
    // AFTER resolveCarriedItem and BEFORE the kind check, so an ambient
    // resolution to e.g. a floor item still fails the gate.
    for (const [label, src] of [["wear", WEAR_SRC], ["wield", WIELD_SRC]] as const) {
      assert(
        /u\.me\.contents[\s\S]*?\.some\(/.test(src),
        `+${label} must verify item is in u.me.contents`,
      );
      assert(
        /You can only (wear|wield) what you are carrying/.test(src),
        `+${label} must surface a carry-refusal message`,
      );
      const carryIdx = src.indexOf("are carrying");
      const armorIdx = src.indexOf("isArmor(item)");
      const weaponIdx = src.indexOf("isWeapon(item)");
      const kindIdx = label === "wear" ? armorIdx : weaponIdx;
      assert(carryIdx > 0 && kindIdx > 0 && carryIdx < kindIdx,
        `+${label}: carry gate must precede kind gate`);
    }
  });

  // -- W-4 wield max-2 limit --------------------------------------------------
  it("W-4: +wield refuses a third concurrent weapon", () => {
    // Pure: wieldedWeapons sees only flagged weapons in contents.
    const a = item("a", { kind: "weapon", wielded: true });
    const b = item("b", { kind: "weapon", wielded: true });
    const c = item("c", { kind: "weapon", wielded: false });
    const holder = { id: "p", contents: [a, b, c] };
    assertEquals(wieldedWeapons(holder).length, 2);

    // Source: MAX_WIELDED constant remains 2 and is enforced.
    assert(/MAX_WIELDED\s*=\s*2/.test(WIELD_SRC));
    assert(/current\.length\s*>=\s*MAX_WIELDED/.test(WIELD_SRC));
    assert(/already wielding/.test(WIELD_SRC));
  });

  // -- W-5 idempotent +remove / +sheathe -------------------------------------
  it("W-5: +remove / +sheathe respond gracefully when already cleared", () => {
    // Source: both check the current flag and short-circuit with a message
    // BEFORE any $unset call (so they don't error or write redundantly).
    assert(/!getEqMeta\(item\)\.worn/.test(WEAR_SRC),
      "+remove must short-circuit if not currently worn");
    assert(/You aren't wearing that/.test(WEAR_SRC));

    assert(/!getEqMeta\(item\)\.wielded/.test(WIELD_SRC),
      "+sheathe must short-circuit if not currently wielded");
    assert(/You aren't wielding that/.test(WIELD_SRC));

    // And the inverse for +wear/+wield: don't re-write if already set.
    assert(/getEqMeta\(item\)\.worn[\s\S]{0,60}already wearing/.test(WEAR_SRC));
    assert(/getEqMeta\(item\)\.wielded[\s\S]{0,60}already wielding/.test(WIELD_SRC));
  });

  // -- W-6 name resolution: exact first, then substring ----------------------
  it("W-6: findInContents prefers exact (case-insensitive) match before substring", () => {
    const sword       = item("Sword",       { name: "Sword" });
    const swordBroken = item("Sword;broken",{ name: "Sword;broken" });
    const longsword   = item("Longsword",   { name: "Longsword" });
    const holder = { contents: [longsword, swordBroken, sword] };

    // 'sword' is an exact match for `sword` (and the first-alias of
    // 'Sword;broken' also matches), but the first exact hit wins
    // deterministically by iteration order.
    const hit = findInContents(holder, "sword");
    assert(hit, "must find something");
    // Whichever exact-name item comes first in contents wins -- but it MUST
    // be one of the exact matches, never 'Longsword' (substring-only).
    assert(hit.id === swordBroken.id || hit.id === sword.id,
      "exact-name match must beat the substring 'Longsword' hit");

    // Substring fallback when no exact match present.
    const onlyLong = { contents: [longsword] };
    assertEquals(findInContents(onlyLong, "sword")?.id, longsword.id);

    // Unknown query => undefined (no throw, no random pick).
    assertEquals(findInContents(holder, "zzznothing"), undefined);
  });

  // Bonus: live-state flags read direct (regression guard via getEqMeta).
  it("worn/wielded read from direct state, not attributes[]", () => {
    const tricked = item("jacket", {
      kind: "armor",
      worn: false,
      attributes: [{ name: "WORN", value: true }],
    });
    assertEquals(getEqMeta(tricked).worn, false);
  });
});
