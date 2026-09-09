// core/types.ts -- All shared interfaces for the wod20th chargen plugin

export type SplatId = "wta" | "vtm" | "mortal" | "kinfolk";
export type CharStatus = "draft" | "submitted" | "approved" | "denied";

/** Damage box marker. Empty string = undamaged. */
export type DamageMark = "" | "B" | "L" | "A";

// -- Freebie + audit trails -------------------------------------------------

export interface IFreebieEntry {
  trait: string;   // e.g. "Strength", "Melee", "gnosis", "Razor Claws"
  dots: number;
  cost: number;
  timestamp: number;
}

export interface INoteEntry {
  /** Free-form slug, e.g. "background", "personality", "hooks". Case-preserved. */
  name: string;
  text: string;
  /** Public notes appear in +sheet output; private notes are staff-only. Default: false. */
  isPublic: boolean;
  updatedAt: number;
}

export interface IStatLogEntry {
  staffId: string;
  trait: string;
  old: unknown;
  new: unknown;
  ts: number;
}

export interface IVoteEntry {
  /** charId of the votee. */
  targetCharId: string;
  /** Free-form reason -- required for audit. */
  reason: string;
  ts: number;
}

/**
 * Subject/object/possessive pronoun set. Drives %s/%o/%p/%a substitution
 * in poses. Default they/them/their/theirs.
 */
export interface IPronounSet {
  subject:    string;  // he   | she  | they  | it
  object:     string;  // him  | her  | them  | it
  possessive: string;  // his  | her  | their | its   (adjective: "%p talons")
  absolute:   string;  // his  | hers | theirs| its   (absolute: "the talons are %a")
}

/**
 * Permanent battle scar earned by surviving Aggravated damage that fills
 * the Incap slot. Scars do not heal via regen; staff clears them via
 * +scar/clear. See core/battleScars.ts.
 */
export interface IBattleScar {
  slug: string;
  name: string;
  /** Glory awarded for bearing the scar (W20 p.297). */
  glory: number;
  description: string;
  /** Epoch ms; for staff audit. */
  acquiredAt: number;
  /** Free-form -- e.g., "claws of Krunzh", "silver bullet". Optional. */
  cause?: string;
}

// -- Validator return type --------------------------------------------------

export interface IStepBudget {
  step: number;
  complete: boolean;
  issues: string[];
  remaining: Record<string, number>;
}

// -- The character record ---------------------------------------------------

export interface IWoDChar {
  id: string;
  playerId: string;
  splat: SplatId;
  status: CharStatus;
  chargenStep: 1 | 2 | 3 | 4 | 5 | 6;

  // Step 1 -- Concept
  concept: string;
  moniker?: string;     // IC alias/nickname -- shown in sheet header instead of fullName
  /** WtA: deed name shown to others while in a non-homid form. Login name is unchanged. */
  deedName?: string;
  fullName?: string;    // IC full name (login name is the in-game name)
  age?: string;         // character age (string to allow "appears 25")
  nature?: string;      // Nature archetype (e.g. Survivor, Caregiver)
  demeanor?: string;    // Demeanor archetype
  breed?: string;       // wta/kinfolk only
  auspice?: string;     // wta only
  tribe?: string;       // wta only
  deformity?: string;   // wta metis only
  clan?: string;        // vtm only (id or canonical name)
  generation?: number;  // vtm only (default 13)
  sire?: string;        // vtm only -- sire's name (set by +embrace)

  // Step 3 -- Attributes (extra dots above base 1)
  attributePriority: [string, string, string];
  attributes: Record<string, number>;
  attributeSpecialties: Record<string, string>;

  // Step 4 -- Abilities (start at 0)
  abilityPriority: [string, string, string];
  abilities: Record<string, number>;
  abilitySpecialties: Record<string, string>;

  // Step 5 -- Advantages
  backgrounds: Record<string, number>;
  /**
   * Merits keyed by display name. Qualified merits use
   * "Language (Spanish)" so the same base merit can stack.
   * Value = freebie cost paid.
   */
  merits?: Record<string, number>;
  flaws?: Record<string, number>;
  /**
   * Free-text focus for backgrounds that need a qualifier
   * (Contacts field, Ally identity, etc.). Key = background name.
   */
  backgroundDetails?: Record<string, string>;
  gifts?: string[];  // wta/kinfolk -- exactly 3 for wta
  renown?: { glory: number; honor: number; wisdom: number }; // wta only -- permanent
  renownTemp?: { glory: number; honor: number; wisdom: number }; // wta only -- temporary

