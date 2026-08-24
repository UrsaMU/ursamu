/**
 * Cyberpunk RED — Core Type Definitions
 * All shared interfaces for character data, combat, economy, and plugin DBOs.
 */
import type { ILocationEffect } from "../engine/fnff.ts";

// ─── Primitives ──────────────────────────────────────────────────────────────

export type StatKey =
  | "int" | "ref" | "dex" | "tech" | "cool"
  | "will" | "luck" | "move" | "body" | "emp";

export type WoundState = "healthy" | "lightly" | "seriously" | "mortally" | "dead";

export type Role =
  | "rockerboy" | "solo" | "netrunner" | "medtech" | "tech"
  | "media" | "exec" | "lawman" | "fixer" | "nomad";

export type PriceCategory =
  | "cheap" | "everyday" | "costly" | "premium"
  | "expensive" | "very_expensive" | "luxury" | "super_luxury";

export type ChargenMethod = "streetrat" | "edgerunner" | "complete";

export type ChargenStage =
  | "method" | "lifepath_cultural" | "lifepath_personality"
  | "lifepath_motivations" | "lifepath_family" | "lifepath_friends"
  | "lifepath_enemies" | "lifepath_events" | "lifepath_role"
  | "role_select" | "stats" | "skills" | "cyberware"
  | "equipment" | "lifestyle" | "review" | "complete";

// ─── Character Sub-types ─────────────────────────────────────────────────────

export interface ICPRStats {
  int: number;
  ref: number;
  dex: number;
  tech: number;
  cool: number;
  will: number;
  luck: number;
  move: number;
  body: number;
  emp: number;      // current EMP (empBase − floor(HL/10))
  empBase: number;  // base EMP stat before humanity loss
}

export interface IArmorState {
  name: string;
  sp: number;       // original stopping power
  currentSp: number; // current stopping power (ablates on hit)
  penalty: number;  // REF/DEX/MOVE penalty from this armor
}

export interface ICriticalInjury {
  id: string;
  location: "head" | "body";
  roll: number;
  name: string;
  effects: string;
  deathSavePenalty: number;
  treatmentDV: number;
  requiresSurgery: boolean;
  treated: boolean;
}

export type CyberwareLocation =
  | "right eye" | "left eye" | "both eyes"
  | "right ear" | "left ear" | "both ears"
  | "right arm" | "left arm"
  | "right hand" | "left hand"
  | "right leg" | "left leg"
  | "torso" | "skull" | "spine" | "both arms" | "both legs";

export interface ICyberware {
  id: string;
  name: string;
  category: "fashionware" | "neuralware" | "cyberoptics" | "cyberaudio"
    | "internal" | "external" | "cyberlimb" | "chipware" | "borgware";
  location?: CyberwareLocation;
  hl: number;
  installType: "mall" | "clinic" | "hospital";
  installedAt: number;
  installedBy?: string;
  notes?: string;
  /** Total option slots this foundational piece provides (e.g. Neural Link=5). */
  slots?: number;
  /** Slots this item consumes in its parent foundational piece (default 1 if installedIn is set). */
  slotCost?: number;
  /** ID of the parent foundational cyberware this item is installed in. */
  installedIn?: string;
}

export interface IBodysculpt {
  id: string;
  modification: string;
  exotic: boolean;
  hl: number;
  completedAt: number;
  performedBy?: string;
}

export interface IDrugEffect {
  drug: string;
  effect: string;
  expiresAt: number;
}

export interface ILifepathEnemy {
  description: string;
  causeOfEnmity: string;
  whatTheyHave: string;
  numPeople: number;
}

