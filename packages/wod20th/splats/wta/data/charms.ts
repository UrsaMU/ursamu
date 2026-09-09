// splats/wta/data/charms.ts -- WtA Spirit Charm catalog.
//
// Mechanical data for the charm strings referenced in splats/wta/data/spirits.ts.
// Spirit defs list charms as flavor strings; this catalog is parallel and adds
// activation cost / contested roll / duration / description per W20 pp.322-325
// ("The Spirit World"). Shape mirrors IGiftAction so the +spirit/invoke handler
// can reuse familiar pool/cost/duration plumbing.
//
// Slug is lowercase kebab; lookups are own-property only (prototype-pollution
// safe). Not every flavor charm in spirits.ts has a canon W20 rule -- those
// remain unmatched and are returned as flavor by charmsForSpirit().

import type { ISpiritDef } from "../../../core/types.ts";

export interface ICharmCost {
  gnosis?: number;
  willpower?: number;
  rage?: number;
  power?: number;
}

export interface ICharmRoll {
  /** Pool expression -- usually a single Trait name (Gnosis, Rage, Willpower)
   *  or a combined trait like "Gnosis+Willpower". Parseable shape only. */
  pool: string;
  /** Difficulty 2..10. */
  difficulty?: number;
}

export interface ISpiritCharm {
  slug: string;
  name: string;
  cost?: ICharmCost;
  roll?: ICharmRoll;
  duration?: "instant" | "turn" | "scene" | "permanent" | string;
  description: string;
  /** Catalog hint: spirit slugs that typically have this charm (informational). */
  ofSpirit?: string[];
}

const charm = (
  slug: string,
  name: string,
  description: string,
  extras: Partial<Omit<ISpiritCharm, "slug" | "name" | "description">> = {},
): ISpiritCharm => ({ slug, name, description, ...extras });

// -- Catalog ----------------------------------------------------------------

