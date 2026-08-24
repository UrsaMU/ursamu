/**
 * Typed emit helpers for all CPR game hooks.
 * Use these instead of raw gameHooks.emit() to get compile-time payload checking.
 */
import { gameHooks } from "@ursamu/ursamu";
import type {
  ICPRAttackPayload,
  ICPRWoundPayload,
  ICPRDeathSavePayload,
  ICPRCritPayload,
  ICombatState,
  ICraftProject,
  ICriticalInjury,
  IJob,
  WoundState,
  ICPRCharacter,
  ICyberware,
} from "../db/schemas.ts";
import "./hooks-augment.ts";

type ActorRef = { id: string; name?: string };
// -- Combat ------------------------------------------------------------------

export const emitCombatStart = (
  roomId: string,
  startedBy: string,
  participants: { actorId: string; name: string }[]
) => gameHooks.emit("cpr:combat:start", { roomId, startedBy, participants });

export const emitCombatEnd = (state: ICombatState) =>
  gameHooks.emit("cpr:combat:end", {
    roomId: state.roomId,
    rounds: state.round,
    state,
  });

export const emitCombatTurn = (
  roomId: string,
  actorId: string,
  actorName: string,
  round: number
) => gameHooks.emit("cpr:combat:turn", { roomId, actorId, actorName, round });

export const emitAttackResolved = (payload: ICPRAttackPayload) =>
  gameHooks.emit("cpr:attack:resolved", payload);

export const emitWoundChanged = (payload: ICPRWoundPayload) =>
  gameHooks.emit("cpr:wound:changed", payload);

export const emitDeathSaveRolled = (payload: ICPRDeathSavePayload) =>
  gameHooks.emit("cpr:death_save:rolled", payload);

export const emitDeathSaveFailed = (actorId: string, actorName: string) =>
  gameHooks.emit("cpr:death_save:failed", { actorId, actorName });

export const emitCriticalInjury = (payload: ICPRCritPayload) =>
  gameHooks.emit("cpr:critical_injury", payload);

export const emitStabilized = (
  actorId: string,
  actorName: string,
  byId: string,
  byName: string
) =>
  gameHooks.emit("cpr:stabilized", { actorId, actorName, byId, byName });

// -- Character ----------------------------------------------------------------

export const emitChargenComplete = (
  actorId: string,
  actorName: string,
  role: string,
  method: string
) => gameHooks.emit("cpr:chargen:complete", { actorId, actorName, role, method });

export const emitCyberwareInstalled = (
  actor: ActorRef,
  item: ICyberware | string,
  hlAdded: number,
  totalHl = 0,
  currentEmp = 0,
) => {
  const itemName = typeof item === "string" ? item : item.name;
  gameHooks.emit("cpr:cyberware:installed", {
    actorId: actor.id,
    actorName: actor.name ?? actor.id,
    item: itemName,
    hlAdded,
    totalHl,
    currentEmp,
  });
};
export const emitCyberpsychosisThreshold = (
  actorId: string,
  actorName: string,
  hl: number,
  empCurrent: number
) =>
  gameHooks.emit("cpr:cyberpsychosis:threshold", {
    actorId, actorName, hl, empCurrent,
  });

export const emitCyberpsychosisReduced = (
  actorId: string,
  actorName: string,
  hlReduced: number,
  empGained: number,
  newEmp: number
) =>
  gameHooks.emit("cpr:cyberpsychosis:reduced", {
    actorId, actorName, hlReduced, empGained, newEmp,
  });

/** Call site: emitReputationGained(actor, amount, deed) */
export const emitReputationGained = (
  actor: ActorRef,
  amountOrOld: number,
  deedOrNew: string | number,
  maybeNew?: number,
  maybeDeed?: string,
) => {
  let oldRep = 0;
  let newRep = amountOrOld;
  let deed = "deed";
  if (typeof deedOrNew === "string" && maybeNew === undefined) {
    // (actor, amount, deed)
    oldRep = 0;
    newRep = amountOrOld;
    deed = deedOrNew;
  } else if (typeof deedOrNew === "number") {
    oldRep = amountOrOld;
    newRep = deedOrNew;
    deed = maybeDeed ?? "deed";
  }
  gameHooks.emit("cpr:reputation:gained", {
    actorId: actor.id,
    actorName: actor.name ?? actor.id,
    oldRep,
    newRep,
    deed,
  });
};

