// Extended Action subsystem (CoFD 2e core p.70).
//
// Extended Actions accumulate successes across multiple rolls. Each attempt
// uses a pool (typically Attribute+Skill), and the action continues until
// the accumulated total meets a target, the attempt cap is exhausted, the
// owner abandons, or a sibling in a contested pair succeeds.
//
// Storage: DBO collection "cofd.extended-actions" (one record per action).
// Reads: u.me.state.cofd  -- live SDK convention.
// Writes: "data.cofd"     -- sheet persistence path (state.cofd silently drops).
//
// Resolution hooks: callers can subscribe via onExtendedResolve(handler). The
// payload fires whenever an action transitions from "active" to "succeeded",
// "failed", or "abandoned". A best-effort gameHooks.emit("cofd:extended:resolve")
// is also broadcast for cross-plugin observers.

import { DBO, gameHooks } from "@ursamu/ursamu";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExtendedInterval = "turn" | "hour" | "day" | "scene";
export type ExtendedStatus = "active" | "succeeded" | "failed" | "abandoned";

export interface ExtendedAttempt {
  idx: number;
  successes: number;
  roll: number[];
  exceptional: boolean;
  dramatic: boolean;
  note: string;
  when: number;
}

export interface ExtendedAction {
  id: string;
  ownerId: string;
  ownerName: string;
  roomId: string;
  description: string;
  pool: string;
  target: number;
  maxRolls: number;
  interval: ExtendedInterval;
  cumulativePenalty: boolean;
  accumulated: number;
  attempts: number;
  lastRollPenalty: number;
  status: ExtendedStatus;
  contestId: string | null;
  tag: string;
  createdAt: number;
  resolvedAt: number | null;
  attemptsLog: ExtendedAttempt[];
}

export interface ExtendedResolvePayload {
  id: string;
  ownerId: string;
  status: ExtendedStatus;
  accumulated: number;
  target: number;
  attempts: number;
  tag: string;
}

// ---------------------------------------------------------------------------
// DBO
// ---------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
type Q = any;

export const extendedDb = new DBO<ExtendedAction>("cofd.extended-actions");

// ---------------------------------------------------------------------------
// Resolution callback registry
// ---------------------------------------------------------------------------

type ResolveHandler = (p: ExtendedResolvePayload) => void | Promise<void>;
const handlers: Set<ResolveHandler> = new Set();

export function onExtendedResolve(h: ResolveHandler): void {
  handlers.add(h);
}

export function offExtendedResolve(h: ResolveHandler): void {
  handlers.delete(h);
}