export const WTA_CHARMS: Record<string, ISpiritCharm> = {
  // -- Universals (all spirits) ---------------------------------------------
  "airt-sense": charm(
    "airt-sense", "Airt Sense",
    "Sense the currents of the Umbra, locate moon-bridges, and orient toward " +
      "any known landmark in the spirit world.",
    { cost: { power: 1 }, duration: "scene" },
  ),
  "re-form": charm(
    "re-form", "Re-form",
    "After being destroyed (Power reduced to 0), the spirit reforms in its " +
      "home realm over a span of days equal to its original Power.",
    { duration: "permanent" },
  ),
  "materialize": charm(
    "materialize", "Materialize",
    "Cross the Gauntlet and take corporeal form. Power spent buys equivalent " +
      "physical traits per W20 p.323 chart.",
    { cost: { power: 7 }, duration: "scene" },
  ),

  // -- Common active charms --------------------------------------------------
  "realm-sense": charm(
    "realm-sense", "Realm Sense",
    "Identify the nature, age, and dominant resonance of any spirit realm or " +
      "locus the spirit currently inhabits.",
    { cost: { power: 1 }, duration: "turn" },
  ),
  "healing": charm(
    "healing", "Healing",
    "Heal one Health Level of Bashing or Lethal damage on a touched target. " +
      "Aggravated requires an extended cost.",
    { cost: { power: 5 }, duration: "permanent" },
  ),
  "tracking": charm(
    "tracking", "Tracking",
    "Lock onto a known target and pursue across the Gauntlet. Roll vs target's " +
      "Willpower to maintain lock if they actively evade.",
    { cost: { power: 1 }, roll: { pool: "Gnosis", difficulty: 7 }, duration: "scene" },
  ),
  "blast-flame": charm(
    "blast-flame", "Blast (Flame)",
    "Hurl a gout of spirit fire. Roll Rage; each success inflicts one Aggravated " +
      "Health Level on a target within line of sight.",
    { cost: { power: 1 }, roll: { pool: "Rage", difficulty: 7 }, duration: "instant" },
    ),
  "blast-frost": charm(
    "blast-frost", "Blast (Frost)",
    "Lash out with biting cold. Roll Rage; each success inflicts one Lethal " +
      "Health Level and reduces the target's next-turn dice pool by 1.",
    { cost: { power: 1 }, roll: { pool: "Rage", difficulty: 7 }, duration: "instant" },
  ),
  "blast-lightning": charm(
    "blast-lightning", "Blast (Lightning)",
    "Strike with a bolt of spirit lightning. Roll Rage at difficulty 7; each " +
      "success inflicts one Lethal Health Level, ignoring half of mundane armor.",
    { cost: { power: 1 }, roll: { pool: "Rage", difficulty: 7 }, duration: "instant" },
  ),
  "armor": charm(
    "armor", "Armor",
    "Manifest spirit armor; soak pool gains +3 dice against Bashing and Lethal " +
      "(no soak vs Aggravated unless the spirit normally soaks Aggravated).",
    { cost: { power: 2 }, duration: "scene" },
  ),
  "open-moon-bridge": charm(
    "open-moon-bridge", "Open Moon Bridge",
    "Open a moon-bridge connecting two caerns. Caster supplies destination caern " +
      "name; bridge stays open for one scene.",
    { cost: { power: 5, gnosis: 1 }, roll: { pool: "Gnosis", difficulty: 8 }, duration: "scene" },
  ),
  "possession": charm(
    "possession", "Possession",
    "Take control of a willing or unwilling mortal vessel. Contested by target's " +
      "Willpower; spirit's net successes equal the duration in turns.",
    { cost: { power: 3 }, roll: { pool: "Gnosis", difficulty: 8 }, duration: "scene" },
  ),
  "shapeshift": charm(
    "shapeshift", "Shapeshift",
    "Alter the spirit's outward form into another shape of equal or lesser Power. " +
      "Stats remain the spirit's; appearance and movement mode shift.",
    { cost: { power: 1 }, duration: "scene" },
  ),
  "spirit-speech": charm(
    "spirit-speech", "Spirit Speech",
    "Speak with any spirit regardless of realm or affinity. Universal lingua " +
      "franca; bypasses normal communication barriers.",
    { duration: "scene" },
  ),
  "iron-will": charm(
    "iron-will", "Iron Will",
    "Resist mental influence; the spirit's Willpower pool gains +3 dice against " +
      "domination, hypnosis, or Mind effects until the end of the scene.",
    { cost: { power: 1 }, duration: "scene" },
  ),
  "updraft": charm(
    "updraft", "Updraft",
    "Summon a rising column of wind. Carries up to one mortal-mass target per " +
      "Power spent; Willpower roll to halt or redirect.",
    { cost: { power: 2 }, duration: "scene" },
  ),
  "solidify-reality": charm(
    "solidify-reality", "Solidify Reality",
    "Anchor a Penumbral object into the material world (or vice versa) for one " +
      "scene per success.",
    { cost: { power: 4 }, roll: { pool: "Gnosis", difficulty: 8 }, duration: "scene" },
  ),
  "influence-weather": charm(
    "influence-weather", "Influence (Weather)",
    "Shape local weather over an area: shift wind, summon rain, dispel fog. " +
      "Scope grows with successes.",
    { cost: { power: 3 }, roll: { pool: "Gnosis", difficulty: 7 }, duration: "scene" },
  ),
  "influence-electricity": charm(
    "influence-electricity", "Influence (Electricity)",
    "Manipulate electrical currents: kill power, surge a circuit, redirect a " +
      "lightning strike within line of sight.",
    { cost: { power: 2 }, roll: { pool: "Gnosis", difficulty: 7 }, duration: "scene" },
  ),
  "influence-plants": charm(
    "influence-plants", "Influence (Plants)",
    "Command nearby flora: knot vines, accelerate growth, force a tree to bear " +
      "or shed fruit out of season.",
    { cost: { power: 2 }, roll: { pool: "Gnosis", difficulty: 7 }, duration: "scene" },
  ),
  "berserker-rage": charm(
    "berserker-rage", "Berserker Rage",
    "Grant a touched target one round of frenzy-like fury: +2 dice to Brawl and " +
      "Melee pools, but no defensive actions allowed.",
    { cost: { power: 2 }, duration: "scene" },
  ),
  "corruption": charm(
    "corruption", "Corruption",
    "Whisper Wyrm-thoughts into a target's mind. Contested by Willpower; each " +
      "net success adds one die to the next degeneration roll.",
    { cost: { power: 2 }, roll: { pool: "Gnosis", difficulty: 8 }, duration: "scene" },
  ),
  "web-sense": charm(
    "web-sense", "Web Sense",
    "Read the Pattern Web within line of sight: trace bindings, identify Weaver " +
      "constructs, sense recent disturbances.",
    { cost: { power: 1 }, duration: "scene" },
  ),
  "short-out": charm(
    "short-out", "Short Out",
    "Disable an electronic device by touch. Complex machines roll their rating " +
      "vs the spirit's Gnosis; simple devices fail outright.",
    { cost: { power: 1 }, roll: { pool: "Gnosis", difficulty: 6 }, duration: "scene" },
  ),
  "venom": charm(
    "venom", "Venom",
    "A successful bite or strike injects spirit-venom: target loses 1 die from " +
      "all pools per turn for (spirit's Gnosis) turns.",
    { cost: { power: 1 }, roll: { pool: "Rage", difficulty: 7 }, duration: "scene" },
  ),
  "trickster-mask": charm(
    "trickster-mask", "Trickster's Mask",
    "Assume the appearance of a known mortal or spirit. Contested by Perception " +
      "+ Alertness at difficulty (spirit's Gnosis).",
    { cost: { power: 2 }, roll: { pool: "Gnosis", difficulty: 7 }, duration: "scene" },
  ),
  "trample": charm(
    "trample", "Trample",
    "Charge through a line of opponents. Each target rolls Dex + Athletics " +
      "(diff 7) or takes Bashing equal to half the spirit's Power.",
    { cost: { power: 2 }, roll: { pool: "Rage", difficulty: 6 }, duration: "instant" },
  ),
  "wisdom-of-the-ages": charm(
    "wisdom-of-the-ages", "Wisdom of the Ages",
    "Recall any fact known to the spirit world that has any link to the topic at " +
      "hand. Storyteller arbitrates relevance per success.",
    { cost: { power: 2 }, roll: { pool: "Gnosis", difficulty: 7 }, duration: "scene" },
  ),
};

