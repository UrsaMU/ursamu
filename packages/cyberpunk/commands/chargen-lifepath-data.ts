/**
 * Static lookup tables for lifepath roll/detail functions.
 * Extracted to keep chargen.ts under 200 lines.
 */

/** [region, languages string (comma-sep)] indexed by 1-10 */
export const CULTURAL_TABLE: [string, string][] = [
  ["", ""],  // pad so index === roll
  ["North American",           "Chinese, Cree, Creole, English, French, Navajo, Spanish"],
  ["South/Central American",   "Creole, English, German, Guarani, Mayan, Portuguese, Spanish"],
  ["Western European",         "Dutch, English, French, German, Italian, Norwegian, Spanish"],
  ["Eastern European",         "English, Finnish, Polish, Romanian, Russian, Ukrainian"],
  ["Middle Eastern/N African", "Arabic, Berber, English, Farsi, French, Hebrew, Turkish"],
  ["Sub-Saharan African",      "Arabic, English, French, Hausa, Lingala, Swahili, Yoruba"],
  ["South Asian",              "Bengali, Dari, English, Hindi, Nepali, Tamil, Urdu"],
  ["South East Asian",         "Arabic, Burmese, English, Filipino, Indonesian, Vietnamese"],
  ["East Asian",               "Cantonese, English, Japanese, Korean, Mandarin, Mongolian"],
  ["Oceania/Pacific Islander", "English, French, Hawaiian, Maori, Pama-Nyungan, Tahitian"],
];

/** [personality, clothingStyle, hairstyle] indexed by 1-10 */
export const PERSONALITY_TABLE: [string, string, string][] = [
  ["", "", ""],
  ["Shy and secretive",              "Generic Chic",   "Mohawk"],
  ["Rebellious, antisocial, violent","Leisurewear",    "Long and ratty"],
  ["Arrogant, proud, aloof",         "Urban Flash",    "Short and spiked"],
  ["Moody, rash, headstrong",        "Businesswear",   "Wild and all over"],
  ["Picky, fussy, nervous",          "High Fashion",   "Bald"],
  ["Stable and serious",             "Bohemian",       "Striped"],
  ["Silly and fluff-headed",         "Bag Lady Chic",  "Wild colors"],
  ["Sneaky and deceptive",           "Gang Colors",    "Neat and short"],
  ["Intellectual and detached",      "Nomad Leathers", "Short and curly"],
  ["Friendly and outgoing",          "Asia Pop",       "Long and straight"],
];

/** [lifeGoal, feelingAboutPeople] indexed by 1-10 */
export const LIFE_GOAL_TABLE: [string, string][] = [
  ["", ""],
  ["Get rid of a bad reputation.",    "I stay neutral."],
  ["Gain power and control.",         "I stay neutral."],
  ["Get off the Street.",             "I like almost everyone."],
  ["Make those who crossed you pay.", "I hate almost everyone."],
  ["Live down your past life.",       "People are tools. Use them."],
  ["Hunt down the responsible.",      "Every person is valuable."],
  ["Get what is rightfully yours.",   "People are obstacles."],
  ["Save someone from your past.",    "People are untrustworthy."],
  ["Gain fame and recognition.",      "Wipe em all out."],
  ["Make this a better world.",       "People are wonderful!"],
];

/** [mostValuableThing, mostValuablePerson, whatYouValue] indexed by 1-10 */
export const VALUES_TABLE: [string, string, string][] = [
  ["", "", ""],
  ["A weapon",             "A parent",        "Money"],
  ["A tool",               "A sibling",       "Honor"],
  ["A piece of clothing",  "A lover",         "Your word"],
  ["A photograph",         "A friend",        "Honesty"],
  ["A book or diary",      "Yourself",        "Knowledge"],
  ["A recording",          "A pet",           "Vengeance"],
  ["A musical instrument", "A mentor",        "Love"],
  ["A piece of jewelry",   "A public figure", "Power"],
  ["A toy",                "A personal hero", "Family"],
  ["A letter",             "No one",          "Friendship"],
];

