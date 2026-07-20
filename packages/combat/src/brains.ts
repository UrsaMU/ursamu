/**
 * Combat brains — decide what an NPC does on its turn.
 *
 * Pipeline:
 *   1. manual/off/none → null (ST control)
 *   2. combat:decide gameHook (optional ai-gm / plugins)
 *   3. registered brains in config order (default: registration order)
 *
 * First non-null action wins.
 */
import type { Encounter, Participant } from "./types.ts";
import type { CombatAction, CombatActorView } from "./ports.ts";
import { getArchetype } from "./ai/index.ts";
import type { AiDecision } from "./ai/index.ts";
import { getCombatConfig } from "./config.ts";

export interface BrainCtx {
  encounter: Encounter;
  self: Participant;
  selfView: CombatActorView;
  others: Participant[];
  views: Map<string, CombatActorView>;
}

/** Payload for combat:decide — listeners set handled + action. */
export interface CombatDecideHookCtx extends BrainCtx {
  handled: boolean;
  action: CombatAction | null;
}

export interface CombatBrain {
  /** Stable id: "json" | "ai-gm" | … */
  id: string;
  /**
   * Return an action, or null to fall through.
   * Only return wait when this brain owns the decision.
   */
  decide(
    ctx: BrainCtx,
  ): CombatAction | null | Promise<CombatAction | null>;
}

const _brains: CombatBrain[] = [];

/** Optional emitter injected so combat stays testable without core. */
type DecideEmitter = (
  ctx: CombatDecideHookCtx,
) => void | Promise<void>;

let _decideEmitter: DecideEmitter | null = null;

/**
 * Host wires gameHooks here once (combat plugin init or first use).
 * Tests can inject a fake emitter.
 */
export function setCombatDecideEmitter(
  fn: DecideEmitter | null,
): void {
  _decideEmitter = fn;
}

export function registerCombatBrain(brain: CombatBrain): void {
  const i = _brains.findIndex((b) => b.id === brain.id);
  if (i >= 0) _brains[i] = brain;
  else _brains.push(brain);
}

export function unregisterCombatBrain(id: string): void {
  const i = _brains.findIndex((b) => b.id === id);
  if (i >= 0) _brains.splice(i, 1);
}

export function listCombatBrains(): readonly CombatBrain[] {
  return _brains;
}

export function clearCombatBrains(): void {
  _brains.length = 0;
}

const MANUAL = new Set(["manual", "off", "none", ""]);

/** True when the ST controls this NPC (walker should halt). */
export function isManualAiKey(key: string | undefined): boolean {
  return MANUAL.has((key ?? "").toLowerCase().trim());
}

/** Keys that typically mean "use LLM / external brain", not JSON. */
const LLM_KEYS = new Set(["llm", "ai-gm", "aigm", "gm"]);

export function isLlmAiKey(key: string | undefined): boolean {
  return LLM_KEYS.has((key ?? "").toLowerCase().trim());
}

function decisionToAction(d: AiDecision): CombatAction {
  switch (d.action) {
    case "attack":
      return {
        type: "attack",
        targetId: d.targetId ?? "",
      };
    case "move":
      return { type: "move", note: d.reason };
    case "reload":
      return { type: "reload" };
    case "flee":
      return { type: "flee" };
    case "posture":
      return {
        type: "posture",
        posture: d.posture ?? { type: "guard" },
      };
    case "wait":
    default:
      return { type: "wait" };
  }
}

/**
 * Built-in JSON strategy brain. Skips llm/* keys so external brains
 * can handle them. Unknown strategy → null (halt / next brain).
 */
export const jsonStrategyBrain: CombatBrain = {
  id: "json",
  decide(ctx: BrainCtx): CombatAction | null {
    const key = (ctx.selfView.aiKey ?? "").toLowerCase().trim();
    if (isManualAiKey(key) || isLlmAiKey(key)) return null;
    const fn = getArchetype(key);
    if (!fn) return null;
    const d = fn({
      self: ctx.self,
      enc: ctx.encounter,
      selfView: ctx.selfView,
      others: ctx.others,
      views: ctx.views,
    });
    return decisionToAction(d);
  },
};

function orderedBrains(): CombatBrain[] {
  const cfg = getCombatConfig();
  if (cfg.brains.length === 0) return [..._brains];
  const out: CombatBrain[] = [];
  const seen = new Set<string>();
  for (const id of cfg.brains) {
    const b = _brains.find((x) => x.id === id);
    if (b && !seen.has(b.id)) {
      out.push(b);
      seen.add(b.id);
    }
  }
  // Append any registered brains not listed in config.
  for (const b of _brains) {
    if (!seen.has(b.id)) out.push(b);
  }
  return out;
}

async function runDecideHook(
  ctx: BrainCtx,
): Promise<CombatAction | null> {
  const cfg = getCombatConfig();
  if (!cfg.enableDecideHook || !_decideEmitter) return null;

  const hookCtx: CombatDecideHookCtx = {
    encounter: ctx.encounter,
    self: ctx.self,
    selfView: ctx.selfView,
    others: ctx.others,
    views: ctx.views,
    handled: false,
    action: null,
  };
  await _decideEmitter(hookCtx);
  if (hookCtx.handled) return hookCtx.action;
  return null;
}

/**
 * Run decide hook then brains. Returns null if none decide
 * (caller should halt for ST / treat as manual).
 */
export async function decideAction(
  ctx: BrainCtx,
): Promise<CombatAction | null> {
  if (isManualAiKey(ctx.selfView.aiKey)) return null;

  const fromHook = await runDecideHook(ctx);
  if (fromHook) return fromHook;

  for (const brain of orderedBrains()) {
    const action = await brain.decide(ctx);
    if (action) return action;
  }
  return null;
}
