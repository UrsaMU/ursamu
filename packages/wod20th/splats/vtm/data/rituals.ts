// splats/vtm/data/rituals.ts -- V20 blood-magic ritual catalog.
//
// Casting: Intelligence + Occult, difficulty 3 + ritual level (max 9);
// 5 minutes per level unless noted (V20 p.230). Necromantic rituals are
// "otherwise identical to Thaumaturgy rituals" (V20 p.177).

export type RitualSchool = "thaumaturgy" | "necromancy";
export type RitualEffect = "flag" | "roll_pose" | "opposed";

export interface IRitualDef {
  slug: string;
  name: string;
  school: RitualSchool;
  level: number;
  /** Blood points spent to cast. */
  bloodCost: number;
  /** Casting time override (default: "5 min/level"). */
  castTime?: string;
  effect: RitualEffect;
  /** For effect "flag": powerFlags key/value applied to the caster. */
  flagKey?: string;
  flagValue?: boolean | number | string;
  /** For effect "damage": bashing dice applied (Tempesta Scudo etc. use
   *  narrative flags instead; only Dead Man's Hand-style rituals deal
   *  direct damage, and those are left to ST). */
  blurb: string;
  components?: string;
  book: string;
}

function r(def: IRitualDef): IRitualDef {
  return def;
}

