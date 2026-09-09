// splats/wta/data/backgrounds.ts -- W20 Backgrounds catalog (WtA core, Ch 3).
//
// Read-only catalog used by +background and (eventually) chargen/xp
// validation. Today the chargen + xp paths accept free-text background
// names; this catalog gives them a canon to validate against.
//
// Each entry carries the canonical name, a short flavor description, and
// a dot ladder (1..5) describing what each dot represents -- the wording
// is paraphrased from W20 to fit a single help-page line.
//
// `restrictedTo` (when present) lists the tribe display names that
// canonically gate the background. Pure Breed is the headline case --
// the dot-ladder describes the Silver Fang interpretation, but any tribe
// may take it. Restrictions surface as informational notes in
// +background/info; hard restrictions still live on ITribeDef.
//
// Sources: W20 pp.157-167 (Backgrounds chapter).

export interface IBackgroundDef {
  /** kebab-case slug -- the lookup key. */
  slug: string;
  /** Canonical display name (matches ITribeDef.backgroundRestrictions strings). */
  name: string;
  /** One-to-two sentence flavor. */
  description: string;
  /** Dot ladder. Every level 1..5 must have a non-empty entry. */
  dots: { 1: string; 2: string; 3: string; 4: string; 5: string };
  /**
   * Tribes that canonically gate or strongly associate with this background.
   * Informational only; tribe-level hard-gates still live on ITribeDef.
   */
  restrictedTo?: string[];
  /** Optional design/lore note shown in +background/info. */
  notes?: string;
  /**
   * Recommend a free-text focus (who/what). Stored on
   * char.backgroundDetails[name]. Not required to set dots.
   */
  needsDetail?: boolean;
  detailLabel?: string;
}

const bg = (
  slug: string,
  name: string,
  description: string,
  dots: IBackgroundDef["dots"],
  restrictedTo?: string[],
  notes?: string,
  extra?: { needsDetail?: boolean; detailLabel?: string },
): IBackgroundDef => ({
  slug,
  name,
  description,
  dots,
  ...(restrictedTo ? { restrictedTo } : {}),
  ...(notes ? { notes } : {}),
  ...(extra?.needsDetail ? { needsDetail: true } : {}),
  ...(extra?.detailLabel ? { detailLabel: extra.detailLabel } : {}),
});

