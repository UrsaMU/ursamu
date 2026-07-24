import { assertEquals } from "@std/assert";
import {
  memoryEncounterStore,
  runAdapterSmoke,
} from "../src/adapter-kit.ts";
import {
  constrainToLegalActions,
  actionMatchesLegal,
} from "../src/brains.ts";
import { evaluateStrategy } from "../src/ai/evaluate.ts";
import type { AiStrategy } from "../src/ai/strategy_types.ts";
import type { EvalCtx } from "../src/ai/evaluate.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("adapter smoke kit passes default ports", OPTS, async () => {
  const result = await runAdapterSmoke({
    store: memoryEncounterStore(),
    label: "default",
  });
  if (!result.ok) {
    console.error(result.errors);
  }
  assertEquals(result.ok, true, result.errors.join("; "));
});

Deno.test("constrainToLegalActions filters illegal", OPTS, () => {
  const legal = [
    { type: "attack" as const, targetId: "pc1" },
    { type: "wait" as const },
  ];
  assertEquals(
    actionMatchesLegal(
      { type: "attack", targetId: "pc1" },
      legal,
    ),
    true,
  );
  const forced = constrainToLegalActions(
    { type: "flee" },
    legal,
  );
  assertEquals(forced?.type, "attack");
});

Deno.test("AI conditions: tags and resources", OPTS, () => {
  const strategy: AiStrategy = {
    slug: "tag-test",
    name: "Tag Test",
    rules: [
      {
        id: "crit-flee",
        priority: 100,
        when: { hasTags: ["critical"], resourceAtLeast: { ammo: 1 } },
        then: { action: "flee" },
      },
      {
        id: "default-atk",
        priority: 1,
        when: { hasEnemies: true },
        then: { action: "attack", target: "first" },
      },
    ],
    fallback: { action: "wait" },
  };

  const baseCtx = {
    self: {
      actorId: "n1",
      name: "N",
      initiative: 10,
      appliedDefense: 0,
      isDodging: false,
      isOut: false,
      kind: "npc" as const,
    },
    enc: {
      id: "e",
      roomId: "r",
      round: 1,
      turnIdx: 0,
      status: "active" as const,
      createdAt: 1,
      participants: [],
    },
    others: [
      {
        actorId: "p1",
        name: "P",
        initiative: 5,
        appliedDefense: 0,
        isDodging: false,
        isOut: false,
        kind: "pc" as const,
      },
    ],
  };

  const crit: EvalCtx = {
    ...baseCtx,
    selfView: {
      id: "n1",
      name: "N",
      kind: "npc",
      isOut: false,
      healthFrac: 0.1,
      tags: ["critical"],
      resources: { ammo: 5 },
    },
  };
  const d1 = evaluateStrategy(strategy, crit, () => 0);
  assertEquals(d1.action, "flee");

  const healthy: EvalCtx = {
    ...baseCtx,
    selfView: {
      id: "n1",
      name: "N",
      kind: "npc",
      isOut: false,
      healthFrac: 1,
      tags: [],
      resources: { ammo: 5 },
    },
  };
  const d2 = evaluateStrategy(strategy, healthy, () => 0);
  assertEquals(d2.action, "attack");
});