/** Call site: emitRoleAbility(actor, role, rank) */
export const emitRoleAbility = (
  actor: ActorRef,
  role: string,
  rankOrAbility: number | string,
  maybeRank?: number,
  context: Record<string, unknown> = {},
) => {
  const abilityName = typeof rankOrAbility === "string"
    ? rankOrAbility
    : role;
  const rank = typeof rankOrAbility === "number"
    ? rankOrAbility
    : (maybeRank ?? 0);
  gameHooks.emit("cpr:role:ability", {
    actorId: actor.id,
    actorName: actor.name ?? actor.id,
    role,
    abilityName,
    rank,
    context,
  });
};
// -- Netrunning ---------------------------------------------------------------

/** Call site: emitNetrunAction(actor, cpr, abilityName, success) */
export const emitNetrunAction = (
  actor: ActorRef,
  _cpr: ICPRCharacter | string,
  ability: string,
  successOrRoll: boolean | number,
  maybeDv?: number,
  maybeSuccess?: boolean,
  target?: string,
) => {
  const success = typeof successOrRoll === "boolean"
    ? successOrRoll
    : (maybeSuccess ?? false);
  const roll = typeof successOrRoll === "number" ? successOrRoll : 0;
  const dv = maybeDv ?? 0;
  gameHooks.emit("cpr:netrun:action", {
    actorId: actor.id,
    actorName: actor.name ?? actor.id,
    ability,
    target,
    roll,
    dv,
    success,
  });
};
export const emitNetrunIceHit = (
  actorId: string,
  actorName: string,
  iceName: string,
  damage: number
) =>
  gameHooks.emit("cpr:netrun:ice_hit", { actorId, actorName, iceName, damage });

export const emitNetrunComplete = (
  actorId: string,
  actorName: string,
  architectureId: string,
  success: boolean
) =>
  gameHooks.emit("cpr:netrun:complete", {
    actorId, actorName, architectureId, success,
  });

// -- Economy ------------------------------------------------------------------

export const emitMarketOpened = (
  marketId: string,
  roomId: string,
  fixerId: string,
  fixerName: string,
  tier: "night" | "midnight",
  fixerRank: number
) =>
  gameHooks.emit("cpr:market:opened", {
    marketId, roomId, fixerId, fixerName, tier, fixerRank,
  });

export const emitMarketClosed = (
  marketId: string,
  roomId: string,
  fixerId: string,
  fixerName: string,
  tier: "night" | "midnight",
  fixerRank: number
) =>
  gameHooks.emit("cpr:market:closed", {
    marketId, roomId, fixerId, fixerName, tier, fixerRank,
  });

export const emitMarketTransaction = (
  marketId: string,
  buyerId: string,
  buyerName: string,
  sellerId: string,
  sellerName: string,
  itemName: string,
  price: number
) =>
  gameHooks.emit("cpr:market:transaction", {
    marketId, buyerId, buyerName, sellerId, sellerName, itemName, price,
  });

/** Call site: emitLifestylePaid(actor, tierName, cost) */
export const emitLifestylePaid = (
  actor: ActorRef,
  tier: string,
  amount: number,
  nextDueDate = Date.now() + 30 * 24 * 3600_000,
) =>
  gameHooks.emit("cpr:lifestyle:paid", {
    actorId: actor.id,
    actorName: actor.name ?? actor.id,
    tier,
    amount,
    nextDueDate,
  });

export const emitLifestyleDefaulted = (
  actorId: string,
  actorName: string,
  tier: string,
  amountOwed: number
) =>
  gameHooks.emit("cpr:lifestyle:defaulted", {
    actorId, actorName, tier, amountOwed,
  });

// -- Crafting & Services ------------------------------------------------------