export const WTA_BACKGROUNDS: Record<string, IBackgroundDef> = {
  "allies": bg(
    "allies",
    "Allies",
    "Mortal (or kinfolk) friends who will come when called -- not employees, " +
    "not pets; people who trust you and answer the phone.",
    {
      1: "One competent ally with a useful skill or local clout.",
      2: "A small circle, or one ally with real influence.",
      3: "A reliable network -- several allies, or one heavyweight.",
      4: "Powerful and far-reaching; allies in multiple cities or fields.",
      5: "International or institutional -- allies whose names open doors.",
    },
    undefined,
    undefined,
    { needsDetail: true, detailLabel: "who (names/roles)" },
  ),

  "ancestors": bg(
    "ancestors",
    "Ancestors",
    "A spiritual line back to your forebears. Spend Gnosis to channel an " +
    "ancestor's Abilities for a scene; rolls difficulty 8.",
    {
      1: "One recent ancestor; modest Ability access.",
      2: "Several ancestors; broader Ability pool.",
      3: "A respected line; access to specialist knowledge.",
      4: "An ancient line; powerful figures answer the call.",
      5: "Legendary lineage stretching to the dawn-times of the Garou.",
    },
    undefined,
    "Bone Gnawers cannot take Ancestors at character creation (W20 p.158). " +
    "Silent Striders are forbidden by Wendigo's curse. Glass Walkers are " +
    "discouraged -- their forebears went into the cities.",
  ),

  "contacts": bg(
    "contacts",
    "Contacts",
    "Information sources -- people who answer questions but don't take " +
    "risks. Major contacts are named; minor contacts cover a field of expertise.",
    {
      1: "One major contact.",
      2: "Two major contacts.",
      3: "Three major contacts.",
      4: "Four major contacts.",
      5: "Five major contacts; minor contacts everywhere.",
    },
    undefined,
    undefined,
    { needsDetail: true, detailLabel: "field or names" },
  ),

  "fetish": bg(
    "fetish",
    "Fetish",
    "An object containing a bound spirit. Each dot is one Level of fetish, " +
    "or rated against Gnosis to bind multiple lesser items.",
    {
      1: "Level 1 fetish (or one talen).",
      2: "Level 2 fetish.",
      3: "Level 3 fetish.",
      4: "Level 4 fetish.",
      5: "Level 5 fetish -- a klaive, a Spirit-Tracker, an heirloom of the tribe.",
    },
    undefined,
    "Stargazers are discouraged from Fetish; they prefer to make their own. " +
    "Use +fetish to manage owned items; this background just gates starting dots.",
  ),

  "kinfolk": bg(
    "kinfolk",
    "Kinfolk",
    "Mortal or wolf relatives who know what you are. They shelter Garou, " +
    "raise cubs, and breed the next generation.",
    {
      1: "A handful of trustworthy kin.",
      2: "An extended family; perhaps a small settlement.",
      3: "Many kin, organized and useful.",
      4: "A broad kin network spanning regions.",
      5: "Vast kin support -- whole communities, or an old family of standing.",
    },
  ),

  "mentor": bg(
    "mentor",
    "Mentor",
    "An older Garou (or rarely, a powerful spirit) who teaches and " +
    "occasionally intervenes. Mentors expect respect and obedience.",
    {
      1: "A Cliath teacher with a little time for you.",
      2: "A Fostern of moderate standing.",
      3: "An Adren elder; respected, often busy.",
      4: "An Athro whose word carries across tribes.",
      5: "An Elder of legendary renown -- access is rare and earned.",
    },
    undefined,
    "Shadow Lords are discouraged from Mentor (their politics make trust " +
    "expensive). Glass Walkers similarly discouraged.",
    { needsDetail: true, detailLabel: "who" },
  ),

  "past-life": bg(
    "past-life",
    "Past Life",
    "Memories of previous incarnations. Spend Gnosis to draw on a past " +
    "life's Abilities or knowledge for a scene; some past lives are dangerous.",
    {
      1: "One recent past life, dimly remembered.",
      2: "Several past lives; clearer recall.",
      3: "Many past lives; access to specialist knowledge.",
      4: "Ancient memories reaching back centuries.",
      5: "Lifetimes upon lifetimes -- the danger of being lost in them grows.",
    },
    undefined,
    "M20 / Revised both treat Past Life as 1-5; canon is consistent here. " +
    "Spending Gnosis to invoke is the standard mechanism (W20 p.163).",
  ),

  "pure-breed": bg(
    "pure-breed",
    "Pure Breed",
    "A visible mark of unbroken Garou lineage. Other Garou treat the " +
    "well-bred with deference; on rank challenges, add Pure Breed dots as " +
    "bonus dice to Social and Renown rolls.",
    {
      1: "Noticeably well-bred; +1 die on Social rolls with Garou.",
      2: "Clearly of a respected line; +2 dice.",
      3: "Silver Fang minimum; striking heritage; +3 dice.",
      4: "An ancient bloodline; Garou recognize you on sight; +4 dice.",
      5: "A near-mythic pedigree; the ancestors stir at your approach; +5 dice.",
    },
    ["Silver Fangs"],
    "Silver Fangs require a minimum of 3 dots at chargen (enforced by tribe " +
    "restrictions). Bone Gnawers and Glass Walkers cannot take Pure Breed.",
  ),

  "resources": bg(
    "resources",
    "Resources",
    "Disposable wealth and standard of living. Each dot multiplies " +
    "monthly income and improves lodgings; 5 is heir-of-empires territory.",
    {
      1: "Working-class. Apartment, used car, ~$1,000/month spending.",
      2: "Middle class. Small house or condo, ~$3,000/month.",
      3: "Comfortable. Large house, two cars, ~$9,000/month.",
      4: "Wealthy. Mansion or penthouse, ~$30,000/month.",
      5: "Filthy rich. Multiple estates, jets, ~$250,000+/month.",
    },
    undefined,
    "Red Talons cannot take Resources -- they reject human economies. " +
    "Bone Gnawers, Silent Striders, Stargazers, and Wendigo are " +
    "discouraged. Glass Walkers thrive on it.",
  ),

  "rites": bg(
    "rites",
    "Rites",
    "Knowledge of formal Garou ceremonies. Each dot is one Level of rite " +
    "(Level 1 rite, or two minor rites per dot at staff discretion).",
    {
      1: "One Level 1 rite (or two minor rites).",
      2: "Up to Level 2 rites.",
      3: "Up to Level 3 rites.",
      4: "Up to Level 4 rites.",
      5: "Up to Level 5 rites -- the great rites are now within reach.",
    },
    undefined,
    "Use +rite/learn to record specific rites; this background gates the " +
    "starting pool of known rites at chargen.",
  ),

  "totem": bg(
    "totem",
    "Totem",
    "A pack-level background: a totem spirit binds to the whole pack and " +
    "offers boons in exchange for chiminage. Totem dots are pack-pooled.",
    {
      1: "A minor totem; small boons or single-realm influence.",
      2: "A respected totem of a sept's lesser-known spirits.",
      3: "A solid totem -- a recognized incarna's child.",
      4: "A powerful totem; substantial boons in its sphere.",
      5: "A great totem -- legendary tribal patron or major incarna's avatar.",
    },
    undefined,
    "Totem is pack-priced, not per-character: members pool dots to afford " +
    "the totem on character creation (W20 p.166). Use +pack/totem to bind " +
    "the chosen totem to a pack.",
  ),
};

/** Own-property guard -- never returns a prototype member. */
export function getBackground(slug: string): IBackgroundDef | undefined {
  const key = (slug ?? "").toLowerCase().trim();
  if (!key) return undefined;
  if (!Object.prototype.hasOwnProperty.call(WTA_BACKGROUNDS, key)) return undefined;
  return WTA_BACKGROUNDS[key];
}

export function allBackgrounds(): IBackgroundDef[] {
  return Object.values(WTA_BACKGROUNDS);
}
