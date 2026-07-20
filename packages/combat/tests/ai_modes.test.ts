/**
 * Production-path tests for NPC AI modes (JSON strategies).
 */
import {
  assertEquals,
  assertExists,
  assertMatch,
} from "@std/assert";
import {
  AI_STRATEGY_ERRORS,
  aiStrategyKeys,
  evaluateStrategy,
  getAiStrategy,
  getArchetype,
  listArchetypes,
} from "../src/ai/index.ts";
import type { AiStrategy } from "../src/ai/index.ts";
import type { CombatActorView } from "../src/ports.ts";
import type {
  Encounter,
  Participant,
} from "../src/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };
const RNG0 = () => 0;

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
    appliedDefense: 0,
    isDodging: false,
    isOut: false,
    ...extra,
  };
}

function view(
  id: string,
  healthFrac = 1,
  extra: Partial<CombatActorView> = {},
): CombatActorView {
  return {
    id,
    name: id,
    kind: "npc",
    isOut: false,
    healthFrac,
    aiKey: "beshilu-swarmer",
    ...extra,
  };
}

function enc(parts: Participant[]): Encounter {
  return {
    id: "e1",
    roomId: "r1",
    participants: parts,
    turnIdx: 0,
    round: 1,
    status: "active",
    createdAt: 0,
    terrain: [],
  };
}

function decide(
  key: string,
  self: Participant,
  others: Participant[],
  selfView: CombatActorView,
  views?: Map<string, CombatActorView>,
) {
  const fn = getArchetype(key);
  assertExists(fn, `missing archetype ${key}`);
  const all = [self, ...others];
  const vmap = views ?? new Map(
    all.map((p) => [
      p.actorId,
      p.actorId === self.actorId
        ? selfView
        : view(p.actorId, 1, { kind: p.kind ?? "pc" }),
    ]),
  );
  return fn!({
    self,
    enc: enc(all),
    selfView,
    others,
    views: vmap,
  });
}

Deno.test("AI catalog: loads three modes", OPTS, () => {
  assertEquals(AI_STRATEGY_ERRORS, []);
  const keys = aiStrategyKeys();
  for (const k of [
    "aggressive",
    "beshilu-swarmer",
    "azlu-stalker",
    "spirit-ridden-feral",
  ]) {
    assertEquals(keys.includes(k), true, k);
    assertExists(getArchetype(k));
  }
  assertEquals(listArchetypes().sort().join(","), keys.join(","));
});

Deno.test("AI catalog: manual opt-out", OPTS, () => {
  for (const k of ["manual", "off", "none", ""]) {
    assertEquals(getArchetype(k), null);
  }
});

Deno.test("beshilu: flees below 25% health", OPTS, () => {
  const self = part("n1", "npc");
  const d = decide(
    "beshilu-swarmer",
    self,
    [part("p1", "pc")],
    view("n1", 0.1),
  );
  assertEquals(d.action, "flee");
});

Deno.test("beshilu: pack revenge highest threat", OPTS, () => {
  const self = part("n1", "npc", {
    threat: { p1: 10, p2: 200 },
  });
  const d = decide(
    "beshilu-swarmer",
    self,
    [
      part("n2", "npc", { isOut: true }),
      part("p1", "pc"),
      part("p2", "pc"),
    ],
    view("n1", 1),
  );
  assertEquals(d.action, "attack");
  assertEquals(d.targetId, "p2");
});

Deno.test("beshilu: gang-up", OPTS, () => {
  const self = part("n1", "npc");
  const d = decide(
    "beshilu-swarmer",
    self,
    [part("n2", "npc"), part("p1", "pc")],
    view("n1", 1),
  );
  assertEquals(d.action, "attack");
  assertMatch(d.reason, /gang/i);
});

Deno.test("beshilu: weakest target", OPTS, () => {
  const self = part("n1", "npc");
  const pS = part("pS", "pc");
  const pW = part("pW", "pc");
  const views = new Map<string, CombatActorView>([
    ["n1", view("n1", 1)],
    ["pS", view("pS", 1, { kind: "pc" })],
    ["pW", view("pW", 0.3, { kind: "pc" })],
  ]);
  const s = getAiStrategy("beshilu-swarmer")!;
  const d = evaluateStrategy(
    s,
    {
      self,
      enc: enc([self, pS, pW]),
      selfView: view("n1", 1),
      others: [pS, pW],
      views,
    },
    RNG0,
  );
  assertEquals(d.action, "attack");
  assertEquals(d.targetId, "pW");
});

Deno.test("azlu: ambush when unrevealed", OPTS, () => {
  const self = part("n1", "npc", {
    aiState: { revealed: false },
    threat: {},
  });
  const d = decide(
    "azlu-stalker",
    self,
    [part("p1", "pc")],
    view("n1", 1, { aiKey: "azlu-stalker" }),
  );
  assertEquals(d.action, "posture");
  assertEquals(d.posture?.type, "ambush");
});

Deno.test("azlu: seek cover when hurt", OPTS, () => {
  const self = part("n1", "npc", {
    aiState: { revealed: true },
  });
  const d = decide(
    "azlu-stalker",
    self,
    [part("p1", "pc")],
    view("n1", 0.3, { aiKey: "azlu-stalker" }),
  );
  assertEquals(d.action, "move");
});

Deno.test("spirit-ridden: frenzied highest threat", OPTS, () => {
  const self = part("n1", "npc", {
    aiState: { frenzied: true },
    threat: { p1: 5, p2: 90 },
  });
  const d = decide(
    "spirit-ridden-feral",
    self,
    [part("p1", "pc"), part("p2", "pc")],
    view("n1", 1, { aiKey: "spirit-ridden-feral" }),
  );
  assertEquals(d.action, "attack");
  assertEquals(d.targetId, "p2");
});

Deno.test("engine: priority band", OPTS, () => {
  const strategy: AiStrategy = {
    slug: "prio",
    name: "P",
    rules: [
      {
        id: "low",
        priority: 10,
        when: { hasEnemies: true },
        then: { action: "attack", target: "first" },
        reason: "low",
      },
      {
        id: "high",
        priority: 50,
        when: { hasEnemies: true },
        then: { action: "flee" },
        reason: "high",
      },
    ],
  };
  const self = part("n", "npc");
  const d = evaluateStrategy(
    strategy,
    {
      self,
      enc: enc([self, part("p", "pc")]),
      selfView: view("n"),
      others: [part("p", "pc")],
    },
    RNG0,
  );
  assertEquals(d.action, "flee");
  assertEquals(d.reason, "high");
});
