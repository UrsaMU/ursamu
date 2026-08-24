/** Sprawl Goons character schema (state.sprawl). */

export type StatKey =
  | "morphology"
  | "equilibrium"
  | "reaction"
  | "cognition"
  | "affinity";

export const STAT_KEYS: readonly StatKey[] = [
  "morphology",
  "equilibrium",
  "reaction",
  "cognition",
  "affinity",
] as const;

export type ChargenStatus =
  | "none"
  | "draft"
  | "submitted"
  | "revision"
  | "approved";

export interface ISprawlStats {
  morphology: number;
  equilibrium: number;
  reaction: number;
  cognition: number;
  affinity: number;
}

/** @deprecated Legacy sheet loadout row — prefer world Things. */
export interface ILoadItem {
  slug: string;
  name: string;
  kind: string;
  load: number;
  bonus?: number;
  notes?: string;
}

/** Carried gear lives on IDBObj Things as state.sprawl_item. */
export type SprawlItemKind =
  | "firearm"
  | "melee"
  | "armor"
  | "heavy"
  | "ammo"
  | "mod"
  | "vehicle-mod"
  | "vehicle"
  | "drone"
  | "console"
  | "gear"
  | "drug"
  | "consumable"
  | "weapon";

export type SprawlUseEffect =
  | "narrative"
  | "lazarus"
  | "travel"
  | "cash"
  | `drug:${string}`
  | string;

/** How a carried Thing is presented on the body. */
export type SprawlItemSlot = "carried" | "worn" | "wielded";

/**
 * Mod installed on a host weapon/armor Thing (not a separate
 * inventory row once attached).
 */
export interface SprawlModInstall {
  slug: string;
  name: string;
  effect?: string;
  /** Numeric bonus when tags match the action. */
  bonus?: number;
  /** aim | shot | burst | auto | upgrade-shot | … */
  tags?: string[];
}

/** Stat bonus while the host item is worn (power armor, etc.). */
export interface SprawlStatMod {
  stat: StatKey | string;
  mod: number;
}

/**
 * When item.bonus counts in a fight.
 * Armor defaults to worn; weapons default to always.
 */
export type SprawlBonusWhen =
  | "worn"
  | "wielded"
  | "always"
  | "any";

export interface SprawlItemData {
  slug: string;
  kind: SprawlItemKind | string;
  load: number;
  bonus?: number;
  notes?: string;
  uses?: number;
  usesMax?: number;
  unit?: string;
  useEffect?: SprawlUseEffect;
  /** worn / wielded feed the look generator. */
  slot?: SprawlItemSlot;
  /**
   * Installed mods (weapon holds them). Loose mod Things use
   * kind "mod" until +gear/mod attaches them here.
   */
  mods?: SprawlModInstall[];
  /** For kind=mod: which host kinds accept this (catalog). */
  hostKinds?: string[];
  /** For kind=mod: when this bonus applies. */
  tags?: string[];
  /** Weapon/armor category (shotgun, handgun, …). */
  category?: string;
  /** Loaded specialty ammo slug (hellfires, shredders…). */
  ammoSlug?: string;
  /** Effective range metres (from catalog). */
  rangeM?: number;
  /** Rounds in magazine (firearms / heavy). */
  mag?: number;
  /** Magazine capacity. */
  magMax?: number;
  /**
   * Stat adds while worn (exo-frame Morphology, coil Reaction).
   */
  statMods?: SprawlStatMod[];
  /** Multiply loadoutMax while worn (exo-frame = 2). */
  loadoutMult?: number;
  /** Flat add to loadoutMax while worn. */
  loadoutBonus?: number;
  /**
   * When combat bonus applies. Armor defaults to "worn".
   */
  bonusWhen?: SprawlBonusWhen;
  /**
   * Vehicle hull DS (Metal Express). Damaged hulls lower ds.
   */
  ds?: number;
  dsMax?: number;
  /** Chassis class slug (motorcycle, tanksuit, walker…). */
  chassis?: string;
  /**
   * Who is in the vehicle (PCs + NPC seats).
   * Fire into the hull also checks each occupant DS (p.32).
   */
  occupants?: SprawlOccupant[];
}

/**
 * Passenger / crew seat on a vehicle Thing.
 * NPCs use `ds` as their fight score; PCs use `id` + live sheet.
 */
