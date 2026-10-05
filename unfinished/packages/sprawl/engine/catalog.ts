/** All Sprawl Goons JSON catalogs — slug lookup. */
import stats from "../data/stats.json" with { type: "json" };
import backgrounds from "../data/backgrounds.json" with {
  type: "json",
};
import belongings from "../data/belongings.json" with {
  type: "json",
};
import affectations from "../data/affectations.json" with {
  type: "json",
};
import accessories from "../data/accessories.json" with {
  type: "json",
};
import quirks from "../data/quirks.json" with { type: "json" };
import streetTechQuirks from "../data/street-tech-quirks.json" with {
  type: "json",
};
import firearms from "../data/firearms.json" with { type: "json" };
import melee from "../data/melee.json" with { type: "json" };
import armor from "../data/armor.json" with { type: "json" };
import heavy from "../data/heavy-weapons.json" with {
  type: "json",
};
import ammo from "../data/ammo.json" with { type: "json" };
import weaponMods from "../data/weapon-mods.json" with {
  type: "json",
};
import drones from "../data/drones.json" with { type: "json" };
import augs from "../data/augmentations.json" with {
  type: "json",
};
import augOrigin from "../data/aug-origin.json" with {
  type: "json",
};
import shards from "../data/shardware.json" with { type: "json" };
import consoles from "../data/consoles.json" with { type: "json" };
import consoleUpgrades from "../data/console-upgrades.json" with {
  type: "json",
};
import exploits from "../data/exploits.json" with { type: "json" };
import netExploits from "../data/net-exploits.json" with {
  type: "json",
};
import hackTargets from "../data/hack-targets.json" with {
  type: "json",
};
import systemResponses from "../data/system-responses.json" with {
  type: "json",
};
import software from "../data/software.json" with { type: "json" };
import netAi from "../data/net-ai.json" with { type: "json" };
import paradoxware from "../data/paradoxware.json" with {
  type: "json",
};
import nodejackerHw from "../data/nodejacker-hardware.json" with {
  type: "json",
};
import companyData from "../data/company-data.json" with {
  type: "json",
};
import narcotics from "../data/narcotics.json" with {
  type: "json",
};
import withdrawal from "../data/withdrawal.json" with {
  type: "json",
};
import vehicles from "../data/vehicles.json" with { type: "json" };
import vehicleMods from "../data/vehicle-mods.json" with {
  type: "json",
};
import maneuvers from "../data/maneuvers.json" with {
  type: "json",
};
import showroom from "../data/showroom.json" with { type: "json" };
import mechanics from "../data/mechanics.json" with {
  type: "json",
};
import antagonists from "../data/antagonists.json" with {
  type: "json",
};
import flowDistricts from "../data/flow-districts.json" with {
  type: "json",
};
import flowLocations from "../data/flow-locations.json" with {
  type: "json",
};
import market from "../data/market.json" with { type: "json" };
import corps from "../data/corporations.json" with {
  type: "json",
};
import difficulty from "../data/difficulty.json" with {
  type: "json",
};
import lexicon from "../data/lexicon.json" with { type: "json" };
import defaults from "../data/chargen-defaults.json" with {
  type: "json",
};
import combatRules from "../data/combat-rules.json" with {
  type: "json",
};
import healingRules from "../data/healing-rules.json" with {
  type: "json",
};
import metalExpress from "../data/metal-express-rules.json" with {
  type: "json",
};
import lookOpeners from "../data/look-openers.json" with {
  type: "json",
};
import gigContracts from "../data/gig-contracts.json" with {
  type: "json",
};
import gigVenues from "../data/gig-venues.json" with {
  type: "json",
};
import gigObjectives from "../data/gig-objectives.json" with {
  type: "json",
};
import gigBosses from "../data/gig-bosses.json" with {
  type: "json",
};
import gigTargets from "../data/gig-targets.json" with {
  type: "json",
};
import gigRewards from "../data/gig-rewards.json" with {
  type: "json",
};
import gigComplications from "../data/gig-complications.json" with {
  type: "json",
};
import gigRooms from "../data/gig-rooms.json" with {
  type: "json",
};
import gigMinions from "../data/gig-minions.json" with {
  type: "json",
};
import gigSystems from "../data/gig-systems.json" with {
  type: "json",
};

export type Row = Record<string, unknown> & {
  slug: string;
  name?: string;
};

function index(rows: Row[]): Map<string, Row> {
  return new Map(rows.map((r) => [r.slug, r]));
}