// -- Helpers ----------------------------------------------------------------

export function getCharm(slug: string): ISpiritCharm | undefined {
  if (typeof slug !== "string") return undefined;
  const key = slug.toLowerCase().trim();
  if (!key) return undefined;
  if (!Object.prototype.hasOwnProperty.call(WTA_CHARMS, key)) return undefined;
  return WTA_CHARMS[key];
}

export function allCharms(): ISpiritCharm[] {
  return Object.values(WTA_CHARMS);
}

/** Universal charms every spirit possesses per W20 p.323. */
export const UNIVERSAL_CHARMS: readonly string[] = [
  "airt-sense", "re-form", "materialize",
];

/** Map a free-text charm string (as used in ISpiritDef.charms) onto a catalog
 *  slug, when one exists. Returns null when no canon rule matches the flavor. */
function slugifyCharmName(s: string): string {
  return s.toLowerCase()
    .replace(/['']/g, "")
    .replace(/\(([^)]+)\)/g, "-$1") // "Blast (Flame)" -> "blast-flame"
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const NAME_ALIASES: Record<string, string> = {
  "lightning-bolt": "blast-lightning",
  "flame": "blast-flame",
  "freeze": "blast-frost",
  "sunlight": "blast-flame",
  "moon-phases": "shapeshift",
  "survival": "tracking",
  "wind-rush": "updraft",
  "root": "influence-plants",
  "trickster-s-mask": "trickster-mask",
  "trickster-mask": "trickster-mask",
};

/** Return the union of universal charms and slug-matched named charms for a
 *  given spirit. Output is the set of catalog ISpiritCharm entries; unmatched
 *  flavor strings on the spirit are dropped silently (call sites can still
 *  show the raw spirit.charms[] for flavor). */
export function charmsForSpirit(spiritDef: ISpiritDef): ISpiritCharm[] {
  const out = new Map<string, ISpiritCharm>();
  for (const slug of UNIVERSAL_CHARMS) {
    const c = getCharm(slug);
    if (c) out.set(slug, c);
  }
  const names = Array.isArray(spiritDef?.charms) ? spiritDef.charms : [];
  for (const raw of names) {
    if (typeof raw !== "string") continue;
    const direct = slugifyCharmName(raw);
    const slug = Object.prototype.hasOwnProperty.call(NAME_ALIASES, direct)
      ? NAME_ALIASES[direct]
      : direct;
    const found = getCharm(slug);
    if (found) out.set(found.slug, found);
  }
  return Array.from(out.values());
}
