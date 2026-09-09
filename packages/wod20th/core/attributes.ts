// core/attributes.ts -- Canonical WoD20 attribute and ability lists.
// Shared by ALL splats (wta, vtm, mortal, kinfolk).
// Never duplicated in splat data files.

export const ATTRIBUTE_GROUPS = {
  physical: ["Strength", "Dexterity", "Stamina"],
  social:   ["Charisma", "Manipulation", "Appearance"],
  mental:   ["Perception", "Intelligence", "Wits"],
} as const;

export type AttributeGroup = keyof typeof ATTRIBUTE_GROUPS;
export type AttributeName =
  typeof ATTRIBUTE_GROUPS[AttributeGroup][number];

export const ALL_ATTRIBUTES: readonly AttributeName[] = [
  ...ATTRIBUTE_GROUPS.physical,
  ...ATTRIBUTE_GROUPS.social,
  ...ATTRIBUTE_GROUPS.mental,
];

export const ABILITY_GROUPS = {
  talents: [
    "Alertness", "Athletics", "Brawl", "Empathy",
    "Expression", "Intimidation", "Leadership", "Primal-Urge",
    "Streetwise", "Subterfuge",
  ],
  skills: [
    "Animal-Ken", "Crafts", "Drive", "Etiquette", "Firearms",
    "Larceny", "Melee", "Performance", "Stealth", "Survival",
  ],
  knowledges: [
    "Academics", "Computer", "Enigmas", "Investigation", "Law",
    "Medicine", "Occult", "Rituals", "Science", "Technology",
  ],
} as const;

export type AbilityGroup = keyof typeof ABILITY_GROUPS;
export type AbilityName =
  typeof ABILITY_GROUPS[AbilityGroup][number];

export const ALL_ABILITIES: readonly AbilityName[] = [
  ...ABILITY_GROUPS.talents,
  ...ABILITY_GROUPS.skills,
  ...ABILITY_GROUPS.knowledges,
];

/** Traits where a specialty may be chosen below 4 dots. */
export const SPECIALTY_OVERRIDE_LIST = ["Expression", "Crafts"] as const;

/** Attribute specialty suggestions from WtA 20th Ed p.117. */
export const ATTRIBUTE_SPECIALTY_SUGGESTIONS: Readonly<Record<AttributeName, string[]>> = {
  Strength:     ["Steely Grip", "Lower Body", "Lifting"],
  Dexterity:    ["Lightning Reflexes", "Preternatural Grace", "Fine Manipulation"],
  Stamina:      ["Unbreakable", "Tireless", "Resilient"],
  Charisma:     ["Air of Confidence", "Captivating", "Inspiring"],
  Manipulation: ["Forked Tongue", "Unswerving Logic", "Subtlety"],
  Appearance:   ["Genial", "Exotic", "Alluring", "Noble Bearing"],
  Perception:   ["Eyes in the Back of Your Head", "Farsighted", "Keen Nose"],
  Intelligence: ["Lateral Problem Solver", "Creative Logic", "Analytical"],
  Wits:         ["Snappy Retorts", "Cool-Headed", "Cunning"],
};

/** Valid category names for attrs.priority and abilities.priority. */
export const ATTR_CATEGORY_NAMES: readonly AttributeGroup[] = ["physical", "social", "mental"];
export const ABIL_CATEGORY_NAMES: readonly AbilityGroup[]   = ["talents", "skills", "knowledges"];

/**
 * Permanent attribute floor. Chargen records store *extra* dots above
 * this base; +chargen/set Strength=3 means final rating 3 → store 2.
 */
export const ATTR_BASE = 1;

/** Attribute allocation: extra dots above base-1 per priority tier. */
export const ATTR_ALLOC = { primary: 7, secondary: 5, tertiary: 3 } as const;

/** Ability allocation: dots per priority tier (abilities start at 0). */
export const ABIL_ALLOC = { primary: 13, secondary: 9, tertiary: 5 } as const;

/**
 * Effective attribute dots: ATTR_BASE + stored extra + blood-buff.
 * Chargen/DB store extras; rolls and sheets use this total.
 */
export function effectiveAttr(
  char: {
    attributes?: Record<string, number>;
    bloodBuff?: Partial<Record<"Strength" | "Dexterity" | "Stamina", number>>;
  },
  name: string,
): number {
  const q = name.toLowerCase();
  // Chargen stores extra dots above ATTR_BASE.
  let base = ATTR_BASE;
  for (const [k, v] of Object.entries(char.attributes ?? {})) {
    if (k.toLowerCase() === q && typeof v === "number") {
      base = ATTR_BASE + v;
      break;
    }
  }
  let bonus = 0;
  for (const [k, v] of Object.entries(char.bloodBuff ?? {})) {
    if (k.toLowerCase() === q && typeof v === "number") {
      bonus = v;
      break;
    }
  }
  return Math.max(0, base + bonus);
}

/** Returns the group name for a given attribute, or undefined if not found. */
export function attrGroup(name: string): AttributeGroup | undefined {
  const lower = name.toLowerCase();
  for (const [group, attrs] of Object.entries(ATTRIBUTE_GROUPS)) {
    if ((attrs as readonly string[]).some((a) => a.toLowerCase() === lower)) {
      return group as AttributeGroup;
    }
  }
  return undefined;
}

/** Returns the group name for a given ability, or undefined if not found. */
export function abilGroup(name: string): AbilityGroup | undefined {
  const lower = name.toLowerCase();
  for (const [group, abils] of Object.entries(ABILITY_GROUPS)) {
    if ((abils as readonly string[]).some((a) => a.toLowerCase() === lower)) {
      return group as AbilityGroup;
    }
  }
  return undefined;
}

/**
 * Canonical attribute name. Exact match first, then unique prefix
 * (e.g. "dex" → Dexterity, "str" → Strength). Ambiguous prefixes miss.
 */
export function canonicalAttr(name: string): AttributeName | undefined {
  const lower = name.toLowerCase().trim();
  if (!lower) return undefined;
  const exact = ALL_ATTRIBUTES.find((a) => a.toLowerCase() === lower);
  if (exact) return exact;
  const hits = ALL_ATTRIBUTES.filter((a) =>
    a.toLowerCase().startsWith(lower)
  );
  return hits.length === 1 ? hits[0] : undefined;
}

/**
 * Canonical ability name. Exact match first, then unique prefix
 * (e.g. "ath" → Athletics). Ambiguous prefixes miss.
 */
export function canonicalAbil(name: string): AbilityName | undefined {
  const lower = name.toLowerCase().trim();
  if (!lower) return undefined;
  const exact = ALL_ABILITIES.find((a) => a.toLowerCase() === lower);
  if (exact) return exact;
  const hits = ALL_ABILITIES.filter((a) =>
    a.toLowerCase().startsWith(lower)
  );
  return hits.length === 1 ? hits[0] : undefined;
}

/** Levenshtein distance for "did you mean?" suggestions. */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Returns up to 3 closest trait names from ALL_ATTRIBUTES + ALL_ABILITIES
 * for a "did you mean?" suggestion.
 */
export function closestTraits(input: string, limit = 3): string[] {
  const lower = input.toLowerCase();
  const all = [...ALL_ATTRIBUTES, ...ALL_ABILITIES];
  return all
    .map((t) => ({ t, d: levenshtein(lower, t.toLowerCase()) }))
    .filter(({ d }) => d <= 3)
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map(({ t }) => t);
}
