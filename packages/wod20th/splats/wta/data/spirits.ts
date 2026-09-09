// splats/wta/data/spirits.ts -- WtA Spirit catalog (totems, gafflings, jagglings,
// incarnae, celestines, and triat archetypes). Keyed by lowercase-kebab slug.
//
// Stats follow the M20 Werewolf core/Book of the Wyrm guidelines: Rage, Gnosis,
// Willpower, Power. For totems we also note the background-cost equivalence
// (totemCost) and the boons granted to a pack that takes them.
//
// This is a curated foundation, not an exhaustive bestiary. When canonical
// stats are uncertain the entry is rounded to the genre average rather than
// guessed precisely.

import type { ISpiritDef, SpiritType } from "../../../core/types.ts";

const spirit = (
  slug: string,
  name: string,
  type: SpiritType,
  rage: number,
  gnosis: number,
  willpower: number,
  power: number,
  charms: string[],
  ban: string,
  extras: Partial<Pick<ISpiritDef, "notes" | "totemCost" | "totemBoons">> = {},
): ISpiritDef => ({
  slug, name, type, rage, gnosis, willpower, power,
  charms: charms.slice(),
  ban,
  ...extras,
});

export const WTA_SPIRITS: Record<string, ISpiritDef> = {
  // -- Tribal totems (canon) -------------------------------------------------
  "wolf": spirit(
    "wolf", "Wolf", "totem", 7, 5, 6, 25,
    ["Airt Sense", "Materialize", "Re-Form", "Spirit Speech"],
    "Wolf will never abandon a packmate in need.",
    { totemCost: 7, totemBoons: ["+1 Stamina in wolf forms", "+1 die to Survival rolls", "Pack always knows the cardinal direction of home."] },
  ),
  "stag": spirit(
    "stag", "Stag", "totem", 4, 7, 7, 30,
    ["Airt Sense", "Healing", "Materialize", "Re-Form"],
    "Stag will not refuse aid to one who asks honorably.",
    { totemCost: 5, totemBoons: ["+1 Willpower per session", "Pack regenerates Bashing one level faster in forested areas."] },
  ),
  "bear": spirit(
    "bear", "Bear (Great Mother)", "totem", 6, 6, 8, 30,
    ["Armor", "Healing", "Materialize", "Re-Form"],
    "Bear will not abandon her cubs (those under her protection).",
    { totemCost: 8, totemBoons: ["+1 Stamina", "Pack regenerates one extra health level when resting."] },
  ),
  "raven": spirit(
    "raven", "Raven", "totem", 5, 6, 5, 20,
    ["Airt Sense", "Re-Form", "Spirit Speech", "Tracking"],
    "Raven will not pass up a chance to gather news or stories.",
    { totemCost: 3, totemBoons: ["+2 dice to Alertness", "Pack hears rumors first."] },
  ),
  "falcon": spirit(
    "falcon", "Falcon", "totem", 7, 6, 6, 25,
    ["Airt Sense", "Materialize", "Re-Form", "Spirit Speech"],
    "Falcon will not allow injustice to pass unchallenged.",
    { totemCost: 6, totemBoons: ["+3 dice to Leadership", "Pack members can call on Falcon for one extra Willpower per scene of just deeds."] },
  ),
  "owl": spirit(
    "owl", "Owl", "totem", 5, 7, 5, 25,
    ["Airt Sense", "Materialize", "Re-Form", "Spirit Speech"],
    "Owl will only hunt at night; the pack must do its grimmest work after dark.",
    { totemCost: 6, totemBoons: ["+3 dice to Stealth in shadow", "+1 die to Enigmas at night."] },
  ),
  "pegasus": spirit(
    "pegasus", "Pegasus", "totem", 5, 6, 7, 25,
    ["Airt Sense", "Materialize", "Re-Form", "Tracking"],
    "Pegasus will not suffer cruelty to women or beasts of burden.",
    { totemCost: 5, totemBoons: ["+2 dice to Empathy", "Pack travel speed in Umbra is doubled."] },
  ),
  "unicorn": spirit(
    "unicorn", "Unicorn", "totem", 4, 7, 7, 30,
    ["Healing", "Materialize", "Re-Form", "Spirit Speech"],
    "Unicorn will not aid those who shed innocent blood.",
    { totemCost: 7, totemBoons: ["+1 to Soak Bashing", "Pack heals others (not self) one extra level."] },
  ),
  "grandfather-thunder": spirit(
    "grandfather-thunder", "Grandfather Thunder", "totem", 8, 6, 7, 30,
    ["Airt Sense", "Lightning Bolt", "Materialize", "Re-Form"],
    "Grandfather Thunder demands deference; you must never refuse his summons.",
    { totemCost: 7, totemBoons: ["+2 dice to Intimidation", "Pack may channel +1 die to attack during storms."] },
  ),
  "cockroach": spirit(
    "cockroach", "Cockroach", "totem", 5, 7, 6, 25,
    ["Airt Sense", "Materialize", "Re-Form", "Survival"],
    "Cockroach demands his children stay adaptable -- never refuse a new tool or idea.",
    { totemCost: 5, totemBoons: ["+1 die to Technology", "Pack can always find shelter in urban environments."] },
  ),
  "rat": spirit(
    "rat", "Rat", "totem", 5, 5, 6, 20,
    ["Airt Sense", "Materialize", "Re-Form", "Tracking"],
    "Rat insists the pack feed the hungry whenever it can.",
    { totemCost: 3, totemBoons: ["+1 die to Streetwise", "Pack always finds food and shelter in cities."] },
  ),
  "wendigo": spirit(
    "wendigo", "Wendigo", "totem", 8, 5, 7, 30,
    ["Airt Sense", "Freeze", "Materialize", "Re-Form"],
    "Wendigo's children must never break bread with those who wrong the land.",
    { totemCost: 7, totemBoons: ["+2 dice to Brawl in cold", "Pack ignores cold-weather penalties."] },
  ),
  "fenris": spirit(
    "fenris", "Great Fenris", "totem", 9, 5, 7, 30,
    ["Airt Sense", "Berserker Rage", "Materialize", "Re-Form"],
    "Fenris demands his children never flee a fight they can possibly win.",
    { totemCost: 7, totemBoons: ["+2 dice to Brawl", "Pack adds +1 to soak Lethal in melee."] },
  ),
  "uktena": spirit(
    "uktena", "Uktena", "totem", 6, 7, 6, 30,
    ["Airt Sense", "Materialize", "Re-Form", "Solidify Reality"],
    "Uktena demands his children investigate every mystery they encounter.",
    { totemCost: 6, totemBoons: ["+1 die to Occult", "Pack senses bound spirits within a mile."] },
  ),
  "chimera": spirit(
    "chimera", "Chimera", "totem", 5, 8, 6, 25,
    ["Airt Sense", "Materialize", "Re-Form", "Shapeshift"],
    "Chimera's pack must never refuse a quest to learn forbidden lore.",
    { totemCost: 6, totemBoons: ["+1 die to Enigmas", "Pack may attempt a free Gnosis roll once per session to see truth."] },
  ),
  "stormcrow": spirit(
    "stormcrow", "Stormcrow", "totem", 6, 6, 6, 25,
    ["Airt Sense", "Lightning Bolt", "Materialize", "Re-Form"],
    "Stormcrow demands the pack pick up and move on at the close of each season.",
    { totemCost: 5, totemBoons: ["+1 die to Survival", "Pack flies on winds during storms."] },
  ),
  "buffalo": spirit(
    "buffalo", "Buffalo", "totem", 5, 6, 8, 30,
    ["Airt Sense", "Materialize", "Re-Form", "Trample"],
    "Buffalo demands his children waste nothing they take from the world.",
    { totemCost: 5, totemBoons: ["+1 to Stamina-based rolls", "Pack endurance doubled for forced marches."] },
  ),
  "monkey-king": spirit(
    "monkey-king", "Monkey King", "totem", 6, 7, 6, 25,
    ["Airt Sense", "Materialize", "Re-Form", "Trickster's Mask"],
    "Monkey King's pack must mock authority at least once per moot.",
    { totemCost: 5, totemBoons: ["+1 die to Subterfuge", "Pack ignores first failed Etiquette penalty per scene."] },
  ),
  "coyote": spirit(
    "coyote", "Coyote", "totem", 6, 7, 6, 25,
    ["Airt Sense", "Materialize", "Re-Form", "Trickster's Mask"],
    "Coyote's pack must never give a straight answer to a direct question.",
    { totemCost: 4, totemBoons: ["+2 dice to Subterfuge", "Pack may reroll one botched roll per session."] },
  ),

  // -- Pack-scale totems (smaller boons) -------------------------------------
  "cuckoo": spirit(
    "cuckoo", "Cuckoo", "totem", 4, 6, 4, 15,
    ["Airt Sense", "Materialize", "Re-Form"],
    "Cuckoo's pack must always hide in plain sight; never claim its true name to strangers.",
    { totemCost: 3, totemBoons: ["+2 dice to Subterfuge when impersonating someone."] },
  ),
  "salmon": spirit(
    "salmon", "Salmon", "totem", 3, 7, 5, 20,
    ["Airt Sense", "Materialize", "Re-Form", "Wisdom of the Ages"],
    "Salmon's pack must teach what it knows whenever asked sincerely.",
    { totemCost: 4, totemBoons: ["+1 die to all Knowledge rolls."] },
  ),
  "spider": spirit(
    "spider", "Spider (Grandmother)", "totem", 5, 7, 5, 25,
    ["Airt Sense", "Materialize", "Re-Form", "Web Sense"],
    "Spider's children must finish what they start, no matter how long it takes.",
    { totemCost: 5, totemBoons: ["+1 die to Investigation", "Pack senses any web-bound creature within a mile."] },
  ),
  "snake": spirit(
    "snake", "Snake", "totem", 6, 6, 5, 20,
    ["Airt Sense", "Materialize", "Re-Form", "Venom"],
    "Snake demands her children shed old grudges every spring.",
    { totemCost: 4, totemBoons: ["+1 die to Stealth", "Pack ignores first poison damage per scene."] },
  ),

  // -- Common Gafflings ------------------------------------------------------
  "storm-spirit": spirit(
    "storm-spirit", "Storm-Spirit", "gaffling", 5, 4, 4, 12,
    ["Airt Sense", "Lightning Bolt", "Materialize"],
    "Will not enter a building before lightning has struck it once.",
  ),
  "fire-spirit": spirit(
    "fire-spirit", "Fire-Spirit", "gaffling", 6, 3, 3, 10,
    ["Airt Sense", "Flame", "Materialize"],
    "Cannot abide running water; bound by a poured circle of it.",
  ),
  "water-spirit": spirit(
    "water-spirit", "Water-Spirit", "gaffling", 3, 5, 4, 12,
    ["Airt Sense", "Healing", "Materialize"],
    "Will not cross dry stone unbroken by green growth.",
  ),
  "tree-spirit": spirit(
    "tree-spirit", "Tree-Spirit", "gaffling", 2, 6, 6, 15,
    ["Airt Sense", "Healing", "Materialize", "Root"],
    "Cannot leave its tree's territory; dies if the tree is felled.",
  ),
  "stone-spirit": spirit(
    "stone-spirit", "Stone-Spirit", "gaffling", 3, 5, 7, 15,
    ["Airt Sense", "Armor", "Materialize"],
    "Will not move if commanded to abandon the place it was named.",
  ),
  "wind-spirit": spirit(
    "wind-spirit", "Wind-Spirit", "gaffling", 4, 5, 4, 12,
    ["Airt Sense", "Materialize", "Wind-Rush"],
    "Cannot pass through closed iron without invitation.",
  ),
  "anger-of-wolf": spirit(
    "anger-of-wolf", "Anger of Wolf", "gaffling", 7, 3, 4, 12,
    ["Berserker Rage", "Materialize"],
    "Will not aid a Garou who has shed packmate blood.",
  ),
  "song-of-wolf": spirit(
    "song-of-wolf", "Song of Wolf", "gaffling", 3, 5, 4, 12,
    ["Airt Sense", "Materialize", "Spirit Speech"],
    "Must answer truthfully if addressed by full howl-name.",
  ),
  "cunning-of-fox": spirit(
    "cunning-of-fox", "Cunning of Fox", "gaffling", 4, 6, 4, 14,
    ["Materialize", "Trickster's Mask"],
    "Will not aid a hunter who already has their prey cornered.",
  ),
  "mouse-spirit": spirit(
    "mouse-spirit", "Mouse-Spirit", "gaffling", 2, 5, 3, 10,
    ["Airt Sense", "Materialize", "Tracking"],
    "Refuses to harm any creature smaller than itself.",
  ),
  "crow-spirit": spirit(
    "crow-spirit", "Crow-Spirit", "gaffling", 4, 5, 4, 12,
    ["Airt Sense", "Materialize", "Spirit Speech"],
    "Must accept any shiny gift offered in honest trade.",
  ),
  "machine-spirit": spirit(
    "machine-spirit", "Machine-Spirit", "gaffling", 4, 5, 5, 14,
    ["Airt Sense", "Materialize", "Short Out"],
    "Cannot abide neglect; abandons devices left to rust.",
  ),
  "city-father": spirit(
    "city-father", "City-Father", "jaggling", 5, 7, 7, 25,
    ["Airt Sense", "Materialize", "Re-Form", "Solidify Reality"],
    "Must defend its city from invaders, even at cost to itself.",
  ),
  "river-grandmother": spirit(
    "river-grandmother", "River Grandmother", "jaggling", 4, 8, 7, 25,
    ["Airt Sense", "Healing", "Materialize", "Re-Form"],
    "Will not aid those who poison her waters.",
  ),
  "mountain-elder": spirit(
    "mountain-elder", "Mountain Elder", "jaggling", 5, 7, 9, 30,
    ["Airt Sense", "Armor", "Materialize", "Re-Form"],
    "Speaks only once per generation; demands the question be worthy.",
  ),
  "forest-warden": spirit(
    "forest-warden", "Forest Warden", "jaggling", 6, 7, 7, 25,
    ["Airt Sense", "Healing", "Materialize", "Re-Form", "Root"],
    "Will not suffer fire-bearers in the deep wood.",
  ),
  "moon-walker": spirit(
    "moon-walker", "Moon-Walker (Lune)", "jaggling", 5, 7, 6, 20,
    ["Airt Sense", "Materialize", "Re-Form", "Spirit Speech"],
    "Cannot appear during the new moon; loses Power in sunlight.",
  ),

  // -- Incarnae / Celestines (rare, named) -----------------------------------
  "helios": spirit(
    "helios", "Helios", "celestine", 9, 9, 10, 50,
    ["Airt Sense", "Flame", "Re-Form", "Solidify Reality", "Sunlight"],
    "Will not directly oppose Luna; cannot manifest at night.",
  ),
  "luna": spirit(
    "luna", "Luna", "celestine", 8, 10, 10, 50,
    ["Airt Sense", "Re-Form", "Solidify Reality", "Spirit Speech", "Moon Phases"],
    "Will not directly oppose Helios; expresses different faces by moon phase.",
  ),
  "gaia": spirit(
    "gaia", "Gaia", "celestine", 7, 10, 10, 50,
    ["Airt Sense", "Healing", "Re-Form", "Solidify Reality", "Spirit Speech"],
    "Will not aid those whose hands are stained with Wyrm-taint.",
  ),

  // -- Triat archetypes ------------------------------------------------------
  "wyrm-bane": spirit(
    "wyrm-bane", "Bane (Wyrm-spawn)", "wyrm", 6, 4, 4, 15,
    ["Corruption", "Materialize", "Re-Form"],
    "Cannot abide pure caern light; banished by Rite of Cleansing.",
    { notes: "Generic Bane stat block; specific Banes vary widely." },
  ),
  "weaver-pattern-spider": spirit(
    "weaver-pattern-spider", "Pattern Spider", "weaver", 4, 6, 6, 20,
    ["Airt Sense", "Materialize", "Solidify Reality", "Web Sense"],
    "Must classify and bind every chaos it encounters.",
  ),
  "wyld-engling": spirit(
    "wyld-engling", "Engling (Wyld-spirit)", "wyld", 6, 6, 4, 15,
    ["Airt Sense", "Materialize", "Shapeshift", "Spirit Speech"],
    "Cannot remain in one form longer than a single scene.",
  ),
};

// -- Helpers ----------------------------------------------------------------

export function getSpirit(slug: string): ISpiritDef | undefined {
  if (typeof slug !== "string") return undefined;
  const key = slug.toLowerCase().trim();
  if (!key) return undefined;
  // Defensive: only return own properties so __proto__ / constructor / toString
  // never resolve to JS internals.
  if (!Object.prototype.hasOwnProperty.call(WTA_SPIRITS, key)) return undefined;
  return WTA_SPIRITS[key];
}

export function findByType(type: SpiritType): ISpiritDef[] {
  return Object.values(WTA_SPIRITS).filter((s) => s.type === type);
}

export const SPIRIT_TYPES: readonly SpiritType[] = [
  "totem", "gaffling", "jaggling", "incarna", "celestine", "wyrm", "weaver", "wyld",
];