  // Step 6 -- Finishing touches
  rage?: number;       // wta only; derived from auspice table
  gnosis?: number;     // wta + kinfolk; derived from breed table
  willpower: number;   // derived from tribe/splat table
  rank?: 1 | 2 | 3 | 4 | 5;  // wta only

  // -- VtM advantages --------------------------------------------------------
  /** Discipline dots keyed by canonical name (e.g. "Potence": 2). */
  disciplines?: Record<string, number>;
  /** Virtues: Conscience/Self-Control/Courage (or Path variants). */
  virtues?: Record<string, number>;
  humanity?: number;     // or Path rating
  path?: string;         // default "Humanity"
  bloodPool?: number;    // current BP
  bloodMax?: number;     // max BP from generation table
  bloodPerTurn?: number; // spend cap from generation
  /** VtM: true while in torpor (Incap + L/A). */
  inTorpor?: boolean;
  /** VtM: staked through the heart (paralyzed). */
  staked?: boolean;
  /** VtM: Feral Claws active (Protean 2 toggle). */
  feralWeapons?: boolean;
  /** VtM: Obfuscate concealment active. */
  obfuscated?: boolean;
  /** VtM: Auspex 1 Heightened Senses active. */
  heightenedSenses?: boolean;
  /** VtM: current Protean/Vicissitude/Obtenebration shape, if any. */
  proteanForm?: "earth" | "beast" | "mist";
  /** VtM: black-vein tally from diablerie. */
  diablerieStains?: number;
  /** VtM: blood-buff bonus dots per Physical attribute (scene). */
  bloodBuff?: Partial<Record<"Strength" | "Dexterity" | "Stamina", number>>;
  /**
   * VtM: freeform power/ritual flags (scene flags, ward markers, ghoul
   * markers, merit flags like preyExclusion). Keys are camelCase slugs.
   */
  powerFlags?: Record<string, boolean | number | string>;
  /**
   * VtM blood magic: primary path per school. Keys are lowercase school
   * names ("thaumaturgy", "necromancy"); values are canonical path names.
   * Absent = default (Path of Blood / Sepulchre Path).
   */
  primaryPaths?: Record<string, string>;
  /** VtM blood-magic rituals known (slugs into splats/vtm/data/rituals.ts). */
  rituals?: string[];
  /** VtM Ventrue: required vessel class (substring match on target desc). */
  feedingPreference?: string;
  /** VtM Gangrel: count of permanent animal features from frenzies. */
  animalFeatures?: number;
  /** VtM: permanent derangements (slugs into core/derangement.ts). */
  derangements?: string[];
  /** VtM: sect allegiance (camarilla/sabbat/anarch/independent). */
  sect?: string;
  /** VtM: blood bonds keyed by regnant charId -> bond level (1-3). */
  bonds?: Record<string, number>;
  /** VtM: coterie membership (db/coterieDb.ts). */
  coterieId?: string;
  /** VtM: pending coterie invite ids. */
  coterieInvites?: string[];
  /** VtM: domain office (db/domainDb.ts). */
  domainId?: string;
  /** VtM ghoul: domitor (regnant) charId. */
  domitorId?: string;
  /** VtM ghoul: true when this record is a ghoul, not a full Kindred. */
  isGhoul?: boolean;
  /** VtM ghoul: last vitae feeding (epoch ms; monthly hunger clock). */
  ghoulLastFedAt?: number;
  /** VtM ghoul: limited discipline dots (usually Potence 1 + domitor gifts). */
  ghoulDisciplines?: Record<string, number>;
  /** VtM: last diablerie (epoch ms; stains fade with time). */
  lastDiablerieAt?: number;
  /** VtM Celerity: banked extra actions this turn. */
  celerityActions?: number;