export interface ILifepath {
  culturalOrigin?: string;
  language?: string;
  personality?: string;
  clothingStyle?: string;
  hairstyle?: string;
  affectation?: string;
  lifeGoal?: string;
  mostValuablePerson?: string;
  mostValuableThing?: string;
  feelingAboutPeople?: string;
  whatYouValue?: string;
  familyBackground?: string;
  childhoodEnvironment?: string;
  familyCrisis?: string;
  friendName?: string;
  friendHow?: string;
  friends?: string[];
  _friendCount?: number;
  enemies?: ILifepathEnemy[];
  lifeEvents?: string[];
  roleEvents?: string[];
  _enemyCount?: number;
}

// ─── Gear / Inventory ────────────────────────────────────────────────────────

export type GearSlot = "wielded" | "worn" | "carried";

export interface IGearItem {
  id: string;
  name: string;
  type: "weapon" | "armor" | "gear" | "ammo" | "drug" | "other";
  slot: GearSlot;
  concealed: boolean;
  description?: string;
  priceCategory?: PriceCategory;
}

// ─── Full Character Record (stored as state.cpr on player IDBObj) ─────────────

export interface ICPRCharacter {
  // Core stats
  stats: ICPRStats;

  // Derived stats
  hp: { max: number; current: number };
  swThreshold: number;       // ceil(maxHP / 2)
  deathSave: number;         // base = BODY stat
  deathSavePenalty: number;  // accumulates from mortal wounds

  // Role
  role: Role;
  roleRank: number;          // 1–10, starts at 4
  roleData: Record<string, unknown>;

  // Skills: skillName → level (0–10)
  skills: Record<string, number>;

  // Luck pool
  luckRemaining: number;

  // Combat state
  woundState: WoundState;
  criticalInjuries: ICriticalInjury[];
  armorBody: IArmorState | null;
  armorHead: IArmorState | null;

  // Cyberware & body
  cyberware: ICyberware[];
  humanityLoss: number;
  bodysculpt: IBodysculpt[];

  // Gear / inventory
  gear: IGearItem[];

  // Active drug effects
  activeEffects: IDrugEffect[];

  // Social
  reputation: number;
  reputationDeeds: string[];

  // Economy
  eurodollars: number;
  lifestyle: { tier: string; nextDueDate: number } | null;

  // Lifepath & chargen
  lifepath: ILifepath;
  /**
   * Play-ready flag. True only after staff approval.
   * Submit sets pending without flipping this.
   */
  chargenComplete: boolean;
  /**
   * draft → editing; pending → awaiting staff;
   * approved → playable; rejected → back to draft.
   */
  chargenStatus?: "draft" | "pending" | "approved" | "rejected";
  /** Freeform concept / background (required to submit). */
  conceptNotes?: string;
  /** Staff reject reason (cleared on resubmit). */
  chargenRejectReason?: string;
  chargenStage: ChargenStage | null;
  chargenMethod: ChargenMethod | null;
  chargenStatPool?: number;   // remaining points (complete method)
  chargenSkillPool?: number;

  // Recovery timers (Component A)
  restTimer: { startedAt: number; type: "short" | "long" } | null;

  // Humanity regain cooldown (Component C)
  humanityGainedAt: number | null;

  // Active location effects from FNFF (called shots, brawl moves) (Component B)
  locationEffects: ILocationEffect[];

  // Facedown loss — set when this character loses a +facedown contest.
  // Expires at the timestamp; cleared on rest or by +facedown/clear.
  impressedBy?: { actorId: string; actorName: string; expiresAt: number } | null;

  // Sandevistan activation state
  sandevistanActive?: boolean;
  sandevistanLastUsed?: number;

  // Subdermal armor current SP (ablates independently of worn armor)
  subdermalArmorSp?: number;

  // Improvement Points
  improvementPoints?: number;  // current unspent IP pool
  ipLifetime?: number;         // total IP ever earned (for records)

  // Ammo loaded into specific weapon types (weapon.name -> ammo type id).
  // Absence implies "basic" ammo. See data/ammo.ts.
  ammoLoaded?: Record<string, string>;

  // Ongoing ammo effects (burn/poison/emp/sleep/biotoxin). See engine/effects.ts.
  activeAmmoEffects?: IAmmoEffectState[];

