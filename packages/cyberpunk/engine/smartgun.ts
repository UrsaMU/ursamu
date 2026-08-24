/**
 * Smartgun Link enforcement (CPR Core p.346).
 *
 * Smart ammo is homing — but only when paired with a Smartgun Link cyberware
 * (or a Smartgun-Linked weapon). Without the link, smart rounds do not home.
 *
 * Plugin ruling (documented for the GM):
 *   - allowed: true with penalty 0  → link present, full smart behavior.
 *   - allowed: true with penalty -2 → no link; smart rounds behave as Basic
 *     AND the attacker takes -2 to hit (the homing fights the shooter).
 *
 * INTEGRATION NOTE for the final wiring step:
 *   commands/combat.ts, in the +attack handler, AFTER `ammoType` is resolved
 *   (currently around the `const ammoType: AmmoType = (weapon ...` block,
 *   ~line 278) and BEFORE `resolveAttack(...)` is called (~line 283):
 *
 *     import { checkSmartgunLink } from "../engine/smartgun.ts";
 *     const sg = checkSmartgunLink(cpr, ammoType);
 *     if (!sg.allowed) { u.send(`${ERR}${sg.reason}`); return; }
 *     // pass sg.penalty into resolveAttack via `luckSpend: sg.penalty` is
 *     // wrong — add it to attackerSkill instead, e.g.
 *     //   attackerSkill: attackSkill + targetingScopeBonus + sg.penalty,
 *     // and downgrade ammoType to "basic" for the resolve call when the
 *     // penalty path is taken (so SP isn't halved by accident).
 */

import type { ICPRCharacter } from "../db/schemas.ts";
import { type AmmoType, requiresSmartgunLink } from "../data/ammo.ts";

export interface ISmartgunCheck {
  allowed: boolean;
  penalty: number;
  /** When penalty is applied, ammo should be treated as this fallback type. */
  fallbackAmmo?: AmmoType;
  reason?: string;
}

/** Catalog slug is subdermal_grip; legacy/tests use smartgun_link. */
const SMARTGUN_CYBERWARE = new Set([
  "smartgun_link",
  "subdermal_grip",
]);

export const hasSmartgunLink = (
  cpr: Pick<ICPRCharacter, "cyberware">,
): boolean =>
  (cpr.cyberware ?? []).some((cw) =>
    SMARTGUN_CYBERWARE.has(String(cw.name || "").toLowerCase())
  );

/**
 * Pure check. Returns whether the attack can proceed and any penalty.
 *
 * - Non-smart ammo: always allowed, penalty 0.
 * - Smart + link installed: allowed, penalty 0.
 * - Smart + no link: allowed with penalty -2, fallback to "basic" ammo
 *   semantics (no homing, no AP halving). Caller documents this to user.
 */
export const checkSmartgunLink = (
  cpr: Pick<ICPRCharacter, "cyberware">,
  ammoType: AmmoType,
): ISmartgunCheck => {
  if (!requiresSmartgunLink(ammoType)) {
    return { allowed: true, penalty: 0 };
  }
  if (hasSmartgunLink(cpr)) {
    return { allowed: true, penalty: 0 };
  }
  return {
    allowed: true,
    penalty: -2,
    fallbackAmmo: "basic",
    reason:
      "Smart ammo requires a Smartgun Link cyberware. " +
      "Treating as Basic; -2 to hit.",
  };
};