  // Current (temporary) trait values -- only set when they differ from permanent
  attributesTemp?: Record<string, number>;
  abilitiesTemp?: Record<string, number>;
  rageCurrent?: number;
  gnosisCurrent?: number;
  willpowerCurrent?: number;
  /** WtA only: current shifted form. Default is breed form on creation. */
  currentForm?: "homid" | "glabro" | "crinos" | "hispo" | "lupus";
  /** WtA only: in Umbra (stepped sideways). */
  inUmbra?: boolean;
  /** WtA only: frenzy state. "berserk" = full rage frenzy, "fox" = thrall-of-the-wyrm flight, null/absent = normal. */
  frenzyState?: "berserk" | "fox" | null;
  /** WtA only: epoch ms when frenzy state expires (0 = indefinite). */
  frenzyUntil?: number;
  /** WtA only: rites learned. Slug references RITES record. */
  rites?: string[];
  /** WtA only: combo gifts learned. Slug references COMBO_GIFTS record. */
  comboGifts?: string[];
  /** WtA only: permanent battle scars. Roll triggered post-Incap on A damage. */
  scars?: IBattleScar[];
  /** NPC marker: true for staff-spawned creatures (banes/fomori/BSDs). */
  isNpc?: boolean;
  /** NPC template slug (see splats/wta/data/wyrmNpcs.ts). */
  npcTemplate?: string;
  /** Room id where the NPC's IDBObj currently lives. */
  npcRoomId?: string;
  /**
   * Bestiary category for the NPC. Used by AI driver for tactics/flavor.
   * "bane" = corrupted spirit; "fomor" = Wyrm-thrall human; "bsd" = Black
   * Spiral Dancer; "creature" = hellhound or similar.
   */
  npcKind?: "bane" | "fomor" | "bsd" | "creature";
  /**
   * Counter of NPCs this PC has killed, keyed by npcKind. Tracked silently
   * by combat resolution. Drives the title/achievement system; does NOT
   * auto-grant renown directly -- titles cross thresholds and grant temp.
   */
  npcKills?: { bane?: number; fomor?: number; bsd?: number; creature?: number };
  /**
   * Earned title slugs (see core/titles.ts WTA_TITLES). Each title unlocks
   * once when its threshold crosses and grants temp renown at that moment;
   * earning the title is the gate, not a recurring bonus.
   */
  titles?: string[];
  /**
   * RhostMUSH-style pronoun substitution set. Used by core/pronouns.ts
   * substitute() to swap %s/%S/%o/%O/%p/%P/%a/%A tokens in any pose or
   * private message. Default they/them/their/theirs when unset.
   */
  pronouns?: IPronounSet;
  /**
   * Epoch ms until which wound penalties are bypassed for this char.
   * Set by Resist Pain (Philodox L2) and any similar gift / rite that
   * grants temporary pain-immunity. core/wounds.ts woundPenalty() honors
   * this on every roll site automatically.
   */
  ignoreWoundsUntil?: number;
  /** WtA only: id of the pack the character belongs to (wod20th.packs.id). */
  packId?: string;
  /**
   * WtA only: pending pack invites awaiting accept/decline. Each entry is
   * a packId. When multiple are queued, +pack/accept requires a pack name.
   */
  packInvites?: string[];
  /**
   * Active reactive defense declared via +defend. Consumed (cleared) by the
   * first +attack resolved against this character, or by `+init/next` /
   * `+defend/clear`. When absent, the engine auto-rolls a half-pool fallback.
   */
  pendingDefense?: {
    kind: "dodge" | "block" | "parry";
    setAt: number;
  };
  /**
   * Armed formal-combat challenge (single-combat / klaive-duel /
   * death-duel). Set when +challenge/resolve is called on a combat-typed
   * challenge after both parties accepted. Cleared by the first +attack
   * that lands damage between the two parties (first-blood resolution).
   * See commands/challenge.ts and commands/attack.ts.
   */
  pendingChallengeDuel?: {
    challengeId: string;
    opponentCharId: string;
    setAt: number;
  };
  /**
   * Multi-action declaration for the current turn ("split your dice pool").
   * Each declared action incurs a stacking penalty of (count - 1) dice.
   * `used` increments as +attack and consumed declared +defend fire; once
   * `used >= count` the declaration auto-clears. Default (no decl) = 1
   * action, no penalty.
   */
  actionDecl?: {
    count: number;
    used: number;
    setAt: number;
  };

  // Health track -- 7 slots: Bruised (0) through Incapacitated (6)
  healthTrack?: DamageMark[];
  /**
   * WtA: when true, Lethal damage cannot be regenerated automatically
   * (silver / fire / supernatural teeth+claws). Combat code sets this when
   * applying qualifying damage; staff may clear it manually.
   */
  noRegenLethal?: boolean;

  freebiesRemaining: number;
  freebiesLog: IFreebieEntry[];
  /**
   * Step 6 acknowledgement. False/undefined while freebies remain unspent
   * and the player has not run +chargen/done. Auto-true when bank hits 0.
   */
  freebiesDone?: boolean;