// ---------------------------------------------------------------------------
// Thaumaturgical rituals (V20 p.230-240)
// ---------------------------------------------------------------------------
export const THAUMATURGY_RITUALS: readonly IRitualDef[] = [
  // -- Level One -------------------------------------------------------------
  r({
    slug: "bind-the-accusing-tongue",
    name: "Bind the Accusing Tongue",
    school: "thaumaturgy",
    level: 1,
    bloodCost: 0,
    effect: "roll_pose",
    blurb:
      "Lay a compulsion on a subject preventing him from speaking ill of you.",
    components: "Picture/effigy of target, lock of hair, black silken cord.",
    book: "V20 p.230",
  }),
  r({
    slug: "blood-rush",
    name: "Blood Rush",
    school: "thaumaturgy",
    level: 1,
    bloodCost: 0,
    castTime: "1 turn",
    effect: "flag",
    flagKey: "bloodRush",
    flagValue: true,
    blurb:
      "Resist hunger-based frenzy for up to one hour without feeding.",
    components: "Fang of a predatory animal carried on your person.",
    book: "V20 p.230",
  }),
  r({
    slug: "communicate-with-kindred-sire",
    name: "Communicate with Kindred Sire",
    school: "thaumaturgy",
    level: 1,
    bloodCost: 0,
    castTime: "30 minutes",
    effect: "roll_pose",
    blurb:
      "Speak telepathically with your sire over any distance (10 min/success).",
    components: "An item once owned by your sire.",
    book: "V20 p.230",
  }),
  r({
    slug: "defense-of-the-sacred-haven",
    name: "Defense of the Sacred Haven",
    school: "thaumaturgy",
    level: 1,
    bloodCost: 1,
    castTime: "1 hour",
    effect: "flag",
    flagKey: "sacredHaven",
    flagValue: true,
    blurb:
      "Prevent sunlight from entering a 20-foot radius while you remain within.",
    components: "Sigils drawn in your own blood on windows and doors.",
    book: "V20 p.230",
  }),
  r({
    slug: "deflection-of-wooden-doom",
    name: "Deflection of Wooden Doom",
    school: "thaumaturgy",
    level: 1,
    bloodCost: 0,
    castTime: "1 hour",
    effect: "flag",
    flagKey: "deflectionOfWoodenDoom",
    flagValue: true,
    blurb:
      "The first stake that would pierce your heart disintegrates (until dawn/dusk).",
    components: "Circle of wood; a wooden splinter held under the tongue.",
    book: "V20 p.231",
  }),
  r({
    slug: "devils-touch",
    name: "Devil's Touch",
    school: "thaumaturgy",
    level: 1,
    bloodCost: 0,
    effect: "roll_pose",
    blurb:
      "Curse a mortal: all who meet him treat him as loathsome (one night).",
    components: "A penny placed on the subject's person.",
    book: "V20 p.231",
  }),
  r({
    slug: "domino-of-life",
    name: "Domino of Life",
    school: "thaumaturgy",
    level: 1,
    bloodCost: 0,
    effect: "flag",
    flagKey: "dominoOfLife",
    flagValue: true,
    blurb:
      "Simulate one human trait (eat, breathe, warm flesh) for one night; +1 die to pass as human.",
    components: "A vial of fresh human blood carried on your person.",
    book: "V20 p.231",
  }),
  r({
    slug: "engaging-the-vessel-of-transference",
    name: "Engaging the Vessel of Transference",
    school: "thaumaturgy",
    level: 1,
    bloodCost: 1,
    castTime: "3 hours",
    effect: "roll_pose",
    blurb:
      "Enchant a container that swaps its blood for the holder's on touch.",
    components: "A cup-to-jug-sized container; 1 BP sealed inside.",
    book: "V20 p.231",
  }),
  r({
    slug: "illuminate-the-trail-of-prey",
    name: "Illuminate the Trail of Prey",
    school: "thaumaturgy",
    level: 1,
    bloodCost: 0,
    effect: "flag",
    flagKey: "illuminateTrail",
    flagValue: true,
    blurb: "The subject's trail glows visibly only to you.",
    components: "White satin ribbon (owned 24+ hours), burned.",
    book: "V20 p.231",
  }),
  r({
    slug: "incantation-of-the-shepherd",
    name: "Incantation of the Shepherd",
    school: "thaumaturgy",
    level: 1,
    bloodCost: 0,
    effect: "roll_pose",
    blurb: "Mystically locate every member of your Herd.",
    components: "A glass object held to each eye.",
    book: "V20 p.232",
  }),
  r({
    slug: "purity-of-flesh",
    name: "Purity of Flesh",
    school: "thaumaturgy",
    level: 1,
    bloodCost: 1,
    effect: "roll_pose",
    blurb:
      "Purge your body of all foreign material: drugs, poison, bullets, ink.",
    components: "Bare earth or stone; a circle of 13 sharp stones.",
    book: "V20 p.232",
  }),
  r({
    slug: "wake-with-evenings-freshness",
    name: "Wake with Evening's Freshness",
    school: "thaumaturgy",
    level: 1,
    bloodCost: 0,
    effect: "flag",
    flagKey: "wakeWithEvening",
    flagValue: true,
    blurb:
      "Awaken instantly at any sign of danger, ignoring daytime pool limits for 2 turns.",
    components: "Ashes of burned feathers spread over the sleeping area.",
    book: "V20 p.232",
  }),
  r({
    slug: "widows-spite",
    name: "Widow's Spite",
    school: "thaumaturgy",
    level: 1,
    bloodCost: 0,
    effect: "roll_pose",
    blurb: "Cause a pain, itch, or other minor sensation in the subject.",
    components: "A wax or cloth doll resembling the target.",
    book: "V20 p.232",
  }),

  // -- Level Two -------------------------------------------------------------
  r({
    slug: "blood-walk",
    name: "Blood Walk",
    school: "thaumaturgy",
    level: 2,
    bloodCost: 0,
    castTime: "3 hours",
    effect: "roll_pose",
    blurb:
      "Trace a subject's lineage and blood bonds from a blood sample (1 generation/success).",
    components: "One blood point from the subject.",
    book: "V20 p.232",
  }),
  r({
    slug: "burning-blade",
    name: "Burning Blade",
    school: "thaumaturgy",
    level: 2,
    bloodCost: 3,
    effect: "flag",
    flagKey: "burningBlade",
    flagValue: true,
    blurb:
      "Enchant a melee weapon to deal aggravated damage (one attack/success).",
    components: "Cut palm (1 lethal, unsoakable); 3 BP absorbed by weapon.",
    book: "V20 p.232",
  }),
  r({
    slug: "donning-the-mask-of-shadows",
    name: "Donning the Mask of Shadows",
    school: "thaumaturgy",
    level: 2,
    bloodCost: 0,
    effect: "flag",
    flagKey: "maskOfShadows",
    flagValue: true,
    blurb:
      "Render subjects translucent and muffled (hours = successes; pierced by Auspex 3+).",
    book: "V20 p.233",
  }),
  r({
    slug: "eyes-of-the-night-hawk",
    name: "Eyes of the Night Hawk",
    school: "thaumaturgy",
    level: 2,
    bloodCost: 0,
    effect: "roll_pose",
    blurb: "See and hear through a predatory bird (until sunrise).",
    components: "A predatory bird, touched; its eyes put out at the end.",
    book: "V20 p.233",
  }),
  r({
    slug: "machine-blitz",
    name: "Machine Blitz",
    school: "thaumaturgy",
    level: 2,
    bloodCost: 0,
    effect: "roll_pose",
    blurb: "Machines go haywire while you concentrate.",
    components: "A scrap of rusted metal.",
    book: "V20 p.233",
  }),
  r({
    slug: "principal-focus-of-vitae-infusion",
    name: "Principal Focus of Vitae Infusion",
    school: "thaumaturgy",
    level: 2,
    bloodCost: 1,
    effect: "roll_pose",
    blurb:
      "Imbue a small object with 1 BP, released on mental command.",
    components: "An object small enough to carry in both hands.",
    book: "V20 p.234",
  }),
  r({
    slug: "recure-of-the-homeland",
    name: "Recure of the Homeland",
    school: "thaumaturgy",
    level: 2,
    bloodCost: 2,
    effect: "roll_pose",
    blurb:
      "Heal 1 aggravated wound with a paste of native earth and blood (self only, 1/night).",
    components: "A handful of dirt from your mortal birthplace.",
    book: "V20 p.234",
  }),
  r({
    slug: "ward-versus-ghouls",
    name: "Ward versus Ghouls",
    school: "thaumaturgy",
    level: 2,
    bloodCost: 1,
    castTime: "10 minutes (+10 hours to set)",
    effect: "flag",
    flagKey: "wardVsGhouls",
    flagValue: true,
    blurb:
      "Ward an object: ghouls touching it suffer 3 dice lethal and must spend WP.",
    components: "1 BP poured over the object.",
    book: "V20 p.234",
  }),
  r({
    slug: "warding-circle-versus-ghouls",
    name: "Warding Circle versus Ghouls",
    school: "thaumaturgy",
    level: 2,
    bloodCost: 3,
    castTime: "normal (short-term) or 1 night (year-and-a-day)",
    effect: "flag",
    flagKey: "wardingCircleGhouls",
    flagValue: true,
    blurb:
      "Ward a circle (10-ft radius default): blocks ghouls; 3 dice bashing to press in.",
    components: "3 BP of mortal blood per 10 feet of radius.",
    book: "V20 p.234",
  }),

  // -- Level Three -----------------------------------------------------------
  r({
    slug: "clinging-of-the-insect",
    name: "Clinging of the Insect",
    school: "thaumaturgy",
    level: 3,
    bloodCost: 0,
    effect: "flag",
    flagKey: "clingingOfTheInsect",
    flagValue: true,
    blurb: "Cling to walls and ceilings like a spider (one scene).",
    components: "A live spider held under the tongue.",
    book: "V20 p.235",
  }),
  r({
    slug: "flesh-of-fiery-touch",
    name: "Flesh of Fiery Touch",
    school: "thaumaturgy",
    level: 3,
    bloodCost: 0,
    castTime: "2 hours",
    effect: "flag",
    flagKey: "fleshOfFieryTouch",
    flagValue: true,
    blurb:
      "Anyone who voluntarily touches your flesh suffers 1 aggravated burn (until sunset).",
    components: "Swallow a small glowing ember (1 agg, soakable).",
    book: "V20 p.235",
  }),
  r({
    slug: "incorporeal-passage",
    name: "Incorporeal Passage",
    school: "thaumaturgy",
    level: 3,
    bloodCost: 0,
    effect: "flag",
    flagKey: "incorporealPassage",
    flagValue: true,
    blurb:
      "Become immaterial: pass through walls, immune to physical attack (hours = successes).",
    components: "A shard from a shattered mirror.",
    book: "V20 p.236",
  }),
  r({
    slug: "mirror-of-second-sight",
    name: "Mirror of Second Sight",
    school: "thaumaturgy",
    level: 3,
    bloodCost: 1,
    effect: "roll_pose",
    blurb:
      "Enchant a mirror to reflect true forms: Lupines, magi, ghosts, True Faith.",
    components: "An oval mirror (4-18 in); 1 BP.",
    book: "V20 p.236",
  }),
  r({
    slug: "pavis-of-foul-presence",
    name: "Pavis of Foul Presence",
    school: "thaumaturgy",
    level: 3,
    bloodCost: 0,
    effect: "flag",
    flagKey: "pavisOfFoulPresence",
    flagValue: true,
    blurb:
      "Presence powers used on you reverse onto their user (effects = successes, or until sunrise).",
    components: "A length of blue silken cord worn around the neck.",
    book: "V20 p.236",
  }),
  r({
    slug: "sanguine-assistant",
    name: "Sanguine Assistant",
    school: "thaumaturgy",
    level: 3,
    bloodCost: 5,
    effect: "roll_pose",
    blurb:
      "Conjure a foot-tall loyal servant from workshop clutter (nights = successes).",
    components: "A specially prepared earthen bowl; 5 BP.",
    book: "V20 p.236",
  }),
  r({
    slug: "shaft-of-belated-quiescence",
    name: "Shaft of Belated Quiescence",
    school: "thaumaturgy",
    level: 3,
    bloodCost: 3,
    castTime: "5 hours",
    effect: "roll_pose",
    blurb:
      "Enchant a rowan stake: its tip burrows toward the victim's heart once embedded.",
    components: "Rowan-wood stake; 3 BP; blackened in an oak-wood fire.",
    book: "V20 p.237",
  }),
  r({
    slug: "ward-versus-lupines",
    name: "Ward versus Lupines",
    school: "thaumaturgy",
    level: 3,
    bloodCost: 0,
    effect: "flag",
    flagKey: "wardVsLupines",
    flagValue: true,
    blurb: "As Ward versus Ghouls, but affects werewolves.",
    components: "A handful of silver dust.",
    book: "V20 p.237",
  }),

  // -- Level Four ------------------------------------------------------------
  r({
    slug: "bone-of-lies",
    name: "Bone of Lies",
    school: "thaumaturgy",
    level: 4,
    bloodCost: 10,
    effect: "roll_pose",
    blurb:
      "Enchant a mortal bone: its holder cannot lie (10 lies before it's spent).",
    components: "A bone at least 200 years old; 10 BP.",
    book: "V20 p.237",
  }),
  r({
    slug: "firewalker",
    name: "Firewalker",
    school: "thaumaturgy",
    level: 4,
    bloodCost: 0,
    effect: "flag",
    flagKey: "firewalker",
    flagValue: true,
    blurb: "Soak fire with Stamina (+ Fortitude) for one hour.",
    components: "Cut off and burn the end of one finger (WP roll).",
    book: "V20 p.238",
  }),
  r({
    slug: "heart-of-stone",
    name: "Heart of Stone",
    school: "thaumaturgy",
    level: 4,
    bloodCost: 0,
    castTime: "9 hours",
    effect: "flag",
    flagKey: "heartOfStone",
    flagValue: true,
    blurb:
      "Heart turns to stone: stake-immune, but Conscience/Empathy drop to 1 and Social pools halve.",
    components: "Lie naked on stone; a candle burns down over your heart (1 agg).",
    book: "V20 p.238",
  }),
  r({
    slug: "splinter-servant",
    name: "Splinter Servant",
    school: "thaumaturgy",
    level: 4,
    bloodCost: 0,
    castTime: "12 hours",
    effect: "roll_pose",
    blurb:
      "Enchant a stake that animates and attacks on command (5 combat turns/success).",
    components: "Stake from a tree nourished on the dead; wax-sealed nightshade twine.",
    book: "V20 p.238",
  }),
  r({
    slug: "ward-versus-kindred",
    name: "Ward versus Kindred",
    school: "thaumaturgy",
    level: 4,
    bloodCost: 1,
    effect: "flag",
    flagKey: "wardVsKindred",
    flagValue: true,
    blurb: "As Ward versus Ghouls, but affects vampires.",
    components: "1 BP of your own blood.",
    book: "V20 p.238",
  }),

  // -- Level Five ------------------------------------------------------------
  r({
    slug: "blood-contract",
    name: "Blood Contract",
    school: "thaumaturgy",
    level: 5,
    bloodCost: 1,
    castTime: "3 nights",
    effect: "roll_pose",
    blurb:
      "Create an unbreakable agreement; only completing the terms or burning it ends it.",
    components: "Contract written in caster's blood; signers each spend 1 BP.",
    book: "V20 p.239",
  }),
  r({
    slug: "enchant-talisman",
    name: "Enchant Talisman",
    school: "thaumaturgy",
    level: 5,
    bloodCost: 28,
    castTime: "6 hours/night for one full moon",
    effect: "roll_pose",
    blurb:
      "Create a talisman: +2 dice primary path, +1 ritual rolls, +1 to hit.",
    components: "A rigid yard-long object; 1 BP/night; Int+Occult extended (20 successes).",
    book: "V20 p.239",
  }),
  r({
    slug: "escape-to-a-true-friend",
    name: "Escape to a True Friend",
    school: "thaumaturgy",
    level: 5,
    bloodCost: 18,
    castTime: "6 hours/night for 6 nights",
    effect: "roll_pose",
    blurb:
      "Create a circle that teleports you to your truest friend on speaking their name.",
    components: "Yard-wide charred circle; 3 BP per night.",
    book: "V20 p.239",
  }),
  r({
    slug: "paper-flesh",
    name: "Paper Flesh",
    school: "thaumaturgy",
    level: 5,
    bloodCost: 0,
    effect: "opposed",
    blurb:
      "Curse: subject's Stamina and Fortitude drop to 1 for one night (elders keep some).",
    components: "Subject's true name inscribed on paper, used to cut yourself, burned.",
    book: "V20 p.240",
  }),
  r({
    slug: "ward-versus-spirits",
    name: "Ward versus Spirits",
    school: "thaumaturgy",
    level: 5,
    bloodCost: 0,
    effect: "flag",
    flagKey: "wardVsSpirits",
    flagValue: true,
    blurb: "As Ward versus Ghouls, but affects spirits on both planes.",
    components: "A handful of pure sea salt.",
    book: "V20 p.240",
  }),
  r({
    slug: "ward-versus-ghosts",
    name: "Ward versus Ghosts",
    school: "thaumaturgy",
    level: 5,
    bloodCost: 0,
    effect: "flag",
    flagKey: "wardVsGhosts",
    flagValue: true,
    blurb: "As Ward versus Ghouls, but affects ghosts on both planes.",
    components: "A handful of powdered marble from a tombstone.",
    book: "V20 p.240",
  }),
  r({
    slug: "ward-versus-demons",
    name: "Ward versus Demons",
    school: "thaumaturgy",
    level: 5,
    bloodCost: 0,
    effect: "flag",
    flagKey: "wardVsDemons",
    flagValue: true,
    blurb: "As Ward versus Ghouls, but affects demons on both planes.",
    components: "A vial of holy water.",
    book: "V20 p.240",
  }),
];

