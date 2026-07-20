/**
 * System ports — game plugins implement these; combat never imports
 * CofD/D&D/etc. internals.
 */
import type { Encounter, Participant, ReactionPosture } from "./types.ts";

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
}

export type CombatAction =
  | { type: "attack"; targetId: string }
  | { type: "move"; note?: string }
  | { type: "reload" }
  | { type: "flee" }
  | { type: "posture"; posture: ReactionPosture }
  | { type: "wait" }
  | { type: "custom"; name: string; args?: unknown };

export interface CombatActionCtx {
  encounter: Encounter;
  actor: CombatActorView;
  participant: Participant;
}

export interface CombatActionResult {
  ok: boolean;
  message?: string;
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
