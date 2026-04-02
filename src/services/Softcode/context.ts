import type { IDBObj } from "../../@types/UrsamuSDK.ts";

// ── DbAccessor ────────────────────────────────────────────────────────────
// Thin async interface used by stdlib/object.ts to reach the database without
// importing Deno-native services directly into the worker context.
// The worker sends postMessage requests; the main thread fulfils them.

export interface DbAccessor {
  /** Look up an object by its raw id string. */
  queryById(id: string): Promise<IDBObj | null>;
  /** Find a connected player by exact name (case-insensitive). */
  queryByName(name: string): Promise<IDBObj | null>;
  /** Return all objects whose location === locationId. */
  lcon(locationId: string): Promise<IDBObj[]>;
  /** Return all currently-connected player objects. */
  lwho(): Promise<IDBObj[]>;
  /** Return the names of all attributes set on an object. */
  lattr(objId: string): Promise<string[]>;
  /** Get the evaluated string value of a named attribute (walks parent chain). */
  getAttribute(obj: IDBObj, attrName: string): Promise<string | null>;
  /** Resolve a global tag name to an object id, or null if unregistered. */
  getTagById(tagName: string): Promise<string | null>;
  /** Resolve a personal (ltag) tag name for a specific player, or null. */
  getPlayerTagById(actorId: string, tagName: string): Promise<string | null>;
  /** Search objects by type/flag/owner/attr pattern. Returns list of "#id" dbrefs. */
  lsearch(opts: {
    type?:    "PLAYER" | "ROOM" | "EXIT" | "THING";
    owner?:   string;
    flags?:   string;
    attr?:    string;
    attrVal?: string;
  }): Promise<string[]>;
  /** Return all objects whose parent === parentId. */
  children(parentId: string): Promise<IDBObj[]>;
  /** Return space-separated list of all channel names. */
  lchannels(): Promise<string>;
  /** Return space-separated list of channels player is subscribed to. */
  channelsFor(playerId: string): Promise<string>;
  /** Return unread mail count for a player. */
  mailCount(playerId: string): Promise<number>;
  /** Return number of pending queue entries for an executor. */
  queueLength(executorId: string): Promise<number>;
  /** Return seconds since last activity for a connected player. */
  getIdleSecs(playerId: string): Promise<number>;
  /**
   * Return seconds since the player connected.
   * Optional — if not provided, conn() returns 0 for connected players.
   */
  getConnSecs?: (playerId: string) => Promise<number>;
  /**
   * Look up a user-defined function body registered via @function.
   * Returns the softcode string, or null if no such function exists.
   */
  getUserFn(name: string): Promise<string | null>;
}

// ── OutputAccessor ────────────────────────────────────────────────────────
// Side-effect interface for pemit/remit/emit/oemit.
// The worker posts these as "send" / "broadcast" messages.

export interface OutputAccessor {
  /** Send a message to a specific socket (by object id). */
  send(message: string, targetId?: string): void;
  /** Broadcast to everyone in a room, optionally excluding one object. */
  roomBroadcast(message: string, roomId: string, excludeId?: string): void;
  /** Broadcast to all connected players. */
  broadcast(message: string): void;
}

// ── EvalContext ───────────────────────────────────────────────────────────
// Carries all per-evaluation state through the recursive evaluator.
// One instance is created per top-level runSoftcode() call and threaded
// through every recursive u() / ulocal() / iter() call.

export interface EvalContext {
  /**
   * The enactor — the player (or object) whose action triggered this chain.
   * Substitution: %#  (dbref)   %N  (name)
   */
  actor: IDBObj;

  /**
   * The executor — the object whose attribute is currently running.
   * Substitution: %!  (dbref)
   */
  executor: IDBObj;

  /**
   * The caller — the object that invoked u() to reach this attribute,
   * or null if this is the top-level call.
   * Substitution: %@  (dbref)
   */
  caller: IDBObj | null;

  /**
   * Positional arguments passed via @trigger or u().
   * %0 = args[0], %1 = args[1], …, %9 = args[9].
   */
  args: string[];

  /**
   * Named registers — %q0–%q9 and %qa–%qz.
   * Key is the single character after "q" (e.g. "0", "a", "z").
   * ulocal() snapshots and restores this map around sub-calls.
   */
  registers: Map<string, string>;

  /**
   * Iteration stack for nested iter()/parse() calls.
   * ## = iterStack[top].item,  #@ = iterStack[top].pos (1-based).
   */
  iterStack: Array<{ item: string; pos: number }>;

  /**
   * Current u()/ulocal() recursion depth.
   * Evaluation is rejected (returns "#-1 TOO DEEP") at depth >= 20.
   */
  depth: number;

  /**
   * Unix timestamp (ms) at which this evaluation must terminate.
   * Set to Date.now() + 100 at the top of runSoftcode().
   */
  deadline: number;

  /** Async DB gateway — injected by the worker before evaluation begins. */
  db: DbAccessor;

  /** Side-effect output gateway — injected by the worker. */
  output: OutputAccessor;
}

// ── helpers ───────────────────────────────────────────────────────────────

/** Returns true when the evaluation deadline has passed. */
export function isTimedOut(ctx: EvalContext): boolean {
  return Date.now() >= ctx.deadline;
}

/** Returns true when the recursion depth limit has been reached. */
export function isTooDeep(ctx: EvalContext): boolean {
  return ctx.depth >= 50;
}

/** Snapshot the register map for ulocal() save/restore. */
export function snapshotRegisters(ctx: EvalContext): Map<string, string> {
  return new Map(ctx.registers);
}

/** Restore a previously snapshotted register map. */
export function restoreRegisters(ctx: EvalContext, snapshot: Map<string, string>): void {
  ctx.registers.clear();
  for (const [k, v] of snapshot) ctx.registers.set(k, v);
}