  // Stun / non-lethal pool. Mirrors HP. Absent on legacy chars -- use
  // engine/stun.ts ensureStunPool() to lazy-init. Unconscious at current<=0.
  stun?: { current: number; max: number };
}

// ─── NPC (lightweight stat block stored on game objects as state.cprNpc) ────

export type NpcTier = "mook" | "lieutenant" | "boss";

export interface ICPRNpcWeapon {
  name: string;
  skill: string;        // e.g. "handgun", "shoulder_arms", "autofire", "melee_weapon"
  damageDice: number;   // 2 / 3 / 4 / 5d6
  autofire?: boolean;
  autofireMax?: number;
}

/**
 * Lightweight NPC stat block. Stored on game objects as `state.cprNpc`.
 * Only contains fields combat resolution actually reads.
 * Source: CPR Core GMing chapter (p.411+).
 */
export interface ICPRNpc {
  archetype: string;          // template id (e.g. "boosterganger")
  displayName: string;
  tier: NpcTier;
  stats: ICPRStats;
  skills: Record<string, number>;
  hp: { max: number; current: number };
  swThreshold: number;
  deathSave: number;
  deathSavePenalty: number;
  woundState: WoundState;
  armorBody: IArmorState | null;
  armorHead: IArmorState | null;
  weapon: ICPRNpcWeapon;
  spawnedAt: number;
  spawnedBy: string;
  /**
   * @ursamu/combat JSON brain key (aggressive, manual, llm, …).
   * Default aggressive when spawned via +npc.
   */
  aiKey?: string;
}

// ─── DBO: Combat ─────────────────────────────────────────────────────────────

export interface ICombatActor {
  actorId: string;
  name: string;
  initiative: number;
  held: boolean;
  acted: boolean;
  isNpc: boolean;
}

export interface ICombatState {
  id: string;
  roomId: string;
  round: number;
  active: boolean;
  queue: ICombatActor[];
  currentIndex: number;
  startedAt: number;
  startedBy: string;
  log: string[];
}

// ─── DBO: Markets ────────────────────────────────────────────────────────────

export interface IMarket {
  id: string;
  stallId?: string;
  roomId: string;
  fixerId: string;
  fixerName: string;
  fixerRank: number;
  tier: "night" | "midnight";
  marketName?: string;
  openedAt: number;
  expiresAt: number;
  active: boolean;
  lock?: string;        // UrsaMU lock expression; absent = public
  established: boolean; // true if opened in a room the fixer can edit
  maxConsign?: number;  // max asking price accepted for consignment; absent = unlimited
}

export interface IListing {
  id: string;
  marketId: string;
  sellerId: string;
  sellerName: string;
  itemName: string;
  description: string;
  price: number;
  priceCategory: PriceCategory;
  quantity: number;
  createdAt: number;
  consignedBy?: string;   // player ID of the original owner who consigned the item
  consignorCut?: number;  // percentage of sale price going to consignor (e.g. 85)
}

// ─── DBO: Consignment ─────────────────────────────────────────────────────────

export interface IConsignRequest {
  id: string;
  marketId: string;
  fixerId: string;
  consignorId: string;
  consignorName: string;
  gearItemId: string;
  gearItemName: string;
  gearItemSnapshot: IGearItem;  // full item for return if declined
  askingPrice: number;
  priceCategory: string;
  requestedAt: number;
  status: "pending" | "approved" | "declined" | "returned";
}

// ─── DBO: Crafting ───────────────────────────────────────────────────────────

export interface ICraftProject {
  id: string;
  techId: string;
  techName: string;
  itemName: string;
  type: "fabricate" | "upgrade" | "invent";
  specialty: "field" | "upgrade" | "fabrication" | "invention";
  specialtyRank: number;
  dv: number;
  skill: string;         // e.g. "weaponstech", "cybertech"
  materialsCost: number;
  startedAt: number;
  completesAt: number;
  completed: boolean;
  failed: boolean;
  result?: string;
  blueprintId?: string;
}