  // XP
  xpTotal: number;    // total XP awarded
  xpSpent: number;    // total XP spent

  // Player notes (background, personality, hooks, etc.)
  notes: INoteEntry[];

  // Player-vote history (per-voter; tracks votes the OWNING char has CAST).
  voteHistory?: IVoteEntry[];

  // Audit
  approvedBy?: string;
  deniedReason?: string;
  staffNotes: string;
  statLog: IStatLogEntry[];

  createdAt: number;
  updatedAt: number;
}

// -- Trait resolution -------------------------------------------------------

export type TraitCategory =
  | "string-enum"   // e.g. breed, auspice -- value must be in enumValues
  | "string-free"   // e.g. concept, deformity -- any non-empty string
  | "number"        // e.g. Strength, Melee, Pure Breed
  | "specialty"     // e.g. Strength.specialty -- string stored in *Specialties record
  | "composite"     // e.g. attrs.priority -- multi-part value
  | "merit"         // +chargen/set merit=<name> -- costs freebies
  | "flaw"          // +chargen/set flaw=<name> -- gives freebies (<=7 cap)
  | "gift-auto";    // +chargen/set gift=<Name> -- auto-picks breed/auspice/tribe slot

export interface ITraitResolution {
  found: boolean;
  step: 1 | 2 | 3 | 4 | 5 | 6;
  category: TraitCategory;
  /** Dotted path into IWoDChar -- used by ChargenEngine to apply the value. */
  field: string;
  enumValues?: string[];    // for string-enum
  min?: number;             // for number
  max?: number;             // hard cap (applies always)
  stepMax?: number;         // soft cap enforced only before Step 6 freebies
  parentTrait?: string;     // for specialty: the trait this specialty belongs to
}

// -- Splat definition -------------------------------------------------------

export interface IFreebieTable {
  attribute: number;   // 5
  ability: number;     // 2
  background: number;  // 1
  gift?: number;       // 7 (wta)
  rage?: number;       // 1 (wta)
  gnosis?: number;     // 2 (wta + kinfolk)
  discipline?: number; // 7 (vtm)
  virtue?: number;     // 2 (vtm)
  humanity?: number;   // 1 (vtm)
  willpower: number;   // 1
}

export interface IRiteDefRef {
  name: string;
  level: 1 | 2 | 3 | 4 | 5;
  category:
    | "mystic"
    | "minor"
    | "seasonal"
    | "accord"
    | "caern"
    | "death"
    | "renown"
    | "punishment"
    | "passage";
  difficulty?: number;
  description: string;
}

export interface IWtaSplatExt {
  breeds: IBreedDef[];
  auspices: IAuspiceDef[];
  tribes: ITribeDef[];
  gifts: Record<string, IGiftDef>;
  rites?: Record<string, IRiteDefRef>;
}

export interface IKinfolkSplatExt {
  initialGnosis: 1;
  availableGifts: string[];
}

// -- VtM splat extension ------------------------------------------------------

export type ClanWeaknessKind =
  | "vitae_addict" | "frenzy_diff" | "sun_extra" | "animal_features"
  | "feed_rate" | "no_reflection" | "derangement" | "appearance_zero"
  | "vice" | "beauty_trance" | "clan_bond" | "soil_sleep"
  | "feed_restrict" | "none";

export interface IClanDef {
  id: string;
  name: string;
  displayName: string;
  nickname: string;
  sect: "camarilla" | "sabbat" | "anarch" | "independent";
  disciplines: string[];
  weakness: string;
  weaknessKind: ClanWeaknessKind;
  /** Brujah: +2 difficulty to resist frenzy. */
  frenzyDiffBonus?: number;
  /** Setites: extra aggravated sunlight damage. */
  sunDamageBonus?: number;
  /** Giovanni: max BP per turn while feeding. */
  feedPerTurnMax?: number;
  /** Nosferatu: Appearance locked at 0. */
  appearanceZero?: boolean;
  book: string;
}

export interface IDisciplineDef {
  id: string;
  name: string;
  book: string;
}

export interface IGenerationRow {
  generation: number;
  bloodMax: number;
  bloodPerTurn: number;
  traitMax: number;
}

/** Path of Enlightenment (or Humanity) hierarchy. */
export interface IPathDef {
  id: string;
  name: string;
  /** Virtue rolled for degeneration checks (Conscience or Conviction). */
  checkVirtue: string;
  virtues: string[];
  sins: Record<number, { label: string; examples: string }>;
  book: string;
}

