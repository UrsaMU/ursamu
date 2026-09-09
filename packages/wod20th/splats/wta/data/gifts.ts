// WtA Gifts (levels 1-5) -- source: M20 Werewolf core pp.135-149.
// Key = lowercase gift name for lookup; source[] = pool IDs that include this gift.
// Each gift name appears at exactly one level; cross-pool sharing is expressed
// by listing every owning pool in source[].
import type { IGiftAction, IGiftDef } from "../../../core/types.ts";

const gift = (
  name: string,
  level: 1 | 2 | 3 | 4 | 5,
  source: string[],
  action?: IGiftAction,
): IGiftDef => (action ? { name, level, source, action } : { name, level, source });

export const WTA_GIFTS: Record<string, IGiftDef> = {
  // ===========================================================================
  // LEVEL 1
  // ===========================================================================

  // -- Level 1: Breed: Homid --------------------------------------------------
  "apecraft's blessings":  gift("Apecraft's Blessings",  1, ["homid"]),
  "city running":          gift("City Running",          1, ["homid"]),
  "master of fire":        gift("Master of Fire",        1, ["homid", "get-of-fenris"]),
  "persuasion":            gift("Persuasion",            1, ["homid", "philodox", "fianna", "glass-walkers"]),
  "smell of man":          gift("Smell of Man",          1, ["homid"]),

  // -- Level 1: Breed: Metis --------------------------------------------------
  "craft elemental":       gift("Craft Elemental",       1, ["metis"]),
  "primal anger":          gift("Primal Anger",          1, ["metis"]),
  "rat head":              gift("Rat Head",              1, ["metis"]),
  "stench":                gift("Stench",                1, ["metis"]),

  // -- Level 1: Breed: Lupus --------------------------------------------------
  "hare's leap":           gift("Hare's Leap",           1, ["lupus", "fianna"]),
  "heightened senses":     gift("Heightened Senses",     1, ["lupus", "galliard", "black-furies"]),
  "predator's arsenal":    gift("Predator's Arsenal",    1, ["lupus"]),
  "sense the unnatural":   gift("Sense the Unnatural",   1, ["lupus", "uktena"]),

  // -- Level 1: Auspice: Ragabash ---------------------------------------------
  "blur of the milky eye": gift("Blur of the Milky Eye", 1, ["ragabash"]),
  "liar's face":           gift("Liar's Face",           1, ["ragabash"]),
  "open seal":             gift("Open Seal",             1, ["ragabash"]),
  "scent of running water":gift("Scent of Running Water",1, ["ragabash", "red-talons"]),
  "spider's song":         gift("Spider's Song",         1, ["ragabash"]),

  // -- Level 1: Auspice: Theurge ----------------------------------------------
  "mother's touch":        gift("Mother's Touch",        1, ["theurge", "children-of-gaia"]),
  "sense wyrm":            gift("Sense Wyrm",            1, [
    "theurge", "silent-striders", "silver-fangs", "black-furies",
    "stargazers", "uktena", "metis", "lupus",
  ]),
  "spirit snare":          gift("Spirit Snare",          1, ["theurge"]),
  "spirit speech":         gift("Spirit Speech",         1, ["theurge", "uktena"]),
  "umbral tether":         gift("Umbral Tether",         1, ["theurge"]),

  // -- Level 1: Auspice: Philodox ---------------------------------------------
  "fangs of judgment":     gift("Fangs of Judgment",     1, ["philodox"]),
  "resist pain":           gift("Resist Pain",           1, [
    "philodox", "fianna", "get-of-fenris", "children-of-gaia", "wendigo",
  ]),
  "scent of the true form":gift("Scent of the True Form",1, ["philodox"]),
  "truth of gaia":         gift("Truth of Gaia",         1, ["philodox"]),

  // -- Level 1: Auspice: Galliard ---------------------------------------------
  "beast speech":          gift("Beast Speech",          1, ["galliard", "red-talons"]),
  "call of the wyld":      gift("Call of the Wyld",      1, ["galliard"]),
  "mindspeak":             gift("Mindspeak",             1, ["galliard"]),
  "perfect recall":        gift("Perfect Recall",        1, ["galliard"]),

  // -- Level 1: Auspice: Ahroun -----------------------------------------------
  "falling touch":         gift("Falling Touch",         1, ["ahroun", "stargazers"]),
  "inspiration":           gift("Inspiration",           1, ["ahroun", "silver-fangs"]),
  "pack tactics":          gift("Pack Tactics",          1, ["ahroun"]),
  "razor claws":           gift("Razor Claws",           1, ["ahroun", "get-of-fenris"]),
  "spur claws":            gift("Spur Claws",            1, ["ahroun"]),

  // -- Level 1: Tribe: Black Furies -------------------------------------------
  "breath of the wyld":    gift("Breath of the Wyld",    1, ["black-furies"]),
  "man's skin":            gift("Man's Skin",            1, ["black-furies"]),
  "wyld resurgence":       gift("Wyld Resurgence",       1, ["black-furies"]),

  // -- Level 1: Tribe: Bone Gnawers -------------------------------------------
  "cooking":               gift("Cooking",               1, ["bone-gnawers"]),
  "desperate strength":    gift("Desperate Strength",    1, ["bone-gnawers"]),
  "resist toxin":          gift("Resist Toxin",          1, ["bone-gnawers", "fianna"]),
  "scent of sweet honey":  gift("Scent of Sweet Honey",  1, ["bone-gnawers"]),

  // -- Level 1: Tribe: Children of Gaia ---------------------------------------
  "brother's scent":       gift("Brother's Scent",       1, ["children-of-gaia"]),
  "jam weapon":            gift("Jam Weapon",            1, ["children-of-gaia"]),
  "mercy":                 gift("Mercy",                 1, ["children-of-gaia"]),

  // -- Level 1: Tribe: Fianna -------------------------------------------------
  "faerie light":          gift("Faerie Light",          1, ["fianna"]),
  "two tongues":           gift("Two Tongues",           1, ["fianna"]),

  // -- Level 1: Tribe: Get of Fenris ------------------------------------------
  "lightning reflexes":    gift("Lightning Reflexes",    1, ["get-of-fenris"]),
  "visage of fenris":      gift("Visage of Fenris",      1, ["get-of-fenris"]),

  // -- Level 1: Tribe: Glass Walkers ------------------------------------------
  "control simple machine":gift("Control Simple Machine",1, ["glass-walkers"]),
  "diagnostics":           gift("Diagnostics",           1, ["glass-walkers"]),
  "plug and play":         gift("Plug and Play",         1, ["glass-walkers"]),
  "trick shot":            gift("Trick Shot",            1, ["glass-walkers"]),

  // -- Level 1: Tribe: Red Talons ---------------------------------------------
  "eye of the hunter":     gift("Eye of the Hunter",     1, ["red-talons"]),
  "hidden killer":         gift("Hidden Killer",         1, ["red-talons"]),
  "wolf at the door":      gift("Wolf at the Door",      1, ["red-talons"]),

  // -- Level 1: Tribe: Shadow Lords -------------------------------------------
  "aura of confidence":    gift("Aura of Confidence",    1, ["shadow-lords"]),
  "fatal flaw":            gift("Fatal Flaw",            1, ["shadow-lords"]),
  "seizing the edge":      gift("Seizing the Edge",      1, ["shadow-lords"]),
  "shadow weaving":        gift("Shadow Weaving",        1, ["shadow-lords"]),
  "whisper catching":      gift("Whisper Catching",      1, ["shadow-lords"]),

  // -- Level 1: Tribe: Silent Striders ----------------------------------------
  "heaven's guidance":     gift("Heaven's Guidance",     1, ["silent-striders"]),
  "silence":               gift("Silence",               1, ["silent-striders"]),
  "speed of thought":      gift("Speed of Thought",      1, ["silent-striders"]),
  "visions of duat":       gift("Visions of Duat",       1, ["silent-striders"]),

  // -- Level 1: Tribe: Silver Fangs -------------------------------------------
  "eye of the falcon":     gift("Eye of the Falcon",     1, ["silver-fangs"]),
  "falcon's grasp":        gift("Falcon's Grasp",        1, ["silver-fangs"]),
  "lambent flame":         gift("Lambent Flame",         1, ["silver-fangs"]),

  // -- Level 1: Tribe: Stargazers ---------------------------------------------
  "balance":               gift("Balance",               1, ["stargazers"]),
  "channeling":            gift("Channeling",            1, ["stargazers"]),
  "iron resolve":          gift("Iron Resolve",          1, ["stargazers"]),

  // -- Level 1: Tribe: Uktena -------------------------------------------------
  "sense magic":           gift("Sense Magic",           1, ["uktena"]),
  "shroud":                gift("Shroud",                1, ["uktena"]),
  "spirit of the lizard":  gift("Spirit of the Lizard",  1, ["uktena"]),

  // -- Level 1: Tribe: Wendigo ------------------------------------------------
  "beat of the heart-drum":gift("Beat of the Heart-Drum",1, ["wendigo"]),
  "call the breeze":       gift("Call the Breeze",       1, ["wendigo"]),
  "camouflage":            gift("Camouflage",            1, ["wendigo"]),
  "ice echo":              gift("Ice Echo",              1, ["wendigo"]),

  // ===========================================================================
  // LEVEL 2
  // ===========================================================================

  // -- Level 2: Breed: Homid --------------------------------------------------
  "staredown":             gift("Staredown",             2, ["homid", "silver-fangs"]),
  "reshape object":        gift("Reshape Object",        2, ["homid"]),
  "human guise":           gift("Human Guise",           2, ["homid"]),
  "cooking the books":     gift("Cooking the Books",     2, ["homid", "glass-walkers"]),

  // -- Level 2: Breed: Metis --------------------------------------------------
  "curse of hatred":       gift("Curse of Hatred",       2, ["metis"]),
  "sense of the prey":     gift("Sense of the Prey",     2, ["metis", "red-talons", "silent-striders"]),
  "wither limb":           gift("Wither Limb",           2, ["metis"]),

  // -- Level 2: Breed: Lupus --------------------------------------------------
  "name the spirit":       gift("Name the Spirit",       2, ["lupus", "theurge"]),
  "scent of sight":        gift("Scent of Sight",        2, ["lupus"]),
  "the beast within":      gift("The Beast Within",      2, ["lupus"]),

  // -- Level 2: Auspice: Ragabash ---------------------------------------------
  "alter scent":           gift("Alter Scent",           2, ["ragabash"]),
  "taking the forgotten":  gift("Taking the Forgotten",  2, ["ragabash"]),
  "blissful ignorance":    gift("Blissful Ignorance",    2, ["ragabash", "bone-gnawers"]),
  "open moon bridge":      gift("Open Moon Bridge",      2, ["ragabash", "silver-fangs"]),

  // -- Level 2: Auspice: Theurge ----------------------------------------------
  "command spirit":        gift("Command Spirit",        2, ["theurge"]),
  "dreamspeak":            gift("Dreamspeak",            2, ["theurge"]),
  "exorcism":              gift("Exorcism",              2, ["theurge", "children-of-gaia"]),
  "sight from beyond":     gift("Sight from Beyond",     2, ["theurge"]),

  // -- Level 2: Auspice: Philodox ---------------------------------------------
  "king of the beasts":    gift("King of the Beasts",    2, ["philodox"]),
  "weak arm":              gift("Weak Arm",              2, ["philodox"]),
  "wisdom of the ancient ways": gift("Wisdom of the Ancient Ways", 2, ["philodox"]),
  "strength of purpose":   gift("Strength of Purpose",   2, ["philodox"]),

  // -- Level 2: Auspice: Galliard ---------------------------------------------
  "distractions":          gift("Distractions",          2, ["galliard"]),
  "dreamcall":             gift("Dreamcall",             2, ["galliard"]),
  "eye of the cobra":      gift("Eye of the Cobra",      2, ["galliard"]),
  "heart of the mountain": gift("Heart of the Mountain", 2, ["galliard"]),

  // -- Level 2: Auspice: Ahroun -----------------------------------------------
  "silver claws":          gift("Silver Claws",          2, ["ahroun", "silver-fangs"]),
  "true fear":             gift("True Fear",             2, ["ahroun"]),
  "wrath of gaia":         gift("Wrath of Gaia",         2, ["ahroun"]),

  // -- Level 2: Tribe: Black Furies -------------------------------------------
  "curse of aeolus":       gift("Curse of Aeolus",       2, ["black-furies"]),
  "sense of the sisters":  gift("Sense of the Sisters",  2, ["black-furies"]),
  "visceral agony":        gift("Visceral Agony",        2, ["black-furies"]),

  // -- Level 2: Tribe: Bone Gnawers -------------------------------------------
  "trash is treasure":     gift("Trash Is Treasure",     2, ["bone-gnawers"]),
  "odious aroma":          gift("Odious Aroma",          2, ["bone-gnawers"]),

  // -- Level 2: Tribe: Children of Gaia ---------------------------------------
  "calm":                  gift("Calm",                  2, ["children-of-gaia"]),
  "dazzle":                gift("Dazzle",                2, ["children-of-gaia"]),
  "luna's blessing":       gift("Luna's Blessing",       2, ["children-of-gaia", "silver-fangs", "ragabash"]),

  // -- Level 2: Tribe: Fianna -------------------------------------------------
  "howl of the banshee":   gift("Howl of the Banshee",   2, ["fianna"]),
  "stoking fury's furnace":gift("Stoking Fury's Furnace",2, ["fianna", "ahroun"]),
  "fair fortune":          gift("Fair Fortune",          2, ["fianna"]),

  // -- Level 2: Tribe: Get of Fenris ------------------------------------------
  "snarl of the predator": gift("Snarl of the Predator", 2, ["get-of-fenris"]),
  "troll skin":            gift("Troll Skin",            2, ["get-of-fenris"]),
  "halt the coward's flight": gift("Halt the Coward's Flight", 2, ["get-of-fenris"]),

  // -- Level 2: Tribe: Glass Walkers ------------------------------------------
  "tongues":               gift("Tongues",               2, ["glass-walkers"]),
  "control complex machine": gift("Control Complex Machine", 2, ["glass-walkers"]),
  "attunement":            gift("Attunement",            2, ["glass-walkers", "bone-gnawers", "silent-striders"]),

  // -- Level 2: Tribe: Red Talons ---------------------------------------------
  "beast life":            gift("Beast Life",            2, ["red-talons"]),
  "elemental favor":       gift("Elemental Favor",       2, ["red-talons", "glass-walkers"]),
  "scent of the unfresh kill": gift("Scent of the Unfresh Kill", 2, ["red-talons"]),

  // -- Level 2: Tribe: Shadow Lords -------------------------------------------
  "clap of thunder":       gift("Clap of Thunder",       2, ["shadow-lords"]),
  "luna's avenger":        gift("Luna's Avenger",        2, ["shadow-lords"]),
  "obedience":             gift("Obedience",             2, ["shadow-lords"]),

  // -- Level 2: Tribe: Silent Striders ----------------------------------------
  "speed beyond thought":  gift("Speed Beyond Thought",  2, ["silent-striders"]),
  "messenger's fortitude": gift("Messenger's Fortitude", 2, ["silent-striders"]),

  // -- Level 2: Tribe: Silver Fangs -------------------------------------------
  "luna's armor":          gift("Luna's Armor",          2, ["silver-fangs"]),
  "wisdom of the ancients":gift("Wisdom of the Ancients",2, ["silver-fangs"]),
  "silvery glow":          gift("Silvery Glow",          2, ["silver-fangs"]),

  // -- Level 2: Tribe: Stargazers ---------------------------------------------
  "clarity":               gift("Clarity",               2, ["stargazers"]),
  "preternatural awareness": gift("Preternatural Awareness", 2, ["stargazers"]),
  "surface attunement":    gift("Surface Attunement",    2, ["stargazers"]),

  // -- Level 2: Tribe: Uktena -------------------------------------------------
  "secrets":               gift("Secrets",               2, ["uktena"]),
  "spirit of the bird":    gift("Spirit of the Bird",    2, ["uktena"]),

  // -- Level 2: Tribe: Wendigo ------------------------------------------------
  "cutting wind":          gift("Cutting Wind",          2, ["wendigo"]),
  "long running":          gift("Long Running",          2, ["wendigo"]),

  // ===========================================================================
  // LEVEL 3
  // ===========================================================================

  // -- Level 3: Breed: Homid --------------------------------------------------
  "disquiet":              gift("Disquiet",              3, ["homid"]),
  "sweet whispers":        gift("Sweet Whispers",        3, ["homid"]),
  "body shift":            gift("Body Shift",            3, ["homid", "ahroun"]),

  // -- Level 3: Breed: Metis --------------------------------------------------
  "gift of the porcupine": gift("Gift of the Porcupine", 3, ["metis"]),
  "mental speech":         gift("Mental Speech",         3, ["metis"]),

  // -- Level 3: Breed: Lupus --------------------------------------------------
  "catfeet":               gift("Catfeet",               3, ["lupus", "bone-gnawers"]),
  "spirit of the fray":    gift("Spirit of the Fray",    3, ["lupus", "ahroun"]),
  "form of mist":          gift("Form of Mist",          3, ["lupus", "stargazers"]),

  // -- Level 3: Auspice: Ragabash ---------------------------------------------
  "gremlins":              gift("Gremlins",              3, ["ragabash", "glass-walkers"]),
  "obscure the truth":     gift("Obscure the Truth",     3, ["ragabash"]),
  "open wounds":           gift("Open Wounds",           3, ["ragabash"]),

  // -- Level 3: Auspice: Theurge ----------------------------------------------
  "pulse of the invisible": gift("Pulse of the Invisible", 3, ["theurge"]),
  "wall of granite":       gift("Wall of Granite",       3, ["theurge", "philodox"]),

  // -- Level 3: Auspice: Philodox ---------------------------------------------
  "scent of beyond":       gift("Scent of Beyond",       3, ["philodox"]),
  "weak hands":            gift("Weak Hands",            3, ["philodox"]),
  "judgment of the gods":  gift("Judgment of the Gods",  3, ["philodox"]),

  // -- Level 3: Auspice: Galliard ---------------------------------------------
  "song of heroes":        gift("Song of Heroes",        3, ["galliard"]),
  "song of rage":          gift("Song of Rage",          3, ["galliard"]),
  "gift of the spriggan":  gift("Gift of the Spriggan",  3, ["galliard", "fianna"]),

  // -- Level 3: Auspice: Ahroun -----------------------------------------------
  "combat healing":        gift("Combat Healing",        3, ["ahroun"]),
  "primal blood":          gift("Primal Blood",          3, ["ahroun"]),
  "sense silver":          gift("Sense Silver",          3, ["ahroun"]),

  // -- Level 3: Tribe: Black Furies -------------------------------------------
  "wyld warp":             gift("Wyld Warp",             3, ["black-furies"]),
  "body wrack":            gift("Body Wrack",            3, ["black-furies"]),
  "thousand forms":        gift("Thousand Forms",        3, ["black-furies"]),

  // -- Level 3: Tribe: Bone Gnawers -------------------------------------------
  "gift of the skunk":     gift("Gift of the Skunk",     3, ["bone-gnawers"]),
  "infest":                gift("Infest",                3, ["bone-gnawers"]),
  "laugh of the hyena":    gift("Laugh of the Hyena",    3, ["bone-gnawers"]),

  // -- Level 3: Tribe: Children of Gaia ---------------------------------------
  "bliss of peace":        gift("Bliss of Peace",        3, ["children-of-gaia"]),
  "halo of the sun":       gift("Halo of the Sun",       3, ["children-of-gaia"]),
  "serenity":              gift("Serenity",              3, ["children-of-gaia"]),

  // -- Level 3: Tribe: Fianna -------------------------------------------------
  "phantasm":              gift("Phantasm",              3, ["fianna"]),
  "balor's gaze":          gift("Balor's Gaze",          3, ["fianna"]),
  "kiss of helios":        gift("Kiss of Helios",        3, ["fianna"]),

  // -- Level 3: Tribe: Get of Fenris ------------------------------------------
  "might of thor":         gift("Might of Thor",         3, ["get-of-fenris"]),
  "blood of heroes":       gift("Blood of Heroes",       3, ["get-of-fenris"]),
  "fenris' bite":          gift("Fenris' Bite",          3, ["get-of-fenris", "shadow-lords"]),

  // -- Level 3: Tribe: Glass Walkers ------------------------------------------
  "doppelganger":          gift("Doppelganger",          3, ["glass-walkers", "shadow-lords"]),
  "summon net-spider":     gift("Summon Net-Spider",     3, ["glass-walkers"]),

  // -- Level 3: Tribe: Red Talons ---------------------------------------------
  "quicksand":             gift("Quicksand",             3, ["red-talons"]),
  "venom blood":           gift("Venom Blood",           3, ["red-talons"]),
  "gnaw":                  gift("Gnaw",                  3, ["red-talons", "lupus"]),

  // -- Level 3: Tribe: Shadow Lords -------------------------------------------
  "paralyzing stare":      gift("Paralyzing Stare",      3, ["shadow-lords"]),
  "feedback":              gift("Feedback",              3, ["shadow-lords"]),
  "icy chill of despair":  gift("Icy Chill of Despair",  3, ["shadow-lords"]),

  // -- Level 3: Tribe: Silent Striders ----------------------------------------
  "great leap":            gift("Great Leap",            3, ["silent-striders"]),
  "sending":               gift("Sending",               3, ["silent-striders"]),
  "wind walking":          gift("Wind Walking",          3, ["silent-striders"]),

  // -- Level 3: Tribe: Silver Fangs -------------------------------------------
  "command the gathering": gift("Command the Gathering", 3, ["silver-fangs"]),

  // -- Level 3: Tribe: Stargazers ---------------------------------------------
  "merciful blow":         gift("Merciful Blow",         3, ["stargazers"]),
  "rending the threads":   gift("Rending the Threads",   3, ["stargazers"]),
  "wisdom of the seer":    gift("Wisdom of the Seer",    3, ["stargazers"]),

  // -- Level 3: Tribe: Uktena -------------------------------------------------
  "invisibility":          gift("Invisibility",          3, ["uktena"]),
  "song of the great beast": gift("Song of the Great Beast", 3, [
    "uktena", "lupus", "red-talons", "theurge", "get-of-fenris", "shadow-lords",
  ]),
  "spirit of the lake":    gift("Spirit of the Lake",    3, ["uktena"]),

  // -- Level 3: Tribe: Wendigo ------------------------------------------------
  "chill of early frost":  gift("Chill of Early Frost",  3, ["wendigo"]),
  "spirit of the frozen north": gift("Spirit of the Frozen North", 3, ["wendigo"]),
  "wendigo's heart":       gift("Wendigo's Heart",       3, ["wendigo"]),

  // ===========================================================================
  // LEVEL 4
  // ===========================================================================

  // -- Level 4: Breed: Homid --------------------------------------------------
  "spirit ward":           gift("Spirit Ward",           4, ["homid"]),
  "ultimatum":             gift("Ultimatum",             4, ["homid"]),

  // -- Level 4: Breed: Metis --------------------------------------------------
  "madness":               gift("Madness",               4, ["metis"]),
  "horrid reality":        gift("Horrid Reality",        4, ["metis"]),

  // -- Level 4: Breed: Lupus --------------------------------------------------
  "elemental gift":        gift("Elemental Gift",        4, ["lupus"]),

  // -- Level 4: Auspice: Ragabash ---------------------------------------------
  "thieving talons of the magpie": gift("Thieving Talons of the Magpie", 4, ["ragabash"]),
  "whelp body":            gift("Whelp Body",            4, ["ragabash"]),

  // -- Level 4: Auspice: Theurge ----------------------------------------------
  "grasp the beyond":      gift("Grasp the Beyond",      4, ["theurge"]),
  "summon the bane-tender":gift("Summon the Bane-Tender",4, ["theurge"]),
  "spirit drain":          gift("Spirit Drain",          4, ["theurge"]),

  // -- Level 4: Auspice: Philodox ---------------------------------------------
  "roll over":             gift("Roll Over",             4, ["philodox"]),
  "scent of the past":     gift("Scent of the Past",     4, ["philodox"]),

  // -- Level 4: Auspice: Galliard ---------------------------------------------
  "head games":            gift("Head Games",            4, ["galliard"]),
  "fabric of the mind":    gift("Fabric of the Mind",    4, ["galliard"]),

  // -- Level 4: Auspice: Ahroun -----------------------------------------------
  "thunder roar":          gift("Thunder Roar",          4, ["ahroun"]),

  // -- Level 4: Tribe: Black Furies -------------------------------------------
  "bacchantes' rage":      gift("Bacchantes' Rage",      4, ["black-furies"]),
  "wind claws":            gift("Wind Claws",            4, ["black-furies"]),

  // -- Level 4: Tribe: Bone Gnawers -------------------------------------------
  "ground squirrel's hoard":gift("Ground Squirrel's Hoard",4, ["bone-gnawers"]),

  // -- Level 4: Tribe: Children of Gaia ---------------------------------------
  "lover's touch":         gift("Lover's Touch",         4, ["children-of-gaia"]),

  // -- Level 4: Tribe: Fianna -------------------------------------------------
  "song of the seanchaidh": gift("Song of the Seanchaidh", 4, ["fianna"]),

  // -- Level 4: Tribe: Get of Fenris ------------------------------------------
  "horde":                 gift("Horde",                 4, ["get-of-fenris"]),
  "thurs":                 gift("Thurs",                 4, ["get-of-fenris"]),

  // -- Level 4: Tribe: Glass Walkers ------------------------------------------
  "steel fur":             gift("Steel Fur",             4, ["glass-walkers"]),

  // -- Level 4: Tribe: Red Talons ---------------------------------------------
  "curse of lycaon":       gift("Curse of Lycaon",       4, ["red-talons"]),

  // -- Level 4: Tribe: Shadow Lords -------------------------------------------
  "open seal greater":     gift("Open Seal, Greater",    4, ["shadow-lords"]),

  // -- Level 4: Tribe: Silent Striders ----------------------------------------
  "gate of the moon":      gift("Gate of the Moon",      4, ["silent-striders"]),

  // -- Level 4: Tribe: Silver Fangs -------------------------------------------
  "paws of the newborn cub":gift("Paws of the Newborn Cub",4, ["silver-fangs"]),
  "mastery":               gift("Mastery",               4, ["silver-fangs"]),

  // -- Level 4: Tribe: Stargazers ---------------------------------------------
  "harmony":               gift("Harmony",               4, ["stargazers"]),
  "splitting the shell":   gift("Splitting the Shell",   4, ["stargazers"]),

  // -- Level 4: Tribe: Uktena -------------------------------------------------
  "call elemental":        gift("Call Elemental",        4, ["uktena"]),
  "pulse of the prey":     gift("Pulse of the Prey",     4, ["uktena"]),

  // -- Level 4: Tribe: Wendigo ------------------------------------------------
  "bloody feast":          gift("Bloody Feast",          4, ["wendigo"]),
  "invisible wall of wind":gift("Invisible Wall of Wind",4, ["wendigo"]),

  // ===========================================================================
  // LEVEL 5
  // ===========================================================================

  // -- Level 5: Breed: Homid --------------------------------------------------
  "part the veil":         gift("Part the Veil",         5, ["homid", "children-of-gaia"]),

  // -- Level 5: Breed: Metis --------------------------------------------------
  "totem gift":            gift("Totem Gift",            5, ["metis"]),
  "twist of fate":         gift("Twist of Fate",         5, ["metis"]),

  // -- Level 5: Breed: Lupus --------------------------------------------------
  "gaia's embrace":        gift("Gaia's Embrace",        5, ["lupus"]),

  // -- Level 5: Auspice: Ragabash ---------------------------------------------
  "fool's luck":           gift("Fool's Luck",           5, ["ragabash"]),

  // -- Level 5: Auspice: Theurge ----------------------------------------------
  "assimilation":          gift("Assimilation",          5, ["theurge"]),
  "malleable spirit":      gift("Malleable Spirit",      5, ["theurge"]),

  // -- Level 5: Auspice: Philodox ---------------------------------------------
  "geas":                  gift("Geas",                  5, ["philodox"]),

  // -- Level 5: Auspice: Galliard ---------------------------------------------
  "epic might":            gift("Epic Might",            5, ["galliard"]),

  // -- Level 5: Auspice: Ahroun -----------------------------------------------
  "strength of will":      gift("Strength of Will",      5, ["ahroun"]),
  "elemental fury":        gift("Elemental Fury",        5, ["ahroun"]),

  // -- Level 5: Tribe: Black Furies -------------------------------------------
  "gorgon's gaze":         gift("Gorgon's Gaze",         5, ["black-furies"]),

  // -- Level 5: Tribe: Bone Gnawers -------------------------------------------
  "survivor":              gift("Survivor",              5, ["bone-gnawers"]),

  // -- Level 5: Tribe: Fianna -------------------------------------------------
  "fionn's resolve":       gift("Fionn's Resolve",       5, ["fianna"]),

  // -- Level 5: Tribe: Get of Fenris ------------------------------------------
  "valkyria's grace":      gift("Valkyria's Grace",      5, ["get-of-fenris"]),

  // -- Level 5: Tribe: Glass Walkers ------------------------------------------
  "city protocol":         gift("City Protocol",         5, ["glass-walkers"]),

  // -- Level 5: Tribe: Red Talons ---------------------------------------------
  "gaia's vengeance":      gift("Gaia's Vengeance",      5, ["red-talons"]),

  // -- Level 5: Tribe: Shadow Lords -------------------------------------------
  "obedience greater":     gift("Obedience, Greater",    5, ["shadow-lords"]),

  // -- Level 5: Tribe: Silent Striders ----------------------------------------
  "reach the umbra":       gift("Reach the Umbra",       5, ["silent-striders"]),

  // -- Level 5: Tribe: Silver Fangs -------------------------------------------
  "mindblock":             gift("Mindblock",             5, ["silver-fangs"]),

  // -- Level 5: Tribe: Stargazers ---------------------------------------------
  "circular attack":       gift("Circular Attack",       5, ["stargazers"]),

  // -- Level 5: Tribe: Uktena -------------------------------------------------
  "call the great wyrm":   gift("Call the Great Wyrm",   5, ["uktena"]),

  // -- Level 5: Tribe: Wendigo ------------------------------------------------
  "heart of ice":          gift("Heart of Ice",          5, ["wendigo"]),
};