async function fireResolve(p: ExtendedResolvePayload): Promise<void> {
  for (const h of handlers) {
    try {
      await h(p);
    } catch (_err) {
      // Swallow handler errors -- callbacks must not break the engine.
    }
  }
  try {
    const emit = (gameHooks as unknown as { emit?: (k: string, v: unknown) => unknown }).emit;
    if (typeof emit === "function") {
      emit.call(gameHooks, "cofd:extended:resolve", p);
    }
  } catch (_err) {
    // Best-effort broadcast.
  }
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/** Pure id factory (test-friendly). */
function newId(): string {
  return `ext-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

export interface CreateExtendedInput {
  ownerId: string;
  ownerName: string;
  roomId: string;
  description: string;
  pool: string;
  target: number;
  maxRolls: number;
  interval?: ExtendedInterval;
  cumulativePenalty?: boolean;
  tag?: string;
  contestId?: string | null;
}

/** Build a fresh active action. Does not persist. */
export function newExtendedAction(input: CreateExtendedInput): ExtendedAction {
  return {
    id: newId(),
    ownerId: input.ownerId,
    ownerName: input.ownerName,
    roomId: input.roomId,
    description: input.description,
    pool: input.pool,
    target: input.target,
    maxRolls: input.maxRolls,
    interval: input.interval ?? "scene",
    cumulativePenalty: input.cumulativePenalty ?? false,
    accumulated: 0,
    attempts: 0,
    lastRollPenalty: 0,
    status: "active",
    contestId: input.contestId ?? null,
    tag: input.tag ?? "",
    createdAt: Date.now(),
    resolvedAt: null,
    attemptsLog: [],
  };
}

/** Persist a new action. */
export async function createExtendedAction(input: CreateExtendedInput): Promise<ExtendedAction> {
  const action = newExtendedAction(input);
  await extendedDb.create(action);
  return action;
}

export async function getExtendedAction(id: string): Promise<ExtendedAction | null> {
  if (!id) return null;
  const found = await extendedDb.findOne({ id } as Q);
  return found ?? null;
}

/** Single active action for an owner, or null. Convention: one at a time. */
export async function getActiveForOwner(ownerId: string): Promise<ExtendedAction | null> {
  const all = await extendedDb.find({ ownerId } as Q);
  return all.find((a) => a.status === "active") ?? null;
}

export async function listForOwner(ownerId: string): Promise<ExtendedAction[]> {
  return await extendedDb.find({ ownerId } as Q);
}

export async function listForRoom(roomId: string): Promise<ExtendedAction[]> {
  return await extendedDb.find({ roomId } as Q);
}

export async function listAll(): Promise<ExtendedAction[]> {
  return await extendedDb.find({} as Q);
}

// ---------------------------------------------------------------------------
// Roll recording
// ---------------------------------------------------------------------------

export interface AttemptInput {
  successes: number;
  exceptional: boolean;
  dramatic: boolean;
  roll: number[];
  note?: string;
}

export interface AttemptOutcome {
  action: ExtendedAction;
  resolved: boolean;
  reason: "success" | "exhausted" | null;
}

/**
 * Record an attempt against an active action. Updates accumulated, attempts,
 * and lastRollPenalty. Auto-resolves on target hit or maxRolls exhausted.
 * Fires the resolve hook on transition. Throws if the action is not active.
 */
export async function recordAttempt(
  action: ExtendedAction,
  input: AttemptInput,
): Promise<AttemptOutcome> {
  if (action.status !== "active") {
    throw new Error(`Extended action ${action.id} is not active (status=${action.status}).`);
  }

  const attemptIdx = action.attempts + 1;
  const attempt: ExtendedAttempt = {
    idx: attemptIdx,
    successes: input.successes,
    roll: input.roll,
    exceptional: input.exceptional,
    dramatic: input.dramatic,
    note: input.note ?? "",
    when: Date.now(),
  };

  // Dramatic failure injects -2 to the NEXT attempt.
  const nextPenalty = input.dramatic ? -2 : 0;

  const updated: ExtendedAction = {
    ...action,
    accumulated: action.accumulated + Math.max(0, input.successes),
    attempts: attemptIdx,
    lastRollPenalty: nextPenalty,
    attemptsLog: [...action.attemptsLog, attempt],
  };

  let resolved = false;
  let reason: "success" | "exhausted" | null = null;

  if (updated.accumulated >= updated.target) {
    updated.status = "succeeded";
    updated.resolvedAt = Date.now();
    resolved = true;
    reason = "success";
  } else if (updated.attempts >= updated.maxRolls) {
    updated.status = "failed";
    updated.resolvedAt = Date.now();
    resolved = true;
    reason = "exhausted";
  }

  await extendedDb.update({ id: action.id } as Q, updated);

  if (resolved) {
    await fireResolve(payloadFor(updated));
    if (updated.contestId) {
      await autoAbandonSibling(updated);
    }
  }

  return { action: updated, resolved, reason };
}

function payloadFor(a: ExtendedAction): ExtendedResolvePayload {
  return {
    id: a.id,
    ownerId: a.ownerId,
    status: a.status,
    accumulated: a.accumulated,
    target: a.target,
    attempts: a.attempts,
    tag: a.tag,
  };
}

/** When one half of a contested pair resolves, abandon its sibling. */
async function autoAbandonSibling(winner: ExtendedAction): Promise<void> {
  if (!winner.contestId) return;
  const pair = await extendedDb.find({ contestId: winner.contestId } as Q);
  for (const a of pair) {
    if (a.id === winner.id) continue;
    if (a.status !== "active") continue;
    const next: ExtendedAction = {
      ...a,
      status: "abandoned",
      resolvedAt: Date.now(),
    };
    await extendedDb.update({ id: a.id } as Q, next);
    await fireResolve(payloadFor(next));
  }
}

/** Owner or staff abandon. Returns null if id unknown. */
export async function abandonExtendedAction(id: string): Promise<ExtendedAction | null> {
  const a = await getExtendedAction(id);
  if (!a) return null;
  if (a.status !== "active") return a;
  const next: ExtendedAction = { ...a, status: "abandoned", resolvedAt: Date.now() };
  await extendedDb.update({ id } as Q, next);
  await fireResolve(payloadFor(next));
  return next;
}

/** Staff-only force-success. */
export async function finishExtendedAction(id: string): Promise<ExtendedAction | null> {
  const a = await getExtendedAction(id);
  if (!a) return null;
  if (a.status !== "active") return a;
  const next: ExtendedAction = {
    ...a,
    status: "succeeded",
    accumulated: Math.max(a.accumulated, a.target),
    resolvedAt: Date.now(),
  };
  await extendedDb.update({ id } as Q, next);
  await fireResolve(payloadFor(next));
  if (next.contestId) await autoAbandonSibling(next);
  return next;
}

/** Link two actions into a contested pair. Returns true on success. */
export async function linkContest(idA: string, idB: string): Promise<boolean> {
  if (!idA || !idB || idA === idB) return false;
  const [a, b] = await Promise.all([getExtendedAction(idA), getExtendedAction(idB)]);
  if (!a || !b) return false;
  if (a.status !== "active" || b.status !== "active") return false;
  const contestId = `contest-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  await extendedDb.update({ id: idA } as Q, { ...a, contestId });
  await extendedDb.update({ id: idB } as Q, { ...b, contestId });
  return true;
}

// ---------------------------------------------------------------------------
// Penalty calculation
// ---------------------------------------------------------------------------

/**
 * Compute the modifier applied to the NEXT attempt:
 *   - dramatic-failure penalty from the previous roll (lastRollPenalty)
 *   - cumulative penalty: subtracts the number of attempts already made
 */
export function nextAttemptPenalty(action: ExtendedAction): number {
  let p = action.lastRollPenalty;
  if (action.cumulativePenalty) {
    p -= action.attempts;
  }
  return p;
}