export interface IVtmSplatExt {
  clans: IClanDef[];
  disciplines: Record<string, IDisciplineDef>;
  backgrounds: string[];
  generationTable: IGenerationRow[];
  startingDisciplineDots: number;
  virtueDots: number;
}

export interface IMeritDef {
  name: string;
  cost: number;     // freebie cost (1-7)
  category: "Physical" | "Mental" | "Social" | "Supernatural" | "WtA";
  notes?: string;
  /**
   * Player must supply a free-text qualifier (language, camp, etc.).
   * Stored as "Name (detail)" so Language can stack per language.
   */
  needsDetail?: boolean;
  /** Prompt fragment, e.g. "language" → merit=Language: Spanish */
  detailLabel?: string;
  /** Allow multiple takes with different details (Language). Default false. */
  stackable?: boolean;
}

export interface IFlawDef {
  name: string;
  bonus: number;    // freebie points given back (1-5)
  category: "Physical" | "Mental" | "Social" | "Supernatural" | "WtA";
  notes?: string;
  needsDetail?: boolean;
  detailLabel?: string;
}

export interface ISplat {
  id: SplatId;
  name: string;
  /** Label shown when track is fully filled with lethal/aggravated damage. */
  incapLabel: string;
  /** Label shown when damage exceeds the track (overflow > 0). */
  overflowLabel: string;
  /** Extra attribute dots distributed: primary=7, secondary=5, tertiary=3 */
  attributeAlloc: { primary: number; secondary: number; tertiary: number };
  /** Ability dots distributed: primary=13, secondary=9, tertiary=5 */
  abilityAlloc: { primary: number; secondary: number; tertiary: number };
  backgroundDots: number;
  freebies: number;
  freebieTable: IFreebieTable;
  /** For splats without per-tribe willpower (mortal, kinfolk). */
  initialWillpower?: number;
  /** If set, player must have this flag to start chargen with this splat. */
  requiredFlag?: string;
  merits?: IMeritDef[];
  flaws?: IFlawDef[];
  ext?: IWtaSplatExt | IKinfolkSplatExt | IVtmSplatExt;
}

// -- WtA extension types ----------------------------------------------------

export interface IBreedDef {
  id: string;
  name: string;
  initialGnosis: number;
  beginningGifts: string[];
  notes?: string;
}

export interface IAuspiceDef {
  id: string;
  name: string;
  moon: string;
  initialRage: number;
  beginningRenown: { glory: number; honor: number; wisdom: number };
  /** When true (Ragabash), any combination summing to the total is valid. */
  renownFlex: boolean;
  beginningGifts: string[];
}

export interface IBgRestrictions {
  /** Hard cap at 1 dot without staff exception. */
  restricted: string[];
  /** Shown as warning; not blocked. */
  discouraged: string[];
  /** e.g. Silver Fangs must have Pure Breed >= 3 */
  required?: Array<{ name: string; minDots: number }>;
}

export interface ITribeDef {
  id: string;
  name: string;
  /** Canonical display names including spaces -- used for fuzzy matching. */
  displayName: string;
  initialWillpower: number;
  beginningGifts: string[];
  backgroundRestrictions: IBgRestrictions;
  /** If set, only these breeds may join this tribe. */
  breedRestriction?: string[];
}

export interface IGiftActionCost {
  gnosis?: number;
  willpower?: number;
  rage?: number;
}

export interface IGiftActionRoll {
  /** Pool expression parseable by core/dice.ts resolvePoolExpr, e.g. "Wits+Empathy" or "Stamina+Survival+2". */
  pool: string;
  /** Difficulty (2..10). Defaults to DEFAULT_DIFFICULTY when omitted. */
  difficulty?: number;
}

export interface IGiftAction {
  /** When set, +gift/use rolls this pool and reports outcome. */
  roll?: IGiftActionRoll;
  /**
   * Activation cost. When omitted, falls back to legacy behavior
   * (Gnosis = gift level).
   */
  cost?: IGiftActionCost;
  /** Effect duration; informational. */
  duration?: "scene" | "turn" | "permanent" | string;
  /** 1-3 sentence mechanical effect description (shown on use). */
  description: string;
}

export interface IGiftDef {
  name: string;
  level: number;
  /** Pool IDs this gift belongs to: breed ids, auspice ids, tribe ids. */
  source: string[];
  /** Optional action data: roll, cost, duration, description. */
  action?: IGiftAction;
}

