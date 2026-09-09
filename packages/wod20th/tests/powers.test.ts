// tests/powers.test.ts -- Power tables, opposed resists, claws.
import { assert, assertEquals } from "@std/assert";
import {
  getPower,
  matchPower,
  powersKnown,
  discDots,
  ACTIVE_POWERS,
} from "../splats/vtm/data/powers.ts";
import { useDisciplinePower } from "../core/disciplineUse.ts";
import { resolveAttack } from "../core/combat.ts";
import { evaluateRoll, DEFAULT_DIFFICULTY } from "../core/dice.ts";
import { initTrack } from "../core/health.ts";
import type { IWoDChar } from "../core/types.ts";
import "../splats/vtm/index.ts";

function mk(over: Partial<IWoDChar> = {}): IWoDChar {
  const now = Date.now();
  return {
    id: "v1",
    playerId: "p1",
    splat: "vtm",
    status: "approved",
    chargenStep: 6,
    concept: "x",
    attributePriority: ["", "", ""],
    attributes: {
      Strength: 2,
      Dexterity: 2,
      Stamina: 1,
      Charisma: 2,
      Manipulation: 2,
      Appearance: 1,
      Perception: 1,
      Intelligence: 1,
      Wits: 2,
    },
    attributeSpecialties: {},
    abilityPriority: ["", "", ""],
    abilities: { Brawl: 2, Intimidation: 2, Empathy: 1 },
    abilitySpecialties: {},
    backgrounds: {},
    willpower: 5,
    freebiesRemaining: 0,
    freebiesLog: [],
    xpTotal: 0,
    xpSpent: 0,
    notes: [],
    staffNotes: "",
    statLog: [],
    createdAt: now,
    updatedAt: now,
    clan: "brujah",
    generation: 12,
    bloodMax: 11,
    bloodPool: 10,
    bloodPerTurn: 2,
    disciplines: {
      Presence: 3,
      Dominate: 3,
      Protean: 2,
      Celerity: 1,
    },
    virtues: { Conscience: 3, "Self-Control": 3, Courage: 3 },
    humanity: 6,
    healthTrack: initTrack(),
    ...over,
  };
}

Deno.test("power catalog has opposed Dominate + clan uniques", () => {
  assert(getPower("command")?.needsTarget);
  assert(getPower("command")?.resist === "willpower");
  assert(getPower("feral-claws"));
  assert(getPower("silence-of-death"));
  assert(getPower("thaumaturgy-taste"));
  assert(ACTIVE_POWERS.length >= 20);
});

Deno.test("matchPower splits target rest", () => {
  const m = matchPower("Command Alice");
  assert(m);
  assertEquals(m.power.slug, "command");
  assertEquals(m.rest, "Alice");
});

Deno.test("powersKnown filters by dots", () => {
  const known = powersKnown({ Presence: 1, Dominate: 2 });
  assert(known.some((p) => p.slug === "awe"));
  assert(known.some((p) => p.slug === "mesmerize"));
  assert(!known.some((p) => p.slug === "entrancement"));
});

Deno.test("Command opposed: attacker wins", () => {
  const a = mk({ bloodPool: 5 });
  const d = mk({ id: "def", willpower: 2 });
  let i = 0;
  const rolls = [
    [10, 10, 10, 10, 10], // attack hits hard
    [2, 2], // WP fail
  ];
  const rng = (pool: number, diff = 6) => {
    const dice = rolls[i++] ?? [2];
    return evaluateRoll(dice.slice(0, pool), diff, false);
  };
  const r = useDisciplinePower(a, "Command Alice", {
    target: d,
    targetName: "Alice",
    rng,
  });
  assert(r.ok);
  assertEquals(r.opposedWon, true);
  assert(r.resistLine);
});

Deno.test("Command opposed: target resists", () => {
  const a = mk({ bloodPool: 5 });
  const d = mk({ id: "def", willpower: 8 });
  let i = 0;
  const rolls = [
    [8, 2, 2, 2, 2], // 1 success
    [10, 10, 10, 10, 10, 10, 10, 10], // WP many
  ];
  const rng = (pool: number, diff = 6) => {
    const dice = rolls[i++] ?? [2];
    return evaluateRoll(dice.slice(0, Math.min(pool, dice.length)), diff, false);
  };
  const r = useDisciplinePower(a, "command", {
    target: d,
    targetName: "Bob",
    rng,
  });
  assert(r.ok);
  assertEquals(r.opposedWon, false);
});

Deno.test("Feral Claws toggle + combat agg", () => {
  const a = mk({ bloodPool: 5, bloodPerTurn: 2 });
  const on = useDisciplinePower(a, "feral-claws");
  assert(on.ok);
  assertEquals(a.feralWeapons, true);
  assertEquals(a.bloodPool, 4);

  const d = mk({ id: "def2", attributes: { Stamina: 0 } });
  const res = resolveAttack(a, d, {
    noDefense: true,
    roller: (_p, diff = DEFAULT_DIFFICULTY) =>
      evaluateRoll([8, 9, 8, 9, 8, 9], diff, false),
  });
  assertEquals(res.damageType, "A");

  const off = useDisciplinePower(a, "feral-claws");
  assert(off.ok);
  assertEquals(a.feralWeapons, undefined);
});

Deno.test("needs target without name returns usage", () => {
  const a = mk();
  const r = useDisciplinePower(a, "Command");
  assertEquals(r.ok, false);
  assert(/Usage:/i.test(r.message));
});

Deno.test("discDots case-insensitive", () => {
  assertEquals(discDots({ dominate: 2 }, "Dominate"), 2);
});