// ===========================================================================
// ACTION DATA OVERLAY
// ===========================================================================
// Per-gift action specs (roll / cost / duration / effect) for the most common
// Level 1-2 gifts. Sources: M20 Werewolf core (pp. 135-149). Keys MUST match
// existing WTA_GIFTS keys exactly. Applied to WTA_GIFTS at module load.
//
// When `roll` is present, +gift/use rolls the declared pool at the declared
// difficulty. When `cost` is omitted, the default Gnosis-equals-level cost
// applies. When `cost` is present, exactly the listed amounts are spent (and
// the spend fails closed if any pool is short).
const WTA_GIFT_ACTIONS: Record<string, IGiftAction> = {
  // --- Level 1 ---
  "mother's touch": {
    roll: { pool: "Intelligence+Empathy", difficulty: 6 },
    cost: { gnosis: 1 },
    duration: "permanent",
    description:
      "Touch a living creature; heal one level of bashing or lethal damage per success.",
  },
  "sense wyrm": {
    roll: { pool: "Perception+Occult", difficulty: 6 },
    cost: { gnosis: 1 },
    duration: "turn",
    description:
      "Detect the taint of the Wyrm nearby. Range and accuracy improve with successes.",
  },
  "spirit speech": {
    cost: { gnosis: 1 },
    duration: "scene",
    description:
      "Speak with any spirit you encounter, allowing meaningful communication.",
  },
  "spirit snare": {
    roll: { pool: "Manipulation+Occult", difficulty: 7 },
    cost: { gnosis: 1 },
    duration: "scene",
    description:
      "Trap a spirit in a small object for one scene per success.",
  },
  "umbral tether": {
    cost: { gnosis: 1 },
    duration: "scene",
    description:
      "Anchor yourself to a spot in the Umbra so allies can find you again.",
  },
  "resist pain": {
    cost: { willpower: 1 },
    duration: "scene",
    description:
      "Ignore wound penalties for the remainder of the scene.",
  },
  "razor claws": {
    roll: { pool: "Dexterity+Primal-Urge", difficulty: 6 },
    cost: { rage: 1 },
    duration: "scene",
    description:
      "Claws gain +1 damage for the remainder of the scene.",
  },
  "spur claws": {
    cost: { rage: 1 },
    duration: "turn",
    description:
      "Extend hidden spurs from your wrists; adds one die of damage.",
  },
  "falling touch": {
    roll: { pool: "Dexterity+Medicine", difficulty: 7 },
    description:
      "A single touch knocks the target to the ground. No cost.",
  },
  "inspiration": {
    roll: { pool: "Charisma+Leadership", difficulty: 7 },
    cost: { gnosis: 1 },
    duration: "scene",
    description:
      "Pack members within sight gain one bonus die to all rolls for the scene.",
  },
  "pack tactics": {
    cost: { gnosis: 1 },
    duration: "scene",
    description:
      "Coordinate with pack; pack members share initiative bonuses for the scene.",
  },
  "heightened senses": {
    description:
      "Activate to sharpen all five senses to lupine-or-better levels. Cost: 1 Gnosis only in homid form; free in other forms.",
    cost: { gnosis: 1 },
    duration: "scene",
  },
  "hare's leap": {
    description:
      "Reflexively leap great distances; double normal jump range. Reflexive, no cost.",
  },
  "predator's arsenal": {
    cost: { gnosis: 1 },
    duration: "scene",
    description:
      "While in homid form, manifest one wolf trait (claws, fangs, fur, or running speed).",
  },
  "sense the unnatural": {
    roll: { pool: "Perception+Enigmas", difficulty: 7 },
    description:
      "Detect the presence of supernatural beings or phenomena within range.",
  },
  "beast speech": {
    duration: "scene",
    description:
      "Converse with any natural animal. Reflexive, no cost.",
  },
  "call of the wyld": {
    roll: { pool: "Charisma+Survival", difficulty: 7 },
    cost: { gnosis: 1 },
    duration: "scene",
    description:
      "Summon nearby spirits or animals; one creature per success answers.",
  },
  "mindspeak": {
    cost: { gnosis: 1 },
    duration: "scene",
    description:
      "Open a telepathic link with one familiar individual for the scene.",
  },
  "perfect recall": {
    cost: { gnosis: 1 },
    description:
      "Recall any memorized scene or text with flawless accuracy.",
  },
  "blur of the milky eye": {
    cost: { gnosis: 1 },
    duration: "scene",
    description:
      "You go unnoticed unless actively pointed out; passive observers ignore you.",
  },
  "liar's face": {
    cost: { gnosis: 1 },
    description:
      "Subjects of social rolls automatically fail to detect your deceptions for the scene.",
  },
  "open seal": {
    roll: { pool: "Dexterity+Crafts", difficulty: 6 },
    description:
      "Any non-magical lock or seal opens at your touch.",
  },
  "scent of running water": {
    cost: { gnosis: 1 },
    duration: "scene",
    description:
      "Your scent trail vanishes for the remainder of the scene.",
  },
  "fangs of judgment": {
    roll: { pool: "Strength+Brawl", difficulty: 6 },
    cost: { rage: 1 },
    description:
      "Your bite inflicts aggravated damage on a sworn oathbreaker.",
  },
  "scent of the true form": {
    roll: { pool: "Perception+Primal-Urge", difficulty: 7 },
    description:
      "Detect any shapeshifter's true breed/form regardless of disguise.",
  },
  "truth of gaia": {
    roll: { pool: "Perception+Empathy", difficulty: 7 },
    description:
      "Each success during a conversation reveals whether a statement is true or false.",
  },
  "persuasion": {
    cost: { gnosis: 1 },
    duration: "scene",
    description:
      "Add +2 dice to all Social rolls relying on persuasion this scene.",
  },
  "smell of man": {
    cost: { gnosis: 1 },
    duration: "scene",
    description:
      "Animals shy away from you in fear. Wolves and dogs make a Willpower roll vs 7 to approach.",
  },
  "city running": {
    cost: { gnosis: 1 },
    duration: "scene",
    description:
      "Move through urban terrain at full running speed without obstruction.",
  },
  "master of fire": {
    roll: { pool: "Willpower", difficulty: 7 },
    cost: { gnosis: 1 },
    duration: "scene",
    description:
      "Handle and command fire without injury; fire harms only at your bidding.",
  },
  "primal anger": {
    cost: { gnosis: 1 },
    description:
      "Gain Rage dice equal to your Gnosis rating for one turn.",
  },
  "rat head": {
    cost: { gnosis: 1 },
    duration: "scene",
    description:
      "Shrink your head and shoulders to squeeze through small openings.",
  },
  "stench": {
    cost: { gnosis: 1 },
    duration: "scene",
    description:
      "Emit a foul smell; opponents within 10 feet suffer -2 dice to all actions.",
  },
  "resist toxin": {
    cost: { gnosis: 1 },
    description:
      "Negate the effects of one ingested or inhaled toxin or poison.",
  },
  "cooking": {
    description:
      "Make any organic matter palatable and nutritious. Reflexive, no cost.",
  },
  "scent of sweet honey": {
    roll: { pool: "Gnosis", difficulty: 7 },
    cost: { gnosis: 1 },
    description:
      "Target reeks of honey to all Wyrm-creatures, drawing their attention.",
  },
  "mercy": {
    roll: { pool: "Perception+Empathy", difficulty: 7 },
    description:
      "Detect when an opponent is incapacitated or willing to surrender.",
  },
  "jam weapon": {
    roll: { pool: "Gnosis", difficulty: 7 },
    cost: { gnosis: 1 },
    description:
      "Cause a single mechanical weapon within sight to jam or malfunction.",
  },
  "faerie light": {
    cost: { gnosis: 1 },
    duration: "scene",
    description:
      "Conjure a soft, drifting light that illuminates a small area.",
  },
  "lightning reflexes": {
    cost: { rage: 1 },
    duration: "turn",
    description:
      "Add Rage to your initiative for one turn.",
  },
  "visage of fenris": {
    cost: { rage: 1 },
    duration: "scene",
    description:
      "Your features turn fierce and intimidating; +3 dice to Intimidation for the scene.",
  },
  "trick shot": {
    roll: { pool: "Dexterity+Firearms", difficulty: 8 },
    cost: { gnosis: 1 },
    description:
      "Make a single trick shot with a firearm that ignores normal limits.",
  },
  "diagnostics": {
    roll: { pool: "Perception+Technology", difficulty: 6 },
    description:
      "Instantly diagnose any malfunctioning machine you can see or touch.",
  },

  // --- Level 2 ---
  "staredown": {
    roll: { pool: "Charisma+Intimidation", difficulty: 7 },
    cost: { gnosis: 1 },
    description:
      "Lock eyes with a target; on a contest with their Willpower, the loser flees or freezes.",
  },
  "true fear": {
    roll: { pool: "Charisma+Intimidation", difficulty: 7 },
    cost: { rage: 1 },
    description:
      "Mortals within sight flee for one turn per success; supernatural targets contest Willpower.",
  },
  "silver claws": {
    cost: { gnosis: 1, rage: 1 },
    duration: "scene",
    description:
      "Your claws gleam with silver and inflict aggravated damage to other Garou for the scene.",
  },
  "human guise": {
    cost: { gnosis: 1 },
    duration: "scene",
    description:
      "Conceal supernatural features and the Delirium effect from witnesses for the scene.",
  },
  "name the spirit": {
    roll: { pool: "Perception+Occult", difficulty: 6 },
    description:
      "Learn the true name of any spirit you encounter, granting +2 dice to influence it.",
  },
  "calm": {
    roll: { pool: "Charisma+Empathy", difficulty: 7 },
    cost: { gnosis: 1 },
    description:
      "Soothe one target out of frenzy or panic; contest their Willpower with successes.",
  },
  "dazzle": {
    roll: { pool: "Charisma+Performance", difficulty: 7 },
    cost: { gnosis: 1 },
    description:
      "Target is briefly stunned and loses one turn per success.",
  },
  "troll skin": {
    cost: { rage: 1 },
    duration: "scene",
    description:
      "Your hide thickens; gain +2 soak dice for the scene.",
  },
  "clap of thunder": {
    roll: { pool: "Stamina+Primal-Urge", difficulty: 7 },
    cost: { rage: 1 },
    description:
      "A deafening clap stuns all within hearing; one turn dazed per success.",
  },
  "luna's armor": {
    cost: { gnosis: 1 },
    duration: "scene",
    description:
      "Gain +2 soak dice against all damage for the scene.",
  },
  "clarity": {
    roll: { pool: "Perception+Enigmas", difficulty: 6 },
    description:
      "See through one illusion, glamour, or shroud you currently observe.",
  },
};

// Merge action overlay into the canonical entries.
for (const [k, action] of Object.entries(WTA_GIFT_ACTIONS)) {
  if (WTA_GIFTS[k]) WTA_GIFTS[k] = { ...WTA_GIFTS[k], action };
}

/** Returns all gifts available for a given pool ID (breed/auspice/tribe id). */
export function giftsForPool(poolId: string): IGiftDef[] {
  return Object.values(WTA_GIFTS).filter((g) => g.source.includes(poolId));
}