/** [familyBackground, childhoodEnvironment] indexed by 1-10 */
export const FAMILY_TABLE: [string, string][] = [
  ["", ""],
  ["Corporate Execs",       "Ran on the Street, no adult supervision."],
  ["Corporate Managers",    "Safe Corp Zone, walled off from the City."],
  ["Corporate Technicians", "In a Nomad pack moving place to place."],
  ["Nomad Pack",            "Nomad pack rooted in transport (ships, trucks)."],
  ["Ganger Family",         "Decaying neighborhood, holding off boosters."],
  ["Combat Zoners",         "Heart of the Combat Zone, squatting in ruins."],
  ["Urban Homeless",        "Huge megastructure controlled by a Corp."],
  ["Megastructure Rats",    "Ruins of a deserted town taken by Reclaimers."],
  ["Reclaimers",            "A Drift Nation -- floating offshore city."],
  ["Edgerunners",           "Corporate luxury starscraper, above the rabble."],
];

/** familyCrisis indexed by 1-10 */
export const FAMILY_CRISIS_TABLE: string[] = [
  "",
  "Your family lost everything through betrayal.",
  "Your family lost everything through bad management.",
  "Your family was exiled from their home, nation, or Corp.",
  "Your family is imprisoned. You alone escaped.",
  "Your family vanished. You are the only remaining member.",
  "Your family was killed. You were the only survivor.",
  "Your family is part of a conspiracy or crime organization.",
  "Your family was scattered to the winds by misfortune.",
  "Your family carries a hereditary feud lasting generations.",
  "You inherited a family debt you must honor before moving on.",
];

/** friend relationship indexed by 1-10 */
export const FRIEND_TABLE: string[] = [
  "",
  "Like an older sibling to you.",
  "Like a younger sibling to you.",
  "A teacher or mentor.",
  "A partner or coworker.",
  "A former lover.",
  "An old enemy -- complicated.",
  "Like a parent to you.",
  "An old childhood friend.",
  "Someone you know from the Street.",
  "Someone with a common interest or goal.",
];

/** [who] indexed by 1-10 */
export const ENEMY_WHO_TABLE: string[] = [
  "",
  "Ex-friend",
  "Ex-lover",
  "Estranged relative",
  "Childhood enemy",
  "Someone you employ",
  "Your employer",
  "Partner or coworker",
  "Corporate executive",
  "Government official",
  "Boosterganger",
];

/** [cause] indexed by 1-10 */
export const ENEMY_CAUSE_TABLE: string[] = [
  "",
  "Caused the loss of your face or status.",
  "Caused the loss of a loved one.",
  "A major public humiliation.",
  "Accused you of cowardice or a dishonorable act.",
  "Deserted or betrayed you in a tight spot.",
  "Turned down a job or a romantic advance.",
  "You just do not like each other. No dramatic reason.",
  "Romantic rivalry -- they wanted what you had, or vice versa.",
  "Business rivalry that got personal.",
  "Set you up for a crime, guilty or not.",
];

/** [resources] indexed by 1-10 (full mechanical text) */
export const ENEMY_RESOURCES_TABLE: string[] = [
  "",
  "Just themselves. No backup, no allies. Threat: one street-level NPC.",
  "Just themselves. Determined and personal. Threat: one street-level NPC.",
  "Them and 1 friend. A pair -- coordinated but small. Threat: 2 NPCs.",
  "Them and d6/2 friends (1-3 allies). Small crew. Threat: ~Threat 2 group.",
  "Them and d10/2 friends (1-5 allies). A solid crew. Threat: ~Threat 3 group.",
  "A gang of d10+5 members (6-15). Organized street muscle. Threat: gang encounter.",
  "Local cops. A beat precinct with jurisdiction. Can detain, harass, and obstruct. Not a strike team.",
  "A gang lord or small Corp. Resources, lawyers, hired muscle. Threat: ongoing campaign.",
  "A powerful Corp. Serious surveillance, wetwork teams, legal pressure. Threat: major arc.",
  "City government or federal agency. Near-unlimited reach. Threat: campaign-level threat.",
];