export interface SprawlOccupant {
  /** Display name. */
  name: string;
  /**
   * NPC fight DS (also acts as their “resilience” pool).
   * Ignored for PCs — use sheet resilience.
   */
  ds: number;
  /** player object id when a PC is seated. */
  id?: string;
  /** driver | passenger | gunner | … */
  role?: string;
  /** antagonist / catalog slug (optional). */
  slug?: string;
  /** true when linked to a player sheet. */
  pc?: boolean;
}

export interface IAugItem {
  slug: string;
  name: string;
  modStat?: string;
  mod?: number;
  notes?: string;
}

export interface ICriticalInjury {
  severity: number;
  severityName: string;
  location: string;
  /** Prose outcome. */
  effect: string;
  at: number;
  /**
   * Mechanical tags: glitch, bleed, limb-out, no-wield,
   * no-run, stun, dying, pain, blind.
   */
  flags?: string[];
  /** Flat penalty to location stats. */
  penalty?: number;
  /** Stats hit by penalty (from location). */
  penaltyStats?: string[];
  /** Resilience lost each attack/scene tick. */
  bleed?: number;
  /** Fatal: rounds until dead without care. */
  dieRounds?: number;
}

/** Player auto-gig (procedural street contract). */
export type GigTier = "easy" | "mod" | "hard" | "legend";
export type GigObjective = "kill-boss" | "hack-node" | "recover";
export type GigStatus = "active" | "token" | "done";

export interface IActiveGig {
  id: string;
  title: string;
  blurb?: string;
  tier: GigTier;
  objective: GigObjective;
  venueSlug: string;
  venueName: string;
  venueBlurb?: string;
  bossSlug?: string;
  bossName: string;
  bossDs: number;
  targetSlug: string;
  targetName: string;
  targetBlurb?: string;
  /** Boss NPC object id once spawned. */
  bossObjId?: string;
  /** Turn-in token object id once dropped. */
  tokenId?: string;
  /** Optional jobs plugin number. */
  jobNumber?: number;
  status: GigStatus;
  payoutMult?: number;
  at: number;
  /** Instanced site room id. */
  siteRoomId?: string;
  /** Where to send the runner on leave. */
  returnRoomId?: string;
  /** Virtual site depth (Phase B). */
  nodesMax?: number;
  /** Current node 1..nodesMax. */
  node?: number;
  /** Current node room flavor. */
  roomSlug?: string;
  roomName?: string;
  roomBlurb?: string;
  /** Full look prose for the site room. */
  roomDesc?: string;
  /** Minions cleared on this node. */
  nodeCleared?: boolean;
  /** Living minion object ids. */
  minionObjIds?: string[];
  minionSlug?: string;
  minionName?: string;
  minionDs?: number;
  minionCount?: number;
  complication?: string;
  complicationBlurb?: string;
  /** Hack-node target DS. */
  hackDs?: number;
  hackTargetSlug?: string;
  hackTargetName?: string;
  /** Primary objective system object id (hack-node). */
  primarySystemId?: string;
  /** Hackable props spawned this node. */
  systemObjIds?: string[];
  /** True when primary objective was hacked. */
  primaryHacked?: boolean;
  /** Party: leader player id (puller). */
  leaderId?: string;
  /** Party: all member ids including leader. */
  crewIds?: string[];
}

/** Invite to join someone else's gig. */
export interface IGigInvite {
  leaderId: string;
  leaderName: string;
  gigId: string;
  title: string;
  tier: string;
  at: number;
}