// Call sites pass (actor, project) — actor is ignored (project has techId).
export const emitCraftStarted = (
  _actor: { id: string; name?: string },
  project: ICraftProject,
) =>
  gameHooks.emit("cpr:craft:started", {
    projectId: project.id,
    techId: project.techId,
    techName: project.techName,
    itemName: project.itemName,
    type: project.type,
  });

export const emitCraftCompleted = (
  _actor: { id: string; name?: string },
  project: ICraftProject,
) =>
  gameHooks.emit("cpr:craft:completed", {
    projectId: project.id,
    techId: project.techId,
    techName: project.techName,
    itemName: project.itemName,
    type: project.type,
    success: true,
  });

export const emitCraftFailed = (
  _actor: { id: string; name?: string },
  project: ICraftProject,
) =>
  gameHooks.emit("cpr:craft:failed", {
    projectId: project.id,
    techId: project.techId,
    techName: project.techName,
    itemName: project.itemName,
    type: project.type,
    success: false,
  });

export const emitPharmaEffect = (
  actorId: string,
  actorName: string,
  drugName: string,
  effect: string,
  expiresAt: number
) =>
  gameHooks.emit("cpr:pharma:effect_applied", {
    actorId, actorName, drugName, effect, expiresAt,
  });

export const emitPharmaExpired = (
  actorId: string,
  actorName: string,
  drugName: string
) =>
  gameHooks.emit("cpr:pharma:effect_expired", { actorId, actorName, drugName });

// -- Jobs ---------------------------------------------------------------------

export const emitJobPosted = (actor: ActorRef, job: IJob) =>
  gameHooks.emit("cpr:job:posted", {
    jobId: job.id,
    title: job.title,
    actorId: actor.id,
    actorName: actor.name ?? actor.id,
  });

export const emitJobTaken = (actor: ActorRef, job: IJob) =>
  gameHooks.emit("cpr:job:taken", {
    jobId: job.id,
    title: job.title,
    actorId: actor.id,
    actorName: actor.name ?? actor.id,
  });

export const emitJobCompleted = (actor: ActorRef, job: IJob) =>
  gameHooks.emit("cpr:job:completed", {
    jobId: job.id,
    title: job.title,
    actorId: actor.id,
    actorName: actor.name ?? actor.id,
    payAmount: job.payAmount,
  });

// -- GM Bridge ----------------------------------------------------------------
// ICPRGMPayload events -- plain text, no MUSH codes, safe for LLM injection.

export const emitGMRoll = (roomId: string, playerId: string, playerName: string, summary: string) =>
  gameHooks.emit("cpr:roll", { roomId, playerId, playerName, summary });

export const emitGMAttackHit = (roomId: string, playerId: string, playerName: string, summary: string) =>
  gameHooks.emit("cpr:attack:hit", { roomId, playerId, playerName, summary });

export const emitGMRestCompleted = (roomId: string, playerId: string, playerName: string, summary: string) =>
  gameHooks.emit("cpr:rest:completed", { roomId, playerId, playerName, summary });

export const emitGMHumanityGained = (roomId: string, playerId: string, playerName: string, summary: string) =>
  gameHooks.emit("cpr:humanity:gained", { roomId, playerId, playerName, summary });

export const emitGMBrawlResolved = (roomId: string, playerId: string, playerName: string, summary: string) =>
  gameHooks.emit("cpr:brawl:resolved", { roomId, playerId, playerName, summary });

// -- Missing emitters (referenced by command modules) -------------------------

export const emitCombatWound = (payload: ICPRWoundPayload) =>
  gameHooks.emit("cpr:combat:wound", payload);

export const emitDeathSave = (payload: ICPRDeathSavePayload) =>
  gameHooks.emit("cpr:death_save:rolled", payload);

export const emitBodysculptCompleted = (
  actorId: string,
  actorName: string,
  modification: string,
  hlAdded: number
) =>
  gameHooks.emit("cpr:bodysculpt:completed", {
    actorId, actorName, modification, hlAdded,
  });

