// splats/wta/data/rites.ts -- WtA Rites (levels 1-5).
// Source: M20 Werewolf core, Rites chapter. Keyed by lowercase slug.
// Each entry: name, level (1-5), category, optional difficulty, short description.
// When uncertain about a rite's canonical level, the entry is omitted rather
// than guessed at.

export type RiteCategory =
  | "mystic"
  | "minor"
  | "seasonal"
  | "accord"
  | "caern"
  | "death"
  | "renown"
  | "punishment"
  | "passage";

export interface IRiteDef {
  name: string;
  level: 1 | 2 | 3 | 4 | 5;
  category: RiteCategory;
  /** Roll difficulty. Defaults to 7 when omitted. */
  difficulty?: number;
  /** One to two sentence summary. */
  description: string;
}

const rite = (
  name: string,
  level: 1 | 2 | 3 | 4 | 5,
  category: RiteCategory,
  description: string,
  difficulty?: number,
): IRiteDef => ({ name, level, category, description, ...(difficulty !== undefined ? { difficulty } : {}) });

export const WTA_RITES: Record<string, IRiteDef> = {
  // -- Rites of Accord --------------------------------------------------------
  "rite-of-cleansing":              rite("Rite of Cleansing",              1, "accord",     "Purifies a person, place, or object of spiritual taint and Wyrm corruption."),
  "rite-of-binding":                rite("Rite of Binding",                2, "accord",     "Compels a spirit to obey the ritemaster's will for a single task."),
  "rite-of-renunciation":           rite("Rite of Renunciation",           2, "accord",     "Formally severs a Garou from tribe, sept, or pack with the spirits as witness."),
  "rite-of-summoning":              rite("Rite of Summoning",              3, "accord",     "Calls a named spirit across the Gauntlet to the ritemaster's location."),
  "rite-of-the-totem":              rite("Rite of the Totem",              3, "accord",     "Binds a pack to a totem spirit, granting boons in exchange for service."),
  "rite-of-adoption":               rite("Rite of Adoption",               2, "accord",     "Welcomes an outsider, kinfolk, or Garou into a tribe, sept, or pack."),
  "rite-of-contrition":             rite("Rite of Contrition",             1, "accord",     "The offender begs forgiveness from a wronged sept; success spares them ostracism.", 8),
  "rite-of-the-loyal-pack":         rite("Rite of the Loyal Pack",         3, "accord",     "Reaffirms a pack's bond; on success, members share Willpower for one scene."),

  // -- Mystic Rites -----------------------------------------------------------
  "rite-of-talisman-dedication":    rite("Rite of Talisman Dedication",    1, "mystic",     "Binds an object to the Garou so it shifts with them between forms."),
  "baptism-of-fire":                rite("Baptism of Fire",                1, "mystic",     "Marks a cub with Gaia's blessing before their first true challenge."),
  "rite-of-becoming":               rite("Rite of Becoming",               4, "mystic",     "Sends the ritemaster bodily into the Deep Umbra on a spirit journey."),
  "rite-of-the-fetish":             rite("Rite of the Fetish",             3, "mystic",     "Binds a spirit into a prepared object, creating a fetish."),
  "rite-of-the-questing-stone":     rite("Rite of the Questing Stone",     1, "mystic",     "Uses a stone or thread to point unerringly toward a sought person or item."),
  "rite-of-spirit-awakening":       rite("Rite of Spirit Awakening",       2, "mystic",     "Rouses a slumbering spirit in an object or place so it may speak and act."),
  "rite-of-the-opened-bridge":      rite("Rite of the Opened Bridge",      4, "caern",      "Forges a Moon Bridge linking two caerns across vast distances."),
  "rite-of-the-shrouded-glen":      rite("Rite of the Shrouded Glen",      3, "mystic",     "Hides a small area from mortal sight and Wyrm-tainted senses."),
  "rite-of-growth":                 rite("Rite of Growth",                 1, "mystic",     "Coaxes a planted seed or wounded plant into rapid, healthy growth."),
  "rite-of-heritage":               rite("Rite of Heritage",               1, "mystic",     "Traces a subject's bloodline and Garou ancestry through scent-and-spirit memory.", 7),
  "descent-into-the-underworld":    rite("Descent Into the Underworld",    3, "mystic",     "Sends the ritemaster on a spirit journey to speak with the dead."),
  "rite-of-sacred-rebirth":         rite("Rite of Sacred Rebirth",         5, "mystic",     "Restores a slain Garou to life at terrible cost; condemned by most tribes.", 9),

  // -- Caern Rites ------------------------------------------------------------
  "rite-of-caern-building":         rite("Rite of Caern Building",         5, "caern",      "The great rite that establishes a new caern over a node of Gaia's power."),
  "rite-of-the-badgers-burrow":     rite("Rite of the Badger's Burrow",    2, "caern",      "Warns the sept when intruders cross the bawn of the caern."),
  "moot-rite":                      rite("Moot Rite",                      1, "caern",      "Opens and closes a sept's moot, focusing the caern's energy on the gathering."),
  "rite-of-the-opened-caern":       rite("Rite of the Opened Caern",       1, "caern",      "Tunes the caern to a single petitioner's purpose; opens a moon bridge to its sibling caerns."),
  "rite-of-the-glorious-past":      rite("Rite of the Glorious Past",      3, "caern",      "Recalls the heroic deeds of the caern's history, raising temporary Glory for all present."),
  "enchant-the-forest":             rite("Enchant the Forest",             4, "caern",      "Wards the bawn so mortals lose their way and Wyrm-creatures cannot enter."),
  "rite-of-the-opened-sky":         rite("Rite of the Opened Sky",         4, "caern",      "Reveals to the sept what Luna and Helios witnessed over their territory in the past day."),

  // -- Death Rites ------------------------------------------------------------
  "gathering-for-the-departed":     rite("Gathering for the Departed",     1, "death",      "Brief ceremony honoring a fallen Garou before the spirit moves on."),
  "last-blessing":                  rite("Last Blessing",                  1, "death",      "Eases the passage of a dying Garou into the spirit world."),
  "rite-of-the-winter-wolf":        rite("Rite of the Winter Wolf",        2, "death",      "Permits an aged or terminally injured Garou to die with honor."),

  // -- Minor Rites ------------------------------------------------------------
  "rite-of-the-loud-howl":          rite("Rite of the Loud Howl",          1, "minor",      "Lets the ritemaster's howl carry for miles, summoning packmates or allies."),
  "prayer-for-the-prey":            rite("Prayer for the Prey",            1, "minor",      "Honors the spirit of an animal slain for food, ensuring no insult is given."),
  "rite-of-the-cardboard-palace":   rite("Rite of the Cardboard Palace",   1, "minor",      "Bone Gnawer rite making a humble shelter warm and weatherproof for a night."),
  "bone-rhythms":                   rite("Bone Rhythms",                   1, "minor",      "Drumming or hand-rhythm rite that opens the participants to spirit-sense for a scene."),
  "breath-of-gaia":                 rite("Breath of Gaia",                 1, "minor",      "A measured breathing ritual that clears the head and restores 1 temporary Willpower."),
  "greet-the-moon":                 rite("Greet the Moon",                 1, "minor",      "Welcomes Luna at moonrise; participants gain a small bonus to Gnosis rolls that night."),
  "greet-the-sun":                  rite("Greet the Sun",                  1, "minor",      "Honors Helios at dawn; participants resist supernatural fatigue for the day."),
  "hunting-prayer":                 rite("Hunting Prayer",                 1, "minor",      "Asks the prey-spirit's consent before a hunt; ensures honorable spoils."),

  // -- Punishment Rites -------------------------------------------------------
  "stone-of-scorn":                 rite("Stone of Scorn",                 2, "punishment", "Publicly marks a Garou as outcast; others must shun them on pain of sharing the punishment."),
  "satire-rite":                    rite("Satire Rite",                    2, "punishment", "Galliards compose mocking songs that follow the offender forever after."),
  "voice-of-the-jackal":            rite("Voice of the Jackal",            3, "punishment", "Curses the target so their words sound like whining yelps to Garou ears."),
  "rite-of-the-jackdaw":            rite("Rite of the Jackdaw",            1, "punishment", "A public mockery; the offender is followed by the laughing-bird spirit for a moon."),
  "rite-of-ostracism":              rite("Rite of Ostracism",              2, "punishment", "Marks the target as unworthy of any Garou's voice or aid for a moon."),
  "the-hunt":                       rite("The Hunt",                       3, "punishment", "The sept declares the offender prey; any Garou may run them down without offense."),
  "rite-of-the-omega-wolf":         rite("Rite of the Omega Wolf",         3, "punishment", "Strips the offender's rank; they bear the omega's mantle until they redeem it."),
  "the-rending-of-the-veil":        rite("The Rending of the Veil",        4, "punishment", "Forces the offender to walk visible to mortal sight as their war-form for a moon."),
  "gaias-vengeful-teeth":           rite("Gaia's Vengeful Teeth",          5, "punishment", "Calls the wrath of the Mother on a betrayer; their next combat brings aggravated harm."),

  // -- Renown Rites -----------------------------------------------------------
  "rite-of-accomplishment":         rite("Rite of Accomplishment",         2, "renown",     "Honors a Garou's recent deeds and awards permanent Renown before the sept."),
  "rite-of-wounding":               rite("Rite of Wounding",               2, "renown",     "Cuts the Garou to mark a recognized act and acknowledge them as a warrior."),
  "rite-of-boasting":               rite("Rite of Boasting",                1, "renown",     "The Garou ritually proclaims a deed; on success, a temporary Renown reward is given."),
  "rite-of-praise":                 rite("Rite of Praise",                  2, "renown",     "Galliards formally honor another's deed before the sept; awards temporary Renown to the subject."),

  // -- Seasonal Rites ---------------------------------------------------------
  "rite-of-the-spring-equinox":     rite("Rite of the Spring Equinox",     3, "seasonal",   "Renews the caern's bond with Gaia at the turning of winter to spring."),
  "rite-of-the-summer-solstice":    rite("Rite of the Summer Solstice",    3, "seasonal",   "Celebrates the sun at its height and renews the sept's pledge to the war."),
  "rite-of-the-autumnal-equinox":   rite("Rite of the Autumnal Equinox",   3, "seasonal",   "Marks the harvest and the coming of darker times; ancestors are honored."),
  "rite-of-the-winter-solstice":    rite("Rite of the Winter Solstice",    3, "seasonal",   "The longest night; the sept gathers to mourn lost kin and steel itself for the year ahead."),

  // -- Passage Rites ----------------------------------------------------------
  "rite-of-passage":                rite("Rite of Passage",                1, "passage",    "The first true challenge that turns a cub into a Cliath of the Garou Nation."),
  "rite-of-the-cleansed-blood":     rite("Rite of the Cleansed Blood",     3, "passage",    "Cleanses Metis stigma in the eyes of the spirits when a Metis proves themselves."),
};