/** Nodejacker run state from system responses / ICE. */
export interface INetState {
  /** Cannot hack until this time (ms). */
  lockoutUntil?: number;
  /** Console offline until this time (ms). */
  consoleDownUntil?: number;
  /** Temp RAM loss (Malware I). */
  ramPenalty?: number;
  ramPenaltyUntil?: number;
  /** DoS — effective RAM 0 until. */
  ramZeroUntil?: number;
  /** Drive burned (Overload) — RAM stuck at 0. */
  driveBurned?: boolean;
  /** Console destroyed — must re-equip. */
  consoleBurned?: boolean;
  /** Digitally tagged for later trace. */
  tagged?: boolean;
  /** Heat / attention (traces, cops, seekers). */
  heat?: number;
  heatNote?: string;
  /** Maze turns remaining (can't clean jack-out). */
  mazeTurns?: number;
  /** ICE DS bonus on subsequent hacks this run. */
  iceDsBonus?: number;
  /** Malware IV — clean with Cognition vs this DS. */
  malwareCleanDs?: number;
  /** Temp Cognition loss (Surge II). */
  cogPenalty?: number;
  /** Immobilized until (ms). */
  immobileUntil?: number;
  /** Neurostim fog until (ms). */
  neurostimUntil?: number;
  /** Forced disconnect this beat. */
  ejected?: boolean;
  /** Held Fast-Hack exploit slugs (6s → bank). */
  exploits?: string[];
  /** Block next N system responses (Zero Day / Firewall). */
  blockNextResponse?: number;
  /** Auto Upgrade dice on next hack (Stealth Mode). */
  stealthUpgrade?: number;
  /** Extra free hack action available. */
  extraHack?: boolean;
  /** Malware responses ignored for N hacks. */
  malwareImmuneHacks?: number;
  /** Coding/easy scripter: treat coding DS as 12. */
  easyScripter?: boolean;
  /** Back door open until (ms). */
  backDoorUntil?: number;
  lastResponse?: string;
  /** Software DS penalty on targets (Acidburn / BitRot). */
  softDsPenalty?: number;
  softDsPenaltyUntil?: number;
  /** Khali-9 countdown — system dies in N hacks. */
  destroyTurns?: number;
  /** Comms jammed until (ms). */
  jamUntil?: number;
  /** Trace delay minutes stacked (Bleach). */
  traceDelayMin?: number;
  /** Eyes_On intrusion watch armed. */
  eyesOn?: boolean;
  /** Last software run flavor. */
  lastSoftNote?: string;
  /** Company data looted this run (slugs/labels). */
  companyLoot?: string[];
  /** Active AI fight (paradoxware). */
  aiFight?: {
    slug: string;
    name: string;
    ds: number;
    dsMax: number;
    paradox?: string;
  };
  /** Hacks since +scene (Hyperion multi-action). */
  hacksThisScene?: number;
  /** Delayed realspace NPC spawns from heat responses. */
  pendingSpawns?: Array<{
    kind: string;
    slug: string;
    name: string;
    count: number;
    at: number;
    label: string;
  }>;
}

