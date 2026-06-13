// Parses the free-form `special` string on a weapon entry into a structured
// set of mechanical flags consumed by the attack pipeline.
//
// The string is delimited by commas or semicolons and may contain any of the
// CofD 2e / Hurt Locker weapon traits. Unknown tokens are ignored, so older
// entries with prose descriptions degrade gracefully.

export interface WeaponTags {
  /** n-again threshold to feed into executeRoll. 10 means default. */
  again: 8 | 9 | 10;
  /** Armor piercing rating: subtracted from target armor before damage. */
  armorPiercing: number;
  /** Reach rating: 1 = standard, 2 = polearm, 3 = whip-class. */
  reach: number;
  /** Burst-capable firearm. */
  autofire: boolean;
  /** Cannot be wielded one-handed (no /offhand). */
  twoHanded: boolean;
  /** Applies Stunned tilt on any hit. */
  stun: boolean;
  /** Applies Knocked Down tilt when net damage >= target Size. */
  knockdown: boolean;
  /** Throwable without ranged penalty. */
  aerodynamic: boolean;
  /** Always concealed under clothing (used by Investigation). */
  concealed: boolean;
  /** Blast radius in yards (grenades). 0 = no blast. */
  blast: number;
  /** Force rating (grenade damage success threshold). 0 = none. */
  force: number;
  /** Drawing/stowing takes an instant action (CofD 2e Slow trait). */
  slow: boolean;
  /** Smoke screen: no damage; applies Blinded tilt to those in the blast. */
  smoke: boolean;
  /** Fire effect: announced in output (no tilt key currently). */
  burning: boolean;
  /** Hint that this item is normally thrown (knives, shurikens, grenades). */
  thrown: boolean;
}

/** Returns a fresh defaults-only WeaponTags object. */
export function emptyTags(): WeaponTags {
  return { ...EMPTY };
}

const EMPTY: WeaponTags = {
  again: 10,
  armorPiercing: 0,
  reach: 1,
  autofire: false,
  twoHanded: false,
  stun: false,
  knockdown: false,
  aerodynamic: false,
  concealed: false,
  blast: 0,
  force: 0,
  slow: false,
  smoke: false,
  burning: false,
  thrown: false,
};

/**
 * Tokenize and recognize known traits. Case-insensitive. Tolerates commas,
 * semicolons, and "and" as delimiters.
 */
export function parseWeaponTags(special: string | undefined | null): WeaponTags {
  if (!special) return { ...EMPTY };
  const tags: WeaponTags = { ...EMPTY };

  const tokens = special
    .split(/[,;]|\sand\s/i)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  for (const tok of tokens) {
    // Numbered traits: "armor piercing 2", "reach 3", "blast 10", "force 3".
    let m: RegExpMatchArray | null;
    if ((m = tok.match(/^armor[\s-]piercing\s+(\d+)/))) {
      tags.armorPiercing = parseInt(m[1], 10);
      continue;
    }
    if ((m = tok.match(/^reach\s+(\d+)/))) {
      tags.reach = parseInt(m[1], 10);
      continue;
    }
    if ((m = tok.match(/^blast\s+(\d+)/))) {
      tags.blast = parseInt(m[1], 10);
      continue;
    }
    if ((m = tok.match(/^force\s+(\d+)/))) {
      tags.force = parseInt(m[1], 10);
      continue;
    }

    // Flag traits.
    switch (tok) {
      case "9-again":
      case "9 again":
        tags.again = 9;
        break;
      case "8-again":
      case "8 again":
        tags.again = 8;
        break;
      case "autofire":
        tags.autofire = true;
        break;
      case "two-handed":
      case "two handed":
        tags.twoHanded = true;
        break;
      case "stun":
        tags.stun = true;
        break;
      case "knockdown":
        tags.knockdown = true;
        break;
      case "aerodynamic":
        tags.aerodynamic = true;
        break;
      case "concealed":
        tags.concealed = true;
        break;
      case "slow":
        tags.slow = true;
        break;
      case "smoke":
        tags.smoke = true;
        break;
      case "burning":
      case "incendiary":
        tags.burning = true;
        break;
      case "thrown":
        tags.thrown = true;
        break;
    }
  }

  return tags;
}

/**
 * Blast damage resolution for AoE attacks.
 *   attacker successes > target Stamina -> full force damage
 *   attacker successes == target Stamina -> floor(force / 2)
 *   attacker successes < target Stamina -> 0 (target evaded)
 * Stun-only grenades (force == 0) deal no damage but still register a hit.
 */
export function computeBlastDamage(
  attackerSuccesses: number,
  targetStamina: number,
  force: number,
): number {
  if (attackerSuccesses <= 0) return 0;
  if (force <= 0) return 0;
  if (attackerSuccesses > targetStamina) return force;
  if (attackerSuccesses === targetStamina) return Math.floor(force / 2);
  return 0;
}
