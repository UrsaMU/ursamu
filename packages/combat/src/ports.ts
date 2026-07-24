/**
 * System ports — game plugins implement these; combat never imports
 * CofD/D&D/CPR/etc. internals.
 */
import type {
  CombatMeta,
  Encounter,
  Participant,
  ReactionPosture,
} from "./types.ts";

/** Normalized actor snapshot for AI + walker (no sheet types). */
export interface CombatActorView {
  id: string;
  name: string;
  kind: "pc" | "npc";
  isOut: boolean;
  /** 0..1 remaining vitality (for AI health conditions). */
  healthFrac: number;
  /** Strategy / brain key, e.g. beshilu-swarmer | manual | llm. */
  aiKey?: string;
  aiState?: Record<string, unknown>;
  threat?: Record<string, number>;
  /** Soft tags for AI: "flying", "in_cover", "mortally", … */
  tags?: string[];
  /** Named resources: ammo, luck, glamour, … */
  resources?: Record<string, number>;
  /** Soft faction label (mirrors participant.side when set). */
  side?: string;
  /** Host-only bag. */
  meta?: CombatMeta;
}

/**
 * Shared optional fields on every action.
 * Hosts use `mode` / `args` for system-specific variants
 * (aimed, auto, called/head, grapple/pin, …).
 */
export interface CombatActionBase {
  /** Host mode string (e.g. "aimed", "auto", "melee"). */
  mode?: string;
  /** Free-form host payload (location, rangeBand, …). */
  args?: unknown;
  /**
   * Hint: does this action consume the turn?
   * Walker still prefers CombatActionResult.endedTurn.
   */
  endsTurn?: boolean;
  /**
   * Optional narration (ai-gm pose, brain color). Walker
   * broadcasts this before the mechanical result line.
   */
  flavor?: string;
}

/**
 * System-agnostic combat action.
 * Back-compat: `{ type: "attack", targetId }` still valid.
 */
export type CombatAction =
  | ({
    type: "attack";
    targetId: string;
    weaponId?: string;
  } & CombatActionBase)
  | ({
    type: "move";
    note?: string;
    destinationId?: string;
  } & CombatActionBase)
  | ({ type: "reload"; weaponId?: string } & CombatActionBase)
  | ({ type: "flee"; note?: string } & CombatActionBase)
  | ({
    type: "posture";
    posture: ReactionPosture;
  } & CombatActionBase)
  | ({ type: "wait"; note?: string } & CombatActionBase)
  | ({ type: "defend" } & CombatActionBase)
  | ({ type: "aim"; targetId?: string } & CombatActionBase)
  | ({ type: "hold" } & CombatActionBase)
  | ({ type: "delay" } & CombatActionBase)
  | ({
    type: "use";
    itemId?: string;
    abilityId?: string;
    targetId?: string;
  } & CombatActionBase)
  | ({ type: "custom"; name: string } & CombatActionBase);

export interface CombatActionCtx {
  encounter: Encounter;
  actor: CombatActorView;
  participant: Participant;
}

/**
 * Result of ports.executeAction (and engine-handled actions).
 * Walker applies threat / log / out flags / endedTurn.
 */
export interface CombatActionResult {
  ok: boolean;
  message?: string;
  /**
   * If false, walker does **not** call advanceTurn after this
   * action (default true).
   */
  endedTurn?: boolean;
  /** Appended to encounter.log by the walker. */
  logLine?: string;
  /** Damage dealt (feeds threat AI when targetId known). */
  damageApplied?: number;
  /** Target for threat / targetOut (defaults to attack target). */
  targetId?: string;
  /** Mark target participant isOut. */
  targetOut?: boolean;
  /** Mark acting participant isOut. */
  actorOut?: boolean;
  /** Add to target.threat[actorId] (or absolute deltas). */
  threatDelta?: Record<string, number>;
  /** Merge into acting participant. */
  actorPatch?: Partial<Participant>;
  /** Merge into target participant. */
  targetPatch?: Partial<Participant>;
  /** Host-only result bag. */
  meta?: CombatMeta;
}

/**
 * Host system adapter. Register via registerCombatPorts() or pass
 * per-call into advanceTurnSmart().
 */
export interface CombatPorts {
  loadActor(id: string): Promise<CombatActorView | null>;

  executeAction(
    actorId: string,
    action: CombatAction,
    ctx: CombatActionCtx,
  ): Promise<CombatActionResult>;

  broadcast(roomId: string, msg: string): void;

  /**
   * Optional: legal actions for AI / UI this turn.
   * Engine does not require it; brains may call it later.
   */
  listActions?(
    ctx: CombatActionCtx,
  ): Promise<CombatAction[]> | CombatAction[];

  /**
   * System initiative formula for one actor.
   * Engine sorts/activates; host owns dice + stats.
   * If omitted, activateEncounter uses 0.
   */
  rollInitiative?(actorId: string): Promise<number>;

  /** Optional: called when all NPCs are out. */
  onResolved?(
    enc: Encounter,
  ): Promise<Encounter | null> | Encounter | null;

  /**
   * Optional: after each NPC action (sync isOut flags, etc.).
   * Receives the latest encounter id.
   */
  afterAction?(
    encounterId: string,
    enc: Encounter,
  ): Promise<void> | void;
}

let _ports: CombatPorts | null = null;

export function registerCombatPorts(ports: CombatPorts): void {
  _ports = ports;
}

export function unregisterCombatPorts(): void {
  _ports = null;
}

export function getCombatPorts(): CombatPorts | null {
  return _ports;
}

/** Throw if ports missing — walker entry points. */
export function requireCombatPorts(): CombatPorts {
  if (!_ports) {
    throw new Error(
      "[@ursamu/combat] No CombatPorts registered. " +
        "Call registerCombatPorts() from your game system plugin, " +
        "or pass ports into advanceTurnSmart().",
    );
  }
  return _ports;
}

/** True when action type typically needs a targetId. */
export function actionNeedsTarget(action: CombatAction): boolean {
  if (action.type === "attack") return true;
  if (action.type === "use" && action.targetId) return true;
  if (action.type === "aim" && action.targetId) return true;
  return false;
}

/** Default target id from an action, if any. */
export function actionTargetId(
  action: CombatAction,
): string | undefined {
  if (action.type === "attack") return action.targetId;
  if (action.type === "use") return action.targetId;
  if (action.type === "aim") return action.targetId;
  return undefined;
}