export interface IBlueprint {
  id: string;
  techId: string;
  techName: string;
  itemName: string;
  description: string;
  priceCategory: PriceCategory;
  dv: number;
  skill: string;
  createdAt: number;
}

// ─── DBO: Chop Shop ──────────────────────────────────────────────────────────

/** A Medtech's open chopshop in a room. */
export interface IChopshop {
  id: string;
  medtechId: string;
  medtechName: string;
  roomId: string;
  shopName: string;
  surgerySkill: number;
  rollBonus: number;        // TECH + surgerySkill cached at open time
  tierCap: "mall" | "clinic" | "hospital";
  openedAt: number;
  active: boolean;
  closedAt?: number;
  shopObjId?: string;  // ID of the in-world stall object
}

/** Cyberware extracted from a patient and held in inventory. */
export interface IExtractedChrome {
  id: string;
  cyberwareName: string;
  cyberwareCategory: string;
  installType: "mall" | "clinic" | "hospital";
  hl: number;
  hlRoll?: string;
  ownerId: string;
  ownerName: string;
  extractedAt: number;
  extractedFrom?: string;
  damaged: boolean;
}

export type ChopshopProcedure = "install" | "harvest" | "bodysculpt" | "therapy";

export interface IChopshopQueue {
  id: string;
  medtechId: string;
  medtechName: string;
  patientId: string;
  patientName: string;
  procedure: ChopshopProcedure;
  cyberwareName?: string;
  cyberwareHl?: number;
  surgeryDV: number;
  surgerySkill: string;
  scheduledAt: number;
  completesAt: number;   // scheduledAt + 4 hours
  completed: boolean;
  success?: boolean;
  failed?: boolean;
  notes?: string;
}

export type ChopshopTier = "mall" | "clinic" | "hospital";

export interface IChopshop {
  id: string;
  medtechId: string;
  medtechName: string;
  roomId: string;
  shopName: string;
  surgerySkill: number;
  tierCap: ChopshopTier;
  openedAt: number;
  active: boolean;
  closedAt?: number;
  shopObjId?: string;  // ID of the in-world stall object
}

export interface IExtractedChrome {
  id: string;
  cyberwareName: string;
  cyberwareCategory: string;
  installType: ChopshopTier;
  hl: number;
  hlRoll?: string;
  ownerId: string;
  ownerName: string;
  extractedAt: number;
  extractedFrom?: string;
  damaged: boolean;
}

// ─── DBO: Pharmaceuticals ────────────────────────────────────────────────────

export interface IPharmaProject {
  id: string;
  medtechId: string;
  medtechName: string;
  drugName: string;
  quantity: number;
  dv: number;
  materialsCost: number;
  startedAt: number;
  completesAt: number;
  completed: boolean;
  failed: boolean;
}

// ─── DBO: Jobs Board ────────────────────────────────────────────────────────

export type JobDanger = "low" | "medium" | "high" | "extreme";
export type JobStatus = "open" | "active" | "completed" | "cancelled";

export interface IJob {
  id: string;
  title: string;
  description: string;
  postedBy: string;
  postedByName: string;
  /** Canonical pay field (templates + schema). */
  payAmount: number;
  payCategory: PriceCategory;
  dangerLevel: JobDanger;
  takenBy: string[];
  takenByNames: string[];
  status: JobStatus;
  createdAt: number;
  completedAt?: number;
  requiresRole?: Role;
  requiresSkill?: string;
  minSkillLevel?: number;
  minTeamSize?: number;
  /** Alias used by some command paths (same as payAmount). */
  payoutEb?: number;
  /** Alias for dangerLevel in some UIs. */
  difficulty?: JobDanger | string;
  objectives?: string[];
  expiresAt?: number | null;
  /** Alias for payCategory. */
  payoutCategory?: PriceCategory;
}

// ─── DBO: AI-GM mission runs (cpr.runs) ──────────────────────────────────────

