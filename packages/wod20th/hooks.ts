// hooks.ts -- GameHooks declaration merge + typed emit helpers.
// Other plugins (jobs, bbs, Discord) subscribe here; zero coupling to chargen internals.
import { gameHooks } from "@ursamu/ursamu";
import type {
  ChargenStartedEvent,
  ChargenStepEvent,
  ChargenSubmittedEvent,
  ChargenApprovedEvent,
  ChargenDeniedEvent,
  ChargenResetEvent,
  SheetViewedEvent,
  StatChangedEvent,
  CharCreatedEvent,
  CharUpdatedEvent,
  HealthChangedEvent,
  PoolChangedEvent,
  FormChangedEvent,
  RenownAwardedEvent,
  RenownLostEvent,
  RankAdvancedEvent,
  SplatId,
} from "./core/types.ts";

/** Payload for wod20th:rite-learned. */
export interface RiteLearnedEvent {
  playerId: string;
  charId: string;
  slug: string;
  /** Staff player id when learned via +rite/teach. */
  taughtBy?: string;
}

/** Payload for wod20th:rite-cast. */
export interface RiteCastEvent {
  playerId: string;
  charId: string;
  slug: string;
  roll: import("./core/dice.ts").IDiceRoll;
  outcome: "success" | "failure";
}

/** Payload for wod20th:frenzy-* events. */
export interface FrenzyEvent {
  actorId: string;     // who triggered the change (self for /check, staff for /calm /force)
  targetId: string;    // whose state changed
  charId: string;
  state: "berserk" | "fox" | null;
  trigger?: string;    // FRENZY_TRIGGERS key, when applicable
  until: number;       // epoch ms; 0 = indefinite or cleared
}

// GameHookMap augmentation lives in game-hooks-augment.ts
// (not published to JSR — declare module is disallowed there).

/** Payload for wod20th:init-rolled. */
export interface InitRolledEvent {
  charId:   string;
  playerId: string;
  total:    number;
}

/** Payload for wod20th:vote-cast. */
export interface VoteCastEvent {
  voterId:     string;
  voterCharId: string;
  voteeId:     string;
  voteeCharId: string;
  amount:      number;
  reason:      string;
  ts:          number;
  xpEntryId:   string;
}

/** Payload for wod20th:xp-spent. */
export interface XpSpentEvent {
  playerId: string;
  charId:   string;
  trait:    string;
  cost:     number;
  newRating?: number;
}

export function emitXpSpent(e: XpSpentEvent): void {
  gameHooks.emit("wod20th:xp-spent", e);
}

/** Payload for wod20th:gift-used. */
export interface GiftUsedEvent {
  playerId: string;
  charId: string;
  slug: string;
  /** Gnosis spent on activation (legacy field; 0 when action.cost has no Gnosis). */
  cost: number;
  /** Full structured cost breakdown (gnosis/willpower/rage) when available. */
  costBreakdown?: { gnosis?: number; willpower?: number; rage?: number };
  /** Resolved dice pool size when the gift's action declared a roll. */
  poolSize?: number;
  /** Net successes from the action roll (undefined when no roll). */
  netSuccesses?: number;
  /** Whether the action roll botched. */
  botch?: boolean;
}

/** Payload for wod20th:fetish-used. */
export interface FetishUsedEvent {
  playerId: string;
  charId: string;
  itemId: string;
  cost: number;
}

/** Payload for wod20th:fetish-released. */
export interface FetishReleasedEvent {
  playerId: string;
  charId: string;
  itemId: string;
}

/** Payload for wod20th:combat:attack. */
export interface CombatAttackEvent {
  attackerId: string;
  defenderId: string;
  result:     import("./core/combat.ts").IAttackResult;
}

export interface SteppedSidewaysEvent {
  playerId: string;
  charId:   string;
  outcome:  "entered" | "exited" | "failed" | "botched";
  roll:     import("./core/dice.ts").IDiceRoll;
}

export function emitSteppedSideways(e: SteppedSidewaysEvent): void {
  gameHooks.emit("wod20th:stepped-sideways", e);
}

// -- Typed emit helpers -- call these instead of gameHooks.emit() directly ----

export function emitChargenStarted(playerId: string, charId: string, splat: SplatId): void {
  gameHooks.emit("wod20th:chargen:started", { playerId, charId, splat });
}

export function emitChargenStep(playerId: string, charId: string, splat: SplatId, step: number): void {
  gameHooks.emit("wod20th:chargen:step", { playerId, charId, splat, step });
}

export function emitChargenSubmitted(e: ChargenSubmittedEvent): void {
  gameHooks.emit("wod20th:chargen:submitted", e);
}

export function emitChargenApproved(e: ChargenApprovedEvent): void {
  gameHooks.emit("wod20th:chargen:approved", e);
}

export function emitChargenDenied(e: ChargenDeniedEvent): void {
  gameHooks.emit("wod20th:chargen:denied", e);
}

export function emitChargenReset(playerId: string, charId: string): void {
  gameHooks.emit("wod20th:chargen:reset", { playerId, charId });
}

export function emitSheetViewed(e: SheetViewedEvent): void {
  gameHooks.emit("wod20th:sheet:viewed", e);
}

export function emitStatChanged(e: StatChangedEvent): void {
  gameHooks.emit("wod20th:stat:changed", e);
}

export function emitCharCreated(playerId: string, charId: string, splat: SplatId): void {
  gameHooks.emit("wod20th:char:created", { playerId, charId, splat });
}

export function emitCharUpdated(playerId: string, charId: string, changedFields: string[]): void {
  gameHooks.emit("wod20th:char:updated", { playerId, charId, changedFields });
}

export function emitHealthChanged(e: HealthChangedEvent): void {
  gameHooks.emit("wod20th:health:changed", e);
}

export function emitPoolSpent(e: PoolChangedEvent): void {
  gameHooks.emit("wod20th:pool-spent", e);
}

export function emitPoolRegained(e: PoolChangedEvent): void {
  gameHooks.emit("wod20th:pool-regained", e);
}

export function emitFormChanged(e: FormChangedEvent): void {
  gameHooks.emit("wod20th:form-changed", e);
}

export function emitFrenzyEntered(e: FrenzyEvent): void {
  gameHooks.emit("wod20th:frenzy-entered", e);
}

export function emitFrenzyCleared(e: FrenzyEvent): void {
  gameHooks.emit("wod20th:frenzy-cleared", e);
}

export function emitRenownAwarded(e: RenownAwardedEvent): void {
  gameHooks.emit("wod20th:renown-awarded", e);
}

export function emitRenownLost(e: RenownLostEvent): void {
  gameHooks.emit("wod20th:renown-lost", e);
}

export function emitRankAdvanced(e: RankAdvancedEvent): void {
  gameHooks.emit("wod20th:rank-advanced", e);
}
