/**
 * Production-path tests for NPC AI modes (JSON strategies).
 *
 * Walker resolves sheet.npc.aiArchetype → getArchetype() →
 * evaluateStrategy(). These tests exercise that path for every
 * shipped mode: beshilu-swarmer, azlu-stalker, spirit-ridden-feral.
 */
import {
  assertEquals,
  assertExists,
  assertMatch,
} from "@std/assert";
import type { IDBObj } from "@ursamu/ursamu";
import {
  AI_STRATEGY_ERRORS,
  aiStrategyKeys,
  evaluateStrategy,
  getAiStrategy,
  getArchetype,
  listArchetypes,
} from "../../src/combat/ai/index.ts";
import type { AiStrategy } from "../../src/combat/ai/index.ts";
import type {
  Encounter,
  Participant,
} from "../../src/combat/types.ts";

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
    isOut: false,
    ...extra,
  } as Participant;
}

/** healthFrac 1 = full; 0 = empty. size 5 + sta 3 = max 8. */
function actor(id: string, healthFrac = 1): IDBObj {
  const max = 8;
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

function decide(
  key: string,
  self: Participant,
  others: Participant[],
  selfActor: IDBObj,
  rng: () => number = RNG0,
) {
  const fn = getArchetype(key);
  assertExists(fn, `missing archetype ${key}`);
  const all = [self, ...others];
  return fn!({
    self,
    enc: enc(all),
    selfActor,
    others,
    // Test hook for weakest-target structure fractions.
    // deno-lint-ignore no-explicit-any
    ...({ _actors: new Map(
      all.map((p) => [
        p.actorId,
        p.actorId === self.actorId
          ? selfActor
          : actor(p.actorId, 1),
      ]),
    ) } as any),
  });
}

// ── Catalog ──────────────────────────────────────────────────────────────

Deno.test("AI catalog: loads all three modes with no errors", OPTS, () => {
  assertEquals(
    AI_STRATEGY_ERRORS,
    [],
    AI_STRATEGY_ERRORS.map((e) => `${e.file}: ${e.message}`)
      .join("; "),
  );
  const keys = aiStrategyKeys();
  for (const k of [
    "beshilu-swarmer",
    "azlu-stalker",
    "spirit-ridden-feral",
  ]) {
    assertEquals(keys.includes(k), true, `missing ${k}`);
    assertExists(getAiStrategy(k));
    assertExists(getArchetype(k));
  }
  assertEquals(listArchetypes().sort().join(","), keys.join(","));
});

Deno.test(
  "AI catalog: manual / off / none opt out of AI",
  OPTS,
  () => {
    for (const k of ["manual", "off", "none", "MANUAL", ""]) {
      assertEquals(getArchetype(k), null, k);
    }
  },
);

Deno.test(
  "AI catalog: unknown key returns null (walker → manual)",
  OPTS,
  () => {
    assertEquals(getArchetype("not-real-mode"), null);
  },
);

Deno.test(
  "AI catalog: keys are case-insensitive",
  OPTS,
  () => {
    assertExists(getArchetype("Beshilu-Swarmer"));
    assertExists(getArchetype(" AZLU-STALKER "));
  },
);

// ── Beshilu swarmer ──────────────────────────────────────────────────────

Deno.test("beshilu: flees when structure < 25%", OPTS, () => {
  const self = part("n1", "npc");
  const d = decide(
    "beshilu-swarmer",
    self,
    [part("p1", "pc")],
    actor("n1", 0.1),
  );
  assertEquals(d.action, "flee");
  assertMatch(d.reason, /flee|25%/i);
});

Deno.test(
  "beshilu: pack revenge targets highest threat",
  OPTS,
  () => {
    const self = part("n1", "npc", {
      threat: { p1: 10, p2: 200 },
    });
    const mate = part("n2", "npc", { isOut: true });
    const p1 = part("p1", "pc");
    const p2 = part("p2", "pc");
    const d = decide(
      "beshilu-swarmer",
      self,
      [mate, p1, p2],
      actor("n1", 1),
    );
    assertEquals(d.action, "attack");
    assertEquals(d.targetId, "p2");
    assertMatch(d.reason, /revenge|pack/i);
  },
);

Deno.test(
  "beshilu: gang-up when a living pack-mate exists",
  OPTS,
  () => {
    const self = part("n1", "npc");
    const mate = part("n2", "npc");
    const pc = part("p1", "pc");
    const d = decide(
      "beshilu-swarmer",
      self,
      [mate, pc],
      actor("n1", 1),
    );
    assertEquals(d.action, "attack");
    assertEquals(d.targetId, "p1");
    assertMatch(d.reason, /gang/i);
  },
);

Deno.test(
  "beshilu: solo picks weakest PC via structure",
  OPTS,
  () => {
    const self = part("n1", "npc");
    const pStrong = part("pStrong", "pc");
    const pWeak = part("pWeak", "pc");
    const selfActor = actor("n1", 1);
    const actors = new Map<string, IDBObj>([
      ["n1", selfActor],
      ["pStrong", actor("pStrong", 1.0)],
      ["pWeak", actor("pWeak", 0.3)],
    ]);
    const s = getAiStrategy("beshilu-swarmer")!;
    const d = evaluateStrategy(
      s,
      {
        self,
        enc: enc([self, pStrong, pWeak]),
        selfActor,
        others: [pStrong, pWeak],
        // deno-lint-ignore no-explicit-any
        ...({ _actors: actors } as any),
      },
      RNG0,
    );
    assertEquals(d.action, "attack");
    assertEquals(d.targetId, "pWeak");
    assertMatch(d.reason, /weak/i);
  },
);

Deno.test("beshilu: waits when no enemies", OPTS, () => {
  const self = part("n1", "npc");
  const d = decide("beshilu-swarmer", self, [], actor("n1", 1));
  assertEquals(d.action, "wait");
});

// ── Azlu stalker ─────────────────────────────────────────────────────────

Deno.test(
  "azlu: unrevealed + no damage → ambush posture",
  OPTS,
  () => {
    const self = part("n1", "npc", {
      aiState: { revealed: false },
      threat: {},
    });
    const d = decide(
      "azlu-stalker",
      self,
      [part("p1", "pc")],
      actor("n1", 1),
    );
    assertEquals(d.action, "posture");
    assertEquals(d.posture?.type, "ambush");
  },
);

Deno.test(
  "azlu: wounded under 50% seeks cover (move)",
  OPTS,
  () => {
    const self = part("n1", "npc", {
      aiState: { revealed: true },
    });
    const d = decide(
      "azlu-stalker",
      self,
      [part("p1", "pc")],
      actor("n1", 0.3),
    );
    assertEquals(d.action, "move");
    assertMatch(d.reason, /cover/i);
  },
);

Deno.test(
  "azlu: revealed + lone PC → isolated attack",
  OPTS,
  () => {
    const self = part("n1", "npc", {
      aiState: { revealed: true },
      threat: { p1: 1 },
    });
    const d = decide(
      "azlu-stalker",
      self,
      [part("p1", "pc")],
      actor("n1", 1),
    );
    assertEquals(d.action, "attack");
    assertEquals(d.targetId, "p1");
    assertMatch(d.reason, /isolated/i);
  },
);

Deno.test(
  "azlu: revealed + multi PC → closest (first)",
  OPTS,
  () => {
    const self = part("n1", "npc", {
      aiState: { revealed: true },
      threat: { p1: 1 },
    });
    const p1 = part("p1", "pc");
    const p2 = part("p2", "pc");
    const d = decide(
      "azlu-stalker",
      self,
      [p1, p2],
      actor("n1", 1),
    );
    assertEquals(d.action, "attack");
    assertEquals(d.targetId, "p1");
  },
);

// ── Spirit-ridden feral ──────────────────────────────────────────────────

Deno.test(
  "spirit-ridden: frenzied attacks highest threat",
  OPTS,
  () => {
    const self = part("n1", "npc", {
      aiState: { frenzied: true },
      threat: { p1: 5, p2: 90 },
    });
    const d = decide(
      "spirit-ridden-feral",
      self,
      [part("p1", "pc"), part("p2", "pc")],
      actor("n1", 1),
    );
    assertEquals(d.action, "attack");
    assertEquals(d.targetId, "p2");
    assertMatch(d.reason, /frenz/i);
  },
);

Deno.test(
  "spirit-ridden: damaged this round → highest threat",
  OPTS,
  () => {
    const self = part("n1", "npc", {
      aiState: { damagedThisRound: true },
      threat: { p1: 40 },
    });
    const d = decide(
      "spirit-ridden-feral",
      self,
      [part("p1", "pc")],
      actor("n1", 1),
    );
    assertEquals(d.action, "attack");
    assertEquals(d.targetId, "p1");
  },
);

Deno.test(
  "spirit-ridden: threat memory focuses top threat",
  OPTS,
  () => {
    const self = part("n1", "npc", {
      threat: { p1: 3, p2: 30 },
    });
    const d = decide(
      "spirit-ridden-feral",
      self,
      [part("p1", "pc"), part("p2", "pc")],
      actor("n1", 1),
    );
    assertEquals(d.action, "attack");
    assertEquals(d.targetId, "p2");
  },
);

Deno.test(
  "spirit-ridden: no threat → attacks first enemy",
  OPTS,
  () => {
    const self = part("n1", "npc");
    const d = decide(
      "spirit-ridden-feral",
      self,
      [part("p1", "pc")],
      actor("n1", 1),
    );
    assertEquals(d.action, "attack");
    assertEquals(d.targetId, "p1");
  },
);

Deno.test("spirit-ridden: waits with no enemies", OPTS, () => {
  const self = part("n1", "npc");
  const d = decide(
    "spirit-ridden-feral",
    self,
    [],
    actor("n1", 1),
  );
  assertEquals(d.action, "wait");
});

// ── Engine rules (priority / weight / fallback) ──────────────────────────

Deno.test(
  "engine: higher priority wins over lower matches",
  OPTS,
  () => {
    const strategy: AiStrategy = {
      slug: "prio-test",
      name: "Prio",
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
        selfActor: actor("n"),
        others: [part("p", "pc")],
      },
      RNG0,
    );
    assertEquals(d.action, "flee");
    assertEquals(d.reason, "high");
  },
);

Deno.test(
  "engine: fallback when no rule matches",
  OPTS,
  () => {
    const strategy: AiStrategy = {
      slug: "fb-test",
      name: "Fb",
      rules: [
        {
          id: "only-hurt",
          priority: 10,
          when: { selfHealthBelow: 0.1 },
          then: { action: "flee" },
        },
      ],
      fallback: { action: "wait" },
    };
    const self = part("n", "npc");
    const d = evaluateStrategy(
      strategy,
      {
        self,
        enc: enc([self]),
        selfActor: actor("n", 1),
        others: [],
      },
      RNG0,
    );
    assertEquals(d.action, "wait");
  },
);

Deno.test(
  "engine: ignores out PCs when picking targets",
  OPTS,
  () => {
    const self = part("n1", "npc");
    const down = part("pDown", "pc", { isOut: true });
    const live = part("pLive", "pc");
    const d = decide(
      "beshilu-swarmer",
      self,
      [down, live],
      actor("n1", 1),
    );
    assertEquals(d.action, "attack");
    assertEquals(d.targetId, "pLive");
  },
);