export type MissionRunStatus =
  | "briefing"
  | "active"
  | "combat"
  | "complete"
  | "failed"
  | "aborted";

export type MissionPhaseKind =
  | "rp"
  | "combat"
  | "net"
  | "loot"
  | "exfil";

export interface IMissionPhase {
  id: string;
  title: string;
  /** Scene description for the room / GM. */
  scene: string;
  kind: MissionPhaseKind;
  /** NPC archetype slugs to spawn on enter. */
  spawn?: string[];
  /** Cue line for the AI-GM. */
  onEnter?: string;
}

export interface IMissionObjective {
  id: string;
  text: string;
  optional?: boolean;
  done: boolean;
  auto?: "threats_clear" | "phase_reach" | "manual";
}

export interface IMissionThreat {
  npcId: string;
  name: string;
  archetype: string;
  status: "staged" | "active" | "down";
}

export interface IMissionRun {
  id: string;
  roomId: string;
  sessionId?: string;
  jobId?: string;
  templateId: string;
  title: string;
  status: MissionRunStatus;
  phaseIndex: number;
  phases: IMissionPhase[];
  objectives: IMissionObjective[];
  crewIds: string[];
  crewNames: string[];
  threats: IMissionThreat[];
  heat: { ticks: number; max: number };
  payoutEb: number;
  startedAt: number;
  completedAt?: number;
  brief: string;
  startedById: string;
  startedByName: string;
}

// ─── DBO: NET Architecture ───────────────────────────────────────────────────

export type NetFloorType = "password" | "ice" | "file" | "control";

export interface INetFloor {
  level: number;
  type: NetFloorType;
  name: string;
  dv: number;
  hp?: number;
  currentHp?: number;
  effect?: string;
  bypassed?: boolean;
}

export interface INetArchitecture {
  id: string;
  name: string;
  ownerId: string;
  roomId: string;
  floors: INetFloor[];
  portable: boolean;
  maxControlNodes: number;
  totalFloors: number;
  costPerFloor: number;
}

export interface INetrun {
  id: string;
  netrunnerIds: string[];
  roomId: string;
  architectureId: string;
  /** Alias for architectureId used by some command paths. */
  archId?: string;
  currentFloor: Record<string, number>; // runnerId → floor index
  active: boolean;
  startedAt: number;
  log: string[];
  /** NET actions used by this runner in the current turn. Reset by +net/endturn. */
  actionsUsedThisTurn: number;
  /** Single-runner shorthand used by some command paths. */
  runnerId?: string;
}
// ─── DBO: Suppressive Fire ───────────────────────────────────────────────────

export interface ICPRSuppression {
  id: string;
  roomId: string;
  attackerId: string;
  attackerName: string;
  /** WILL + Concentration + 1d10 result used for resist checks */
  suppressTotal: number;
  /** Weapon damage dice (for 1d6 hit on failed resist) */
  damageDice: number;
  createdAt: number;
  /** Suppression expires when set to false */
  active: boolean;
}

// ─── DBO: Bench (Tech offline workshop) ──────────────────────────────────────

export interface IBenchRates {
  weapon: number;   // EB per SP restored on a weapon
  armor: number;    // EB per SP restored on armor
  gear: number;     // flat fee for misc gear
}

export interface IBench {
  id: string;
  techId: string;
  techName: string;
  roomId: string;
  benchName: string;
  techSkill: number;       // maker rank cached at open time
  openedAt: number;
  expiresAt: number;       // Number.MAX_SAFE_INTEGER if established
  active: boolean;
  established: boolean;
  rates: IBenchRates;
}

export interface IRepairJob {
  id: string;
  benchId: string;
  techId: string;
  techName: string;
  clientId: string;
  clientName: string;
  itemName: string;
  itemType: "weapon" | "armor" | "gear";
  spToRestore?: number;    // for weapon/armor
  costPaid: number;
  queuedAt: number;
  completesAt: number;     // queuedAt + duration based on techSkill
  completed: boolean;
  pickedUp: boolean;
}