/**
 * Combo Gift definition (M20 canon). A combo gift fuses two or more known
 * gifts into a single named maneuver. The character must have learned every
 * gift in `prereqs` (slug match) to be eligible; optional `restrictions`
 * lock the combo to specific tribes/auspices/breeds.
 */
export interface IComboGiftDef {
  /** Canonical slug, e.g. "cooking-the-books". */
  slug: string;
  /** Display name, e.g. "Cooking the Books". */
  name: string;
  level: 1 | 2 | 3 | 4 | 5;
  /** Slugs of constituent gifts (ALL must be known). */
  prereqs: string[];
  /**
   * Required tribe/auspice/breed ids (lowercased, hyphenated). Empty array =
   * open to anyone who knows the prereqs.
   */
  restrictions: string[];
  /** Activation: roll, cost, duration, description. */
  action: IGiftAction;
}

// -- XP records ------------------------------------------------------------

export interface IXpEntry {
  id: string;
  charId: string;
  playerId: string;
  type: "award" | "spend";
  /** Canonical field path for spends (e.g. "attributes.Strength", "rage"). */
  trait?: string;
  oldValue?: number;
  newValue?: number;
  /** Positive for awards; negative for spends (XP cost). */
  amount: number;
  reason: string;
  staffId?: string;   // who awarded/approved
  ts: number;
}

// -- Hooks payload types ----------------------------------------------------

export interface ChargenStartedEvent   { playerId: string; charId: string; splat: SplatId; }
export interface ChargenStepEvent      { playerId: string; charId: string; splat: SplatId; step: number; }
export interface ChargenSubmittedEvent {
  playerId: string; charId: string; splat: SplatId;
  breed?: string; auspice?: string; tribe?: string; concept: string;
}
export interface ChargenApprovedEvent  { playerId: string; charId: string; approvedBy: string; splat: SplatId; }
export interface ChargenDeniedEvent    { playerId: string; charId: string; deniedBy: string; reason: string; }
export interface ChargenResetEvent     { playerId: string; charId: string; }
export interface SheetViewedEvent      { viewerId: string; targetId: string; charId: string; isStaff: boolean; }
export interface StatChangedEvent      { staffId: string; targetId: string; charId: string; trait: string; old: unknown; newVal: unknown; }
export interface CharCreatedEvent      { playerId: string; charId: string; splat: SplatId; }
export interface CharUpdatedEvent      { playerId: string; charId: string; changedFields: string[]; }
export interface PoolChangedEvent      {
  playerId: string;
  charId: string;
  pool: "rage" | "gnosis" | "willpower" | "blood";
  amount: number;
  /** Resulting current value after the change. */
  remaining: number;
  /** Permanent (max) value at the time of the change. */
  permanent: number;
}
export interface FormChangedEvent      {
  playerId: string;
  charId: string;
  from: string;
  to: string;
}
export interface RenownAwardedEvent {
  staffId: string;
  targetId: string;
  charId: string;
  track: "glory" | "honor" | "wisdom";
  amount: number;
  reason: string;
  rankUp?: number;
}
export interface RenownLostEvent {
  staffId: string;
  targetId: string;
  charId: string;
  track: "glory" | "honor" | "wisdom";
  amount: number;
  reason: string;
}
export interface RankAdvancedEvent {
  charId: string;
  playerId: string;
  oldRank: number;
  newRank: number;
}
export interface HealthChangedEvent    {
  actorId: string;       // who applied the change
  targetId: string;      // whose health changed
  charId: string;
  action: "hurt" | "heal";
  damageType: DamageMark | "all";
  amount: number;
  track: DamageMark[];   // new track state
}

// -- Spirit DB --------------------------------------------------------------

export type SpiritType =
  | "totem"
  | "gaffling"
  | "jaggling"
  | "incarna"
  | "celestine"
  | "wyrm"
  | "weaver"
  | "wyld";

export interface ISpiritDef {
  slug: string;                // "wolf", "thunderbird", "rat-spirit"
  name: string;                // "Wolf", "Thunderbird"
  type: SpiritType;
  rage: number;
  gnosis: number;
  willpower: number;
  power: number;
  charms: string[];            // free-form names; deep mechanics later
  ban: string;                 // the spirit's taboo, free text
  notes?: string;
  /** Totems only: background-cost equivalence and pack boons. */
  totemCost?: number;
  totemBoons?: string[];
}