export interface ISprawlChar {
  version: 1;
  chargenStatus: ChargenStatus;
  chargenComplete: boolean;
  reviewNote?: string;
  /** Open CGEN job number from @ursamu/jobs (if present). */
  submittedJob?: number;
  name: string;
  stats: ISprawlStats;
  resilience: number;
  resilienceMax: number;
  loadoutMax: number;
  bityuan: number;
  background?: string;
  backgroundName?: string;
  edge?: string;
  edgeName?: string;
  edgeUsedScene?: boolean;
  edgeUsedEncounter?: boolean;
  edgeUsedSession?: boolean;
  affectations: string[];
  /** Accessory slugs from the 2d6 table (look generator). */
  accessories?: string[];
  quirks: string[];
  /** @deprecated Prefer carried Things (state.sprawl_item). */
  loadout: ILoadItem[];
  augs: IAugItem[];
  shards: string[];
  /** Equipped console hull slug (catalog). */
  console?: string;
  /** Purchased extra RAM points (Nodejacker). */
  consoleRamBonus?: number;
  /** Firewall raises from tune (max = RAM). */
  consoleFirewallBonus?: number;
  /** Installed expert-system Cognition points (max = RAM). */
  consoleAiCog?: number;
  /** Planted logic bomb on a system (Nodejacker). */
  logicBomb?: {
    hideDs: number;
    eventTrigger: boolean;
    note?: string;
    at: number;
  };
  /** Loaded software slugs (slot-limited by console). */
  software: string[];
  /** Demon packs: demon-slug → software slugs inside. */
  softwarePacks?: Record<string, string[]>;
  /** Obsolete software slugs (no bonus; still occupy slots). */
  softwareObsolete?: string[];
  critical?: ICriticalInjury;
  isCybershell?: boolean;
  /** Ongoing fire/acid (and similar) damage clocks. */
  dots?: Array<{
    kind: string;
    rounds: number;
    dmg: number;
    source?: string;
    at: number;
  }>;
  /** Cyberlimb malfunction effect text (if any). */
  limbFault?: {
    slug: string;
    effect: string;
    glitch: boolean;
    at: number;
  };
  /** Last vehicle critical on boarded/owned hull (display). */
  vehicleCritNote?: string;
  /** Deployed personal drone Thing id. */
  activeDroneId?: string;
  /** Background edge power rating 1–3 (book max 3). */
  edgeRating?: number;
  /**
   * @deprecated AP-only advance. Kept for old sheets; ignored.
   */
  missionReady?: boolean;
  /**
   * Lifetime AP earned (never spent down).
   * Level = floor(apTotal / apPerLevel).
   */
  apTotal?: number;
  /**
   * Active auto-gig (player street contract).
   * Source of truth — jobs plugin optional.
   */
  activeGig?: IActiveGig;
  /** Engagement range in metres (+range). */
  engageRangeM?: number;
  /**
   * Hollywood Hordes mob (optional): size = DS;
   * damage drops members 1:1.
   */
  horde?: {
    name: string;
    size: number;
    sizeMax: number;
    at: number;
  };
  /**
   * Live NPC fights (book: DS = Resilience). Keyed by slug/name.
   * Damage lowers DS until 0 (dead). Cleared on +scene.
   */
  sceneNpcs?: Record<string, {
    key: string;
    name: string;
    slug?: string;
    ds: number;
    dsMax: number;
    at: number;
  }>;
  /** Street-tech quirk slugs (black clinic chrome). */
  streetTechQuirks?: string[];
  /**
   * Combat flavor prose under attack results.
   * Default on; set false to hide.
   */
  combatFlavor?: boolean;
  /**
   * Extra Glitch dice from ICE / system responses.
   * Consumed on the next action roll.
   */
  pendingGlitch?: number;
  /**
   * Live nodejack state (responses, lockouts, ICE).
   * Timestamps are Date.now() ms; turns count down on +hack.
   */
  net?: INetState;
  /** Pending party gig invite. */
  gigInvite?: IGigInvite;
  ap: number;
  level: number;
  notes: string;
  /** Chargen belonging picks completed (0–3). */
  belongingsPicked?: number;
  drugs?: Array<Record<string, unknown>>;
  /**
   * @deprecated Gear is always live. Ignored if present.
   */
  autoDesc?: boolean;
  /**
   * Base paragraph only (d66 tables or +desc/set).
   * Worn/wielded gear is never stored here — woven at look time.
   */
  baseDesc?: string;
  /** d66 look-opener slug — sticky across gear refreshes. */
  lookOpener?: string;
  /**
   * @deprecated Last full assembly cache. Prefer baseDesc + live gear.
   */
  lookDesc?: string;
  /** Boarded vehicle Thing id (kind=vehicle). */
  activeVehicleId?: string;
}

export function emptyStats(): ISprawlStats {
  return {
    morphology: 0,
    equilibrium: 0,
    reaction: 0,
    cognition: 0,
    affinity: 0,
  };
}

export function defaultChar(name = ""): ISprawlChar {
  return {
    version: 1,
    chargenStatus: "none",
    chargenComplete: false,
    name,
    stats: emptyStats(),
    resilience: 12,
    resilienceMax: 12,
    loadoutMax: 10,
    bityuan: 0,
    affectations: [],
    quirks: [],
    loadout: [],
    augs: [],
    shards: [],
    software: [],
    ap: 0,
    apTotal: 0,
    level: 0,
    notes: "",
  };
}

export function readSprawl(
  state: Record<string, unknown> | undefined,
): ISprawlChar | null {
  const raw = state?.sprawl;
  if (!raw || typeof raw !== "object") return null;
  return raw as ISprawlChar;
}

export function statTotal(s: ISprawlStats): number {
  return (
    s.morphology + s.equilibrium + s.reaction +
    s.cognition + s.affinity
  );
}

/** Sum load points from item-like rows (Things or legacy). */
export function sumLoad(
  items: ReadonlyArray<{ load?: number }>,
): number {
  // load 0 is valid (mods, vehicles); only missing → 1.
  return items.reduce((n, i) => n + (i.load ?? 1), 0);
}

/** @deprecated Prefer sumLoad(carried item data). */
export function loadUsed(c: ISprawlChar): number {
  return sumLoad(c.loadout ?? []);
}

export function overloadFrom(used: number, max: number): number {
  const over = used - max;
  return over > 0 ? over : 0;
}

/** @deprecated Prefer overloadFrom(sumLoad(items), c.loadoutMax). */
export function overloadPenalty(c: ISprawlChar): number {
  return overloadFrom(loadUsed(c), c.loadoutMax);
}