export const emitChopshopHarvest = (
  techId: string,
  techName: string,
  targetId: string,
  targetName: string,
  item: string,
  success: boolean
) =>
  gameHooks.emit("cpr:chopshop:harvest", {
    techId, techName, targetId, targetName, item, success,
  });

export const emitChopshopInstallComplete = (
  techId: string,
  techName: string,
  patientId: string,
  patientName: string,
  item: string,
  success: boolean
) =>
  gameHooks.emit("cpr:chopshop:install_complete", {
    techId, techName, patientId, patientName, item, success,
  });

export const emitJobAbandoned = (actor: ActorRef, job: IJob) =>
  gameHooks.emit("cpr:job:abandoned", {
    jobId: job.id,
    title: job.title,
    actorId: actor.id,
    actorName: actor.name ?? actor.id,
  });

export const emitRunStarted = (payload: {
  runId: string;
  roomId: string;
  title: string;
  crewIds: string[];
}) => gameHooks.emit("cpr:run:started", payload);

export const emitRunPhase = (payload: {
  runId: string;
  roomId: string;
  phaseIndex: number;
  phaseTitle: string;
  kind: string;
}) => gameHooks.emit("cpr:run:phase", payload);

export const emitRunCompleted = (payload: {
  runId: string;
  roomId: string;
  title: string;
  payoutEb: number;
  crewIds: string[];
}) => gameHooks.emit("cpr:run:completed", payload);

export const emitRunAborted = (payload: {
  runId: string;
  roomId: string;
}) => gameHooks.emit("cpr:run:aborted", payload);

export const emitDrugEffectApplied = (
  actor: ActorRef,
  drugName: string,
  effect: string,
  expiresAt = Date.now() + 3600_000,
) =>
  gameHooks.emit("cpr:drug:effect_applied", {
    actorId: actor.id,
    actorName: actor.name ?? actor.id,
    drugName,
    effect,
    expiresAt,
  });

export const emitMarketHaggle = (
  marketId: string,
  buyerId: string,
  buyerName: string,
  listingId: string,
  roll: number,
  dv: number,
  success: boolean,
  discount: number
) =>
  gameHooks.emit("cpr:market:haggle", {
    marketId, buyerId, buyerName, listingId, roll, dv, success, discount,
  });

/** Call site: emitNetrunBreach(actor, archName, floor) */
export const emitNetrunBreach = (
  actor: ActorRef,
  architectureId: string,
  floor: number,
) =>
  gameHooks.emit("cpr:netrun:breach", {
    actorId: actor.id,
    actorName: actor.name ?? actor.id,
    architectureId,
    floor,
  });

/** Call site: emitPharmaSynthesized(actor, drugName) */
export const emitPharmaSynthesized = (
  tech: ActorRef,
  drugName: string,
  quantity = 1,
  success = true,
) =>
  gameHooks.emit("cpr:pharma:synthesized", {
    techId: tech.id,
    techName: tech.name ?? tech.id,
    drugName,
    quantity,
    success,
  });

export const emitScavengeRolled = (
  actorId: string,
  actorName: string,
  zoneId: string,
  roll: number,
  dv: number
) =>
  gameHooks.emit("cpr:scavenge:rolled", { actorId, actorName, zoneId, roll, dv });

export const emitTherapySession = (
  techId: string,
  techName: string,
  patientId: string,
  patientName: string,
  roll: number,
  dv: number,
  success: boolean,
  hlReduced: number
) =>
  gameHooks.emit("cpr:therapy:session", {
    techId, techName, patientId, patientName, roll, dv, success, hlReduced,
  });

// -- Scavenge -----------------------------------------------------------------

export const emitScavengeFound = (
  actorId: string,
  actorName: string,
  zoneId: string,
  roll: number,
  dv: number,
  loot: string
) =>
  gameHooks.emit("cpr:scavenge:found", {
    actorId, actorName, zoneId, roll, dv, success: true, loot,
  });

export const emitScavengeAmbush = (
  actorId: string,
  actorName: string,
  zoneId: string,
  roll: number,
  dv: number
) =>
  gameHooks.emit("cpr:scavenge:ambushed", {
    actorId, actorName, zoneId, roll, dv, success: false,
  });
