import { assertEquals } from "@std/assert";
import {
  clearCombatBrains,
  decideAction,
  isLlmAiKey,
  isManualAiKey,
  jsonStrategyBrain,
  listCombatBrains,
  registerCombatBrain,
  setCombatDecideEmitter,
  unregisterCombatBrain,
  type BrainCtx,
  type CombatDecideHookCtx,
} from "../src/brains.ts";
import {
  resetCombatConfig,
  setCombatConfig,
} from "../src/config.ts";
import type { Participant } from "../src/types.ts";
import type { CombatActorView } from "../src/ports.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function ctx(
  aiKey: string,
  extra: Partial<BrainCtx> = {},
): BrainCtx {
  const self = {
    actorId: "n1",
    name: "n1",
    kind: "npc",
    initiative: 10,
    appliedDefense: 0,
    isDodging: false,
    isOut: false,
  } as Participant;
  const pc = {
    actorId: "p1",
    name: "p1",
    kind: "pc",
    initiative: 5,
    appliedDefense: 0,
    isDodging: false,
    isOut: false,
  } as Participant;
  const selfView: CombatActorView = {
    id: "n1",
    name: "n1",
    kind: "npc",
    isOut: false,
    healthFrac: 1,
    aiKey,
  };
  return {
    encounter: {
      id: "e",
      roomId: "r",
      round: 1,
      turnIdx: 0,
      participants: [self, pc],
      status: "active",
      createdAt: 0,
    },
    self,
    selfView,
    others: [pc],
    views: new Map([
      ["n1", selfView],
      [
        "p1",
        { ...selfView, id: "p1", kind: "pc", aiKey: undefined },
      ],
    ]),
    ...extra,
  };
}

function reset(): void {
  clearCombatBrains();
  setCombatDecideEmitter(null);
  resetCombatConfig();
}

Deno.test("isManualAiKey / isLlmAiKey", OPTS, () => {
  assertEquals(isManualAiKey("manual"), true);
  assertEquals(isManualAiKey("beshilu-swarmer"), false);
  assertEquals(isLlmAiKey("llm"), true);
  assertEquals(isLlmAiKey("ai-gm"), true);
  assertEquals(isLlmAiKey("beshilu-swarmer"), false);
});

Deno.test("json brain attacks with strategy key", OPTS, async () => {
  reset();
  registerCombatBrain(jsonStrategyBrain);
  const action = await decideAction(ctx("beshilu-swarmer"));
  assertEquals(action?.type, "attack");
  reset();
});

Deno.test("json brain skips llm keys", OPTS, async () => {
  reset();
  registerCombatBrain(jsonStrategyBrain);
  assertEquals(await decideAction(ctx("llm")), null);
  reset();
});

Deno.test("manual key yields null", OPTS, async () => {
  reset();
  registerCombatBrain(jsonStrategyBrain);
  assertEquals(await decideAction(ctx("manual")), null);
  reset();
});

Deno.test("brain order from config", OPTS, async () => {
  reset();
  registerCombatBrain({
    id: "alpha",
    decide: () => ({ type: "wait" }),
  });
  registerCombatBrain({
    id: "beta",
    decide: () => ({ type: "flee" }),
  });
  setCombatConfig({ brains: ["beta", "alpha"] });
  const action = await decideAction(ctx("beshilu-swarmer"));
  assertEquals(action?.type, "flee");
  reset();
});

Deno.test("combat:decide hook wins before brains", OPTS, async () => {
  reset();
  registerCombatBrain(jsonStrategyBrain);
  setCombatDecideEmitter(async (h: CombatDecideHookCtx) => {
    h.handled = true;
    h.action = {
      type: "attack",
      targetId: "p1",
    };
  });
  const action = await decideAction(ctx("beshilu-swarmer"));
  assertEquals(action?.type, "attack");
  assertEquals(
    action && "targetId" in action ? action.targetId : "",
    "p1",
  );
  reset();
});

Deno.test("hook can decline (handled false)", OPTS, async () => {
  reset();
  registerCombatBrain(jsonStrategyBrain);
  setCombatDecideEmitter(async (h) => {
    h.handled = false;
  });
  const action = await decideAction(ctx("beshilu-swarmer"));
  assertEquals(action?.type, "attack");
  reset();
});

Deno.test("listCombatBrains reflects registration", OPTS, () => {
  reset();
  registerCombatBrain(jsonStrategyBrain);
  assertEquals(listCombatBrains().map((b) => b.id), ["json"]);
  unregisterCombatBrain("json");
  assertEquals(listCombatBrains().length, 0);
  reset();
});