export const STATS = stats as Row[];
export const BACKGROUNDS = backgrounds as Row[];
export const BELONGINGS = belongings as Row[];
export const AFFECTATIONS = affectations as Row[];
export const ACCESSORIES = accessories as Row[];
export const LOOK_OPENERS = lookOpeners as Row[];
export const GIG_CONTRACTS = gigContracts as Row[];
export const GIG_VENUES = gigVenues as Row[];
export const GIG_OBJECTIVES = gigObjectives as Row[];
export const GIG_BOSSES = gigBosses as Row[];
export const GIG_TARGETS = gigTargets as Row[];
export const GIG_REWARDS = gigRewards as Record<string, unknown>;
export const GIG_COMPLICATIONS = gigComplications as Row[];
export const GIG_ROOMS = gigRooms as Row[];
export const GIG_MINIONS = gigMinions as Row[];
export const GIG_SYSTEMS = gigSystems as Row[];
export const QUIRKS = quirks as Row[];
export const STREET_TECH_QUIRKS = streetTechQuirks as Row[];
export const FIREARMS = firearms as Row[];
export const MELEE = melee as Row[];
export const ARMOR = armor as Row[];
export const HEAVY = heavy as Row[];
export const AMMO = ammo as Row[];
export const WEAPON_MODS = weaponMods as Row[];
export const DRONES = drones as Row[];
export const AUGS = augs as Row[];
export const AUG_ORIGIN = augOrigin as Row[];
export const SHARDS = shards as Row[];
export const CONSOLES = consoles as Row[];
export const CONSOLE_UPGRADES = consoleUpgrades as Row[];
export const EXPLOITS = exploits as Row[];
/** Fast-hack d66 loot (Nodejacker netbook). */
export const NET_EXPLOITS = netExploits as Row[];
export const HACK_TARGETS = hackTargets as Row[];
export const SYSTEM_RESPONSES = systemResponses as Row[];
export const SOFTWARE = software as Row[];
export const NET_AI = netAi as Row[];
export const PARADOXWARE = paradoxware as Row[];
export const NODEJACKER_HW = nodejackerHw as Row[];
export const COMPANY_DATA = companyData as Row[];
export const NARCOTICS = narcotics as Row[];
export const WITHDRAWAL = withdrawal as Row[];
export const VEHICLES = vehicles as Row[];
export const VEHICLE_MODS = vehicleMods as Row[];
export const MANEUVERS = maneuvers as Row[];
export const SHOWROOM = showroom as Row[];
export const MECHANICS = mechanics as Row[];
export const ANTAGONISTS = antagonists as Row[];
export const FLOW_DISTRICTS = flowDistricts as Row[];
export const FLOW_LOCATIONS = flowLocations as Row[];
export const MARKET = market as Row[];
export const CORPS = corps as Row[];
export const DIFFICULTY = difficulty as Row[];
export const LEXICON = lexicon as Row[];
export const COMBAT_RULES = combatRules as Record<string, unknown>;
export const HEALING_RULES = healingRules as Record<string, unknown>;
export const METAL_EXPRESS = metalExpress as Record<string, unknown>;
export const CHARGEN = defaults as {
  resilience: number;
  loadout: number;
  statPoints: number;
  belongings: number;
  cashDice: string;
  cashMultiplier: number;
  currency: string;
  stats: string[];
  edgeDs?: Record<string, number>;
};

const maps = {
  background: index(BACKGROUNDS),
  belonging: index(BELONGINGS),
  firearm: index(FIREARMS),
  melee: index(MELEE),
  armor: index(ARMOR),
  heavy: index(HEAVY),
  ammo: index(AMMO),
  mod: index(WEAPON_MODS),
  drone: index(DRONES),
  aug: index(AUGS),
  shard: index(SHARDS),
  console: index(CONSOLES),
  consoleUpgrade: index(CONSOLE_UPGRADES),
  exploit: index(EXPLOITS),
  netExploit: index(NET_EXPLOITS),
  hackTarget: index(HACK_TARGETS),
  software: index(SOFTWARE),
  systemResponse: index(SYSTEM_RESPONSES),
  netAi: index(NET_AI),
  paradoxware: index(PARADOXWARE),
  nodejackerHw: index(NODEJACKER_HW),
  companyData: index(COMPANY_DATA),
  narcotic: index(NARCOTICS),
  vehicle: index(VEHICLES),
  vehicleMod: index(VEHICLE_MODS),
  maneuver: index(MANEUVERS),
  showroom: index(SHOWROOM),
  antagonist: index(ANTAGONISTS),
  flow: index(FLOW_LOCATIONS),
  district: index(FLOW_DISTRICTS),
  market: index(MARKET),
  corp: index(CORPS),
  difficulty: index(DIFFICULTY),
  lexicon: index(LEXICON),
  quirk: index(QUIRKS),
  affectation: index(AFFECTATIONS),
  accessory: index(ACCESSORIES),
  lookOpener: index(LOOK_OPENERS),
};

export type CatalogKind = keyof typeof maps;

export function find(
  kind: CatalogKind,
  slug: string,
): Row | undefined {
  return maps[kind].get(slug.toLowerCase());
}

export function findByName(
  rows: Row[],
  q: string,
): Row | undefined {
  const n = q.toLowerCase().trim();
  return rows.find((r) =>
    r.slug === n ||
    String(r.name ?? "").toLowerCase() === n ||
    String(r.name ?? "").toLowerCase().includes(n)
  );
}

/** d66: tens + units → "11".."66" */
export function rollD66(
  rng = () => 1 + Math.floor(Math.random() * 6),
): string {
  return `${rng()}${rng()}`;
}

/** 2d6 total as "02".."12" padded. */
export function roll2d6Key(
  rng = () => 1 + Math.floor(Math.random() * 6),
): string {
  const t = rng() + rng();
  return String(t).padStart(2, "0");
}

export function pickByRoll(
  rows: Row[],
  roll: string,
): Row | undefined {
  const r = roll.padStart(2, "0");
  return rows.find((row) => String(row.roll).padStart(2, "0") === r);
}

export function allGearRows(): Row[] {
  return [
    ...FIREARMS,
    ...MELEE,
    ...ARMOR,
    ...HEAVY,
    ...DRONES,
    ...AMMO,
    ...WEAPON_MODS,
  ];
}