// ---------------------------------------------------------------------------
// Necromantic rituals (V20 p.177-184)
// ---------------------------------------------------------------------------
export const NECROMANCY_RITUALS: readonly IRitualDef[] = [
  // -- Level One -------------------------------------------------------------
  r({
    slug: "call-of-the-hungry-dead",
    name: "Call of the Hungry Dead",
    school: "necromancy",
    level: 1,
    bloodCost: 0,
    castTime: "10 minutes",
    effect: "roll_pose",
    blurb:
      "The victim hears snatches of conversation from across the Shroud (maddening).",
    components: "A hair from the target's head, burned in a black candle.",
    book: "V20 p.177",
  }),
  r({
    slug: "eldritch-beacon",
    name: "Eldritch Beacon",
    school: "necromancy",
    level: 1,
    bloodCost: 0,
    castTime: "15 minutes",
    effect: "roll_pose",
    blurb:
      "A wax sphere marks its carrier with a glowing aura in the Shadowlands (1 hour/success).",
    components: "A green candle's wax molded into a sphere.",
    book: "V20 p.177",
  }),
  r({
    slug: "insight",
    name: "Insight",
    school: "necromancy",
    level: 1,
    bloodCost: 0,
    effect: "roll_pose",
    blurb:
      "Stare into a corpse's eyes to see its last moments (successes = clarity).",
    book: "V20 p.177",
  }),
  r({
    slug: "knowing-stone",
    name: "Knowing Stone",
    school: "necromancy",
    level: 1,
    bloodCost: 1,
    effect: "flag",
    flagKey: "knowingStone",
    flagValue: true,
    blurb:
      "Mark a spirit on a consecrated stone; learn its whereabouts by trance (until All Saints Day).",
    components: "A consecrated stone painted with the target's name in vitae.",
    book: "V20 p.177",
  }),
  r({
    slug: "minestra-di-morte",
    name: "Minestra di Morte",
    school: "necromancy",
    level: 1,
    bloodCost: 1,
    effect: "roll_pose",
    blurb:
      "Eat a stew of vitae and dead flesh to learn if the subject became a wraith or Spectre.",
    components: "A piece of a dead body, rosemary, basil, salt.",
    book: "V20 p.178",
  }),
  r({
    slug: "ritual-of-the-smoking-mirror",
    name: "Ritual of the Smoking Mirror",
    school: "necromancy",
    level: 1,
    bloodCost: 1,
    effect: "flag",
    flagKey: "smokingMirror",
    flagValue: true,
    blurb:
      "Gaze into an obsidian mirror: read auras (Lifesight) or see ghosts (Deathsight) for one scene.",
    components: "An obsidian mirror with a sharpened edge.",
    book: "V20 p.178",
  }),

  // -- Level Two -------------------------------------------------------------
  r({
    slug: "eyes-of-the-grave",
    name: "Eyes of the Grave",
    school: "necromancy",
    level: 2,
    bloodCost: 0,
    castTime: "2 hours",
    effect: "roll_pose",
    blurb:
      "The target suffers intermittent visions of her own death for a week.",
    components: "A pinch of soil from a fresh grave.",
    book: "V20 p.179",
  }),
  r({
    slug: "the-hand-of-glory",
    name: "The Hand of Glory",
    school: "necromancy",
    level: 2,
    bloodCost: 0,
    castTime: "a fortnight",
    effect: "roll_pose",
    blurb:
      "Create a mummified hand whose lit fingers put a household's mortals to sleep.",
    components: "Severed hand of a condemned murderer; fat of a hanged man.",
    book: "V20 p.179",
  }),
  r({
    slug: "occhio-duomo-morto",
    name: "Occhio d'Uomo Morto",
    school: "necromancy",
    level: 2,
    bloodCost: 0,
    effect: "flag",
    flagKey: "occhioDUomoMorto",
    flagValue: true,
    blurb:
      "Replace your eye with a corpse's: permanent Shroudsight; -1 Appearance.",
    components: "An eye from a corpse whose soul became a ghost; incense; new moon.",
    book: "V20 p.179",
  }),
  r({
    slug: "puppet",
    name: "Puppet",
    school: "necromancy",
    level: 2,
    bloodCost: 0,
    castTime: "1 hour",
    effect: "roll_pose",
    blurb:
      "Prepare a subject as a receptacle: wraiths possessing them gain +2 automatic successes (one night).",
    components: "Grave soil smeared on eyes, lips, and forehead.",
    book: "V20 p.179",
  }),
  r({
    slug: "the-ritual-of-pochtli",
    name: "The Ritual of Pochtli",
    school: "necromancy",
    level: 2,
    bloodCost: 0,
    effect: "roll_pose",
    blurb:
      "Group casting: participating necromancers pool successes on one path or ritual.",
    components: "Blasphemous symbols carved into a restrained mortal vessel.",
    book: "V20 p.180",
  }),
  r({
    slug: "two-centimes",
    name: "Two Centimes",
    school: "necromancy",
    level: 2,
    bloodCost: 0,
    effect: "roll_pose",
    blurb:
      "Send a mortal's soul to walk the Underworld while they report back.",
    components: "Pennies laid on the subject's eyes.",
    book: "V20 p.180",
  }),

  // -- Level Three -----------------------------------------------------------
  r({
    slug: "blood-dance",
    name: "Blood Dance",
    school: "necromancy",
    level: 3,
    bloodCost: 0,
    castTime: "2 hours",
    effect: "roll_pose",
    blurb:
      "Let a ghost communicate with a living relative for one hour.",
    components: "Colored sands and ocean salt poured in a precise pattern.",
    book: "V20 p.180",
  }),
  r({
    slug: "divine-sign",
    name: "Divine Sign",
    school: "necromancy",
    level: 3,
    bloodCost: 0,
    effect: "roll_pose",
    blurb:
      "Predict a target's next course of action from their birth date; acts as a ghostly fetter.",
    book: "V20 p.180",
  }),
  r({
    slug: "din-of-the-damned",
    name: "Din of the Damned",
    school: "necromancy",
    level: 3,
    bloodCost: 0,
    castTime: "30 minutes",
    effect: "flag",
    flagKey: "dinOfTheDamned",
    flagValue: true,
    blurb:
      "Ward a room against eavesdropping: listeners hear only ghostly wailing (one night).",
    components: "An unbroken line of crematorium ash along the room's walls.",
    book: "V20 p.180",
  }),
  r({
    slug: "nightmare-drums",
    name: "Nightmare Drums",
    school: "necromancy",
    level: 3,
    bloodCost: 1,
    effect: "roll_pose",
    blurb:
      "Send the dead to haunt an enemy's dreams, driving them slowly insane.",
    components: "A personal possession of the target's, coated in blood and burned; drums of human skin.",
    book: "V20 p.180",
  }),
  r({
    slug: "ritual-of-the-unearthed-fetter",
    name: "Ritual of the Unearthed Fetter",
    school: "necromancy",
    level: 3,
    bloodCost: 0,
    castTime: "3 hours",
    effect: "roll_pose",
    blurb:
      "Attune a ghost's finger bone to locate one of its fetters.",
    components: "A finger bone of the ghost; a chip of gravestone.",
    book: "V20 p.181",
  }),
  r({
    slug: "tempesta-scudo",
    name: "Tempesta Scudo",
    school: "necromancy",
    level: 3,
    bloodCost: 1,
    castTime: "1 combat turn",
    effect: "flag",
    flagKey: "tempestaScudo",
    flagValue: true,
    blurb:
      "Fast ward: ghosts within your blood circle act at +2 difficulty.",
    components: "Bite your own lip (1 bashing) and spit blood in a circle.",
    book: "V20 p.181",
  }),

  // -- Level Four ------------------------------------------------------------
  r({
    slug: "baleful-doll",
    name: "Baleful Doll",
    school: "necromancy",
    level: 4,
    bloodCost: 0,
    castTime: "4-5 hours",
    effect: "roll_pose",
    blurb:
      "Craft a spirit-linked doll: injuring it deals 6 dice bashing; destroying it, 6 dice lethal.",
    components: "Handcrafted doll painted with your blood, dressed in the victim's unwashed clothing.",
    book: "V20 p.181",
  }),
  r({
    slug: "bastone-diabolico",
    name: "Bastone Diabolico",
    school: "necromancy",
    level: 4,
    bloodCost: 0,
    effect: "roll_pose",
    blurb:
      "Create a 'devil stick' that drains a ghost's Passion and deals agg to the walking dead.",
    components: "A leg bone removed from a living donor, dipped in rune-inscribed lead.",
    book: "V20 p.181",
  }),
  r({
    slug: "cadavers-touch",
    name: "Cadaver's Touch",
    school: "necromancy",
    level: 4,
    bloodCost: 0,
    castTime: "3 hours",
    effect: "roll_pose",
    blurb:
      "Turn a mortal target into a corpselike ruin (+2 Social difficulties) until the wax solidifies.",
    components: "A wax doll in the target's shape, melted.",
    book: "V20 p.182",
  }),
  r({
    slug: "peek-past-the-shroud",
    name: "Peek Past the Shroud",
    school: "necromancy",
    level: 4,
    bloodCost: 0,
    castTime: "1 hour",
    effect: "roll_pose",
    blurb:
      "Enchant ergot mold: a pinch grants Shroudsight for hours (3 doses/success).",
    components: "A handful of ergot fungi mold.",
    book: "V20 p.182",
  }),
  r({
    slug: "ritual-of-xipe-totec",
    name: "Ritual of Xipe Totec",
    school: "necromancy",
    level: 4,
    bloodCost: 1,
    effect: "roll_pose",
    blurb:
      "Flay a victim and wear their skin as a flawless disguise (1 BP/night to maintain).",
    components: "Obsidian dagger; ceremonial golden bowl; octli and amaranth.",
    book: "V20 p.182",
  }),

  // -- Level Five ------------------------------------------------------------
  r({
    slug: "chill-of-oblivion",
    name: "Chill of Oblivion",
    school: "necromancy",
    level: 5,
    bloodCost: 0,
    castTime: "12 hours",
    effect: "flag",
    flagKey: "chillOfOblivion",
    flagValue: true,
    blurb:
      "Treat fire agg as lethal and extinguish flames with Willpower; aura shows false diablerie veins.",
    components: "A one-foot cube of ice melted on the subject's chest.",
    book: "V20 p.183",
  }),
  r({
    slug: "dead-mans-hand",
    name: "Dead Man's Hand",
    school: "necromancy",
    level: 5,
    bloodCost: 2,
    effect: "roll_pose",
    blurb:
      "A blood-stained rag in a severed hand rots the victim alive, health level by health level.",
    components: "Rag stained with the victim's blood, sweat, or tears; a freshly severed hand.",
    book: "V20 p.183",
  }),
  r({
    slug: "esilio",
    name: "Esilio",
    school: "necromancy",
    level: 5,
    bloodCost: 1,
    castTime: "5 syllables",
    effect: "flag",
    flagKey: "esilio",
    flagValue: true,
    blurb:
      "Open a vortex in your own body that shreds ghosts clutched to your chest (1 WP; successes = spirits destroyed).",
    book: "V20 p.183",
  }),
];

export const ALL_RITUALS: readonly IRitualDef[] = [
  ...THAUMATURGY_RITUALS,
  ...NECROMANCY_RITUALS,
];

const BY_SLUG: ReadonlyMap<string, IRitualDef> = new Map(
  ALL_RITUALS.map((rit) => [rit.slug, rit]),
);

export function getRitual(slugOrName: string): IRitualDef | undefined {
  const q = slugOrName.toLowerCase().trim();
  const direct = BY_SLUG.get(q);
  if (direct) return direct;
  return ALL_RITUALS.find(
    (rit) =>
      rit.name.toLowerCase() === q ||
      rit.name.toLowerCase().startsWith(q) ||
      rit.slug.replace(/-/g, " ") === q,
  );
}

export function ritualsForSchool(school: RitualSchool): IRitualDef[] {
  return ALL_RITUALS.filter((rit) => rit.school === school);
}
