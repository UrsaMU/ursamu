import {
  assertEquals,
  assertExists,
  assertStringIncludes,
} from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import type { IDBObj } from "@ursamu/ursamu";
import {
  AI_STRATEGY_ERRORS,
  aiStrategyKeys,
  evaluateStrategy,
  getAiStrategy,
  getArchetype,
} from "../src/combat/ai/index.ts";
import type { Encounter, Participant } from "../src/combat/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function part(
  id: string,
  kind: "pc" | "npc",
  extra: Partial<Participant> = {},
): Participant {
  return {
    actorId: id,
    name: id,
    kind,
    initiative: 10,
    isOut: false,
    ...extra,
  } as Participant;
}

function actor(
  id: string,
  healthFrac = 1,
): IDBObj {
  const max = 8; // size 5 + sta 3
  const taken = Math.round((1 - healthFrac) * max);
  return {
    id,
    name: id,
    flags: new Set(["npc", "thing"]),
    location: "r1",
    contents: [],
    state: {
      cofd: {
        attributes: { stamina: 3 },
        advantages: { size: 5 },
        health: {
          bashing: taken,
          lethal: 0,
          aggravated: 0,
        },
      },
    },
  } as unknown as IDBObj;
}

function enc(parts: Participant[]): Encounter {
  return {
    id: "e1",
    roomId: "r1",
    participants: parts,
    currentIndex: 0,
    round: 1,
    terrain: [],
  } as unknown as Encounter;
}

describe("JSON AI strategies", OPTS, () => {
  it("loads without errors and includes the three hosts", () => {
    assertEquals(
      AI_STRATEGY_ERRORS,
      [],
      AI_STRATEGY_ERRORS.map((e) => `${e.file}: ${e.message}`)
        .join("; "),
    );
    const keys = aiStrategyKeys().join(",");
    assertStringIncludes(keys, "beshilu-swarmer");
    assertStringIncludes(keys, "azlu-stalker");
    assertStringIncludes(keys, "spirit-ridden-feral");
  });

  it("beshilu flees below 25% health", () => {
    const s = getAiStrategy("beshilu-swarmer")!;
    const self = part("npc1", "npc");
    // remaining fraction must be strictly < 0.25
    const selfActor = actor("npc1", 0.1);
    const d = evaluateStrategy(
      s,
      {
        self,
        enc: enc([self, part("pc1", "pc")]),
        selfActor,
        others: [part("pc1", "pc")],
      },
      () => 0,
    );
    assertEquals(d.action, "flee");
  });

  it("azlu holds ambush when unrevealed", () => {
    const s = getAiStrategy("azlu-stalker")!;
    const self = part("npc1", "npc", {
      aiState: { revealed: false },
      threat: {},
    });
    const d = evaluateStrategy(
      s,
      {
        self,
        enc: enc([self, part("pc1", "pc")]),
        selfActor: actor("npc1", 1),
        others: [part("pc1", "pc")],
      },
      () => 0,
    );
    assertEquals(d.action, "posture");
    assertEquals(d.posture?.type, "ambush");
  });

  it("weighted pick among same priority", () => {
    const strategy = {
      slug: "test-weights",
      name: "Test",
      rules: [
        {
          id: "a",
          priority: 10,
          weight: 1,
          when: {},
          then: { action: "wait" as const },
          reason: "a",
        },
        {
          id: "b",
          priority: 10,
          weight: 99,
          when: {},
          then: { action: "flee" as const },
          reason: "b",
        },
      ],
    };
    // rng near 1 → second weight wins
    const d = evaluateStrategy(strategy, {
      self: part("n", "npc"),
      enc: enc([part("n", "npc")]),
      selfActor: actor("n"),
      others: [],
    }, () => 0.99);
    assertEquals(d.action, "flee");
    assertEquals(d.reason, "b");
  });

  it("getArchetype returns a callable from JSON", () => {
    const fn = getArchetype("beshilu-swarmer");
    assertExists(fn);
    const self = part("npc1", "npc");
    const d = fn!({
      self,
      enc: enc([self, part("pc1", "pc")]),
      selfActor: actor("npc1", 1),
      others: [part("pc1", "pc")],
    });
    assertEquals(d.action, "attack");
  });

  it("unknown strategy returns null", () => {
    assertEquals(getArchetype("not-a-real-ai"), null);
  });
});