/** lifeEvent indexed by 1-10 */
export const LIFE_EVENTS_TABLE: string[] = [
  "",
  "You were imprisoned for a crime, guilty or not.",
  "Your home was destroyed -- fire, disaster, or demolition.",
  "You discovered something valuable and it made you enemies.",
  "You ran with a gang for a while. It did not end well.",
  "You crossed a corporation. They have not forgotten.",
  "You lost everything on a deal gone bad.",
  "You were cybered up against your will, or made a bad deal.",
  "You were betrayed by someone you trusted completely.",
  "You killed someone. It was necessary. Probably.",
  "You found something in the Ruins that changed everything.",
];

export const ROLE_EVENTS: Record<string, string[]> = {
  solo:      ["","First kill. You were sixteen. It was self-defense. Mostly.","The job that made your reputation -- and the one that haunts you.","You trained under someone legendary. They are gone now.","A contract that crossed a line you did not know you had.","You refused a kill. It cost you everything. Worth it?","The war story that ends every argument in a bar."],
  rockerboy: ["","The song that got you banned from three city zones.","The night the crowd turned and it almost went sideways.","The moment you realized your music could actually change things.","You burned a bridge with a major label. On purpose.","The collaborator who sold you out. The track is still good.","The performance that put you on the blacklist."],
  netrunner: ["","First time deep in the Net alone. Something was watching.","The ICE that almost flatlined you. You still dream about it.","The data you copied that you were never supposed to see.","A corp ghost in the code that followed you home.","The run that paid for your best deck. Do not ask how.","You found something in a dead Archive that changed your worldview."],
  tech:      ["","The rig you built that should not have worked. It did.","A corpo patent you reverse-engineered. They noticed.","The repair job that saved lives. No one knows it was you.","A piece of tech you built that got someone killed.","You found schematics in the Ruins that nobody else has.","The machine that broke your heart -- and you fixed it anyway."],
  medtech:   ["","A patient you could not save. It changed how you work.","Ripperdoc work on the wrong side of the law. Necessary.","The surgery you performed in a Combat Zone with no equipment.","A corp tried to steal your research. You made them regret it.","The treatment you invented that the corps want buried.","Someone you saved who should not have survived. They know it too."],
  media:     ["","The story that got your editor disappeared.","You have footage that could topple a government. Maybe two.","The interview that went live before they could stop it.","A source you burned by accident. You still carry that.","The embed assignment that radicalized you.","The piece that got you blacklisted from every major outlet."],
  exec:      ["","The merger that destroyed a community. You greenlit it.","A hostile takeover you survived -- barely.","The subordinate you sacrificed to protect the quarterly report.","You discovered corruption at the top. You are still deciding.","The deal that made you rich and the one that made you doubt everything.","Someone loyal to you took a bullet meant for the Corp. Not you."],
  lawman:    ["","The collar you made that cost you your partner.","The evidence that disappeared before trial. You know who took it.","A riot you helped put down. You still see their faces.","The case that convinced you the system is broken.","A perp you let walk. You had good reason. Probably.","The precinct you transferred out of before everything went bad."],
  fixer:     ["","The deal that made your reputation and the one that nearly ended it.","A client who became a liability. You handled it.","The network you built from nothing -- and who wants to burn it down.","A job you brokered that went sideways. The fallout follows you.","The favor you are still owed. You are patient.","You know where the bodies are buried. Literally."],
  nomad:     ["","The reason you left the pack. Or were pushed.","The ambush that cost you family. You memorized every face.","The road you cannot go back to. Not yet.","A corp convoy you hit. They have a long memory.","The town that took you in when your pack was destroyed.","The map in your head of every safe route in the Badlands."],
};