// ─── DBO: Want Ads ──────────────────────────────────────────────────────────

export interface IWantAd {
  id: string;
  buyerId: string;
  buyerName: string;
  itemName: string;
  maxPrice: number;
  priceCategory?: string;
  createdAt: number;
  expiresAt: number;
  fulfilled: boolean;
}

// ─── GM Bridge Payload ───────────────────────────────────────────────────────
//
// ─── DBO: Passive Income ─────────────────────────────────────────────────────

export interface IIncomeRecord {
  id: string;
  playerId: string;
  playerName: string;
  role: string;
  roleRank: number;
  amount: number;
  period: "weekly" | "monthly";
  paidAt: number;
  nextDueAt: number;
}

// Standard cross-plugin payload shape for events listed in the
// gm:system:register `events` array. Must match ai-gm's IGMEventPayload at
// runtime. Plain text only — no MUSH codes — safe for LLM injection.

export interface ICPRGMPayload {
  roomId: string;
  playerId: string;
  playerName: string;
  /** Plain-text summary injected into the GM round context. No MUSH codes. */
  summary: string;
}

// ─── Hook Payloads ───────────────────────────────────────────────────────────

export interface ICPRAttackPayload {
  attackerId: string;
  attackerName: string;
  defenderId: string;
  defenderName: string;
  hit: boolean;
  roll: number;
  dv: number;
  damage: number;
  armorSp: number;
  location: "head" | "body";
  critical: boolean;
}

export interface ICPRWoundPayload {
  actorId: string;
  actorName: string;
  from: WoundState;
  to: WoundState;
  hp: number;
  maxHp: number;
}

export interface ICPRDeathSavePayload {
  actorId: string;
  actorName: string;
  roll: number;
  body: number;
  penalty: number;
  success: boolean;
}

export interface ICPRCritPayload {
  actorId: string;
  actorName: string;
  location: "head" | "body";
  roll: number;
  injury: ICriticalInjury;
}

export interface ICPRMarketPayload {
  marketId: string;
  roomId: string;
  fixerId: string;
  fixerName: string;
  tier: "night" | "midnight";
}

export interface ICPRTransactionPayload {
  marketId: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  itemName: string;
  price: number;
}

export interface ICPRCraftPayload {
  projectId: string;
  techId: string;
  techName: string;
  itemName: string;
  type: ICraftProject["type"];
  success?: boolean;
}

export interface ICPRJobPayload {
  jobId: string;
  title: string;
  actorId?: string;
  actorName?: string;
  payAmount?: number;
}

export interface ICPRScavengePayload {
  actorId: string;
  actorName: string;
  zoneId: string;
  roll: number;
  dv: number;
  success: boolean;
  loot?: string;
}

// ─── DBO: Sourcing Listings ──────────────────────────────────────────────────

/** A private item listing created by a Fixer's sourcing roll (CPR p.159). */
export interface ISourcingListing {
  id: string;
  fixerId: string;
  fixerName: string;
  itemName: string;
  itemDescription: string;
  price: number;
  priceCategory: PriceCategory;
  createdAt: number;
  /** createdAt + 24 hours */
  expiresAt: number;
  purchased: boolean;
}

// ─── Ongoing Ammo Effects (engine/effects.ts) ────────────────────────────────

/** A single instance of an active ongoing ammo effect on a character. */
export interface IAmmoEffectState {
  effect: "burn" | "poison" | "emp" | "sleep" | "biotoxin";
  /** Rounds left. -1 = indefinite (burn, until extinguished). */
  remainingTurns: number;
  /** Damage applied per tick. 0 / absent for non-damaging effects (emp, sleep). */
  damagePerTurn?: number;
  /** RES save total recorded at enqueue time, if a save was made. */
  dvSavedAt?: number;
  /** Attacker id if known. */
  sourceId?: string;
}
