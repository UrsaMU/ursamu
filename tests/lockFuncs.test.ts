import { assertEquals } from "jsr:@std/assert@^1";
import type { IDBObj } from "../src/@types/UrsamuSDK.ts";
import {
  callLockFunc,
  registerLockFunc,
} from "../src/utils/lockFuncs.ts";
import { evaluateLock } from "../src/utils/evaluateLock.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function mockPlayer(overrides: Partial<IDBObj> = {}): IDBObj {
  return {
    id: "lf_actor1",
    name: "Tester",
    flags: new Set(["player", "connected"]),
    state: {},
    location: "lf_room1",
    contents: [],
    ...overrides,
  };
}

// ── callLockFunc built-ins ──────────────────────────────────────────────────

Deno.test("flag(wizard) → true when enactor has wizard flag", OPTS, async () => {
  const enactor = mockPlayer({ flags: new Set(["player", "connected", "wizard"]) });
  const target = mockPlayer({ id: "lf_target1" });
  assertEquals(await callLockFunc("flag", enactor, target, ["wizard"]), true);
});

Deno.test("flag(wizard) → false when enactor lacks wizard flag", OPTS, async () => {
  const enactor = mockPlayer();
  const target = mockPlayer({ id: "lf_target1" });
  assertEquals(await callLockFunc("flag", enactor, target, ["wizard"]), false);
});

Deno.test("attr(tribe) 1-arg → true when state.tribe exists", OPTS, async () => {
  const enactor = mockPlayer({ state: { tribe: "glasswalker" } });
  const target = mockPlayer({ id: "lf_target1" });
  assertEquals(await callLockFunc("attr", enactor, target, ["tribe"]), true);
});

Deno.test("attr(tribe) 1-arg → false when state.tribe missing", OPTS, async () => {
  const enactor = mockPlayer({ state: {} });
  const target = mockPlayer({ id: "lf_target1" });
  assertEquals(await callLockFunc("attr", enactor, target, ["tribe"]), false);
});

Deno.test(
  "attr(tribe, glasswalker) → true when state.tribe === 'glasswalker'",
  OPTS,
  async () => {
    const enactor = mockPlayer({ state: { tribe: "glasswalker" } });
    const target = mockPlayer({ id: "lf_target1" });
    assertEquals(
      await callLockFunc("attr", enactor, target, ["tribe", "glasswalker"]),
      true,
    );
  },
);

Deno.test(
  "attr(tribe, glasswalker) → false when state.tribe !== 'glasswalker'",
  OPTS,
  async () => {
    const enactor = mockPlayer({ state: { tribe: "bonegnawer" } });
    const target = mockPlayer({ id: "lf_target1" });
    assertEquals(
      await callLockFunc("attr", enactor, target, ["tribe", "glasswalker"]),
      false,
    );
  },
);

Deno.test("is(#lf_actor1) → true when enactor.id matches", OPTS, async () => {
  const enactor = mockPlayer({ id: "lf_actor1" });
  const target = mockPlayer({ id: "lf_target1" });
  assertEquals(await callLockFunc("is", enactor, target, ["#lf_actor1"]), true);
});

Deno.test("is(#other) → false when enactor.id does not match", OPTS, async () => {
  const enactor = mockPlayer({ id: "lf_actor1" });
  const target = mockPlayer({ id: "lf_target1" });
  assertEquals(await callLockFunc("is", enactor, target, ["#other"]), false);
});

Deno.test("holds(#lf_item1) → true when contents includes id", OPTS, async () => {
  const item = mockPlayer({ id: "lf_item1", name: "Item" });
  const enactor = mockPlayer({ contents: [item] });
  const target = mockPlayer({ id: "lf_target1" });
  assertEquals(await callLockFunc("holds", enactor, target, ["#lf_item1"]), true);
});

Deno.test("holds(#lf_item1) → false when contents is empty", OPTS, async () => {
  const enactor = mockPlayer({ contents: [] });
  const target = mockPlayer({ id: "lf_target1" });
  assertEquals(await callLockFunc("holds", enactor, target, ["#lf_item1"]), false);
});

Deno.test("perm(admin) → true for admin-flagged enactor", OPTS, async () => {
  const enactor = mockPlayer({ flags: new Set(["player", "connected", "admin"]) });
  const target = mockPlayer({ id: "lf_target1" });
  assertEquals(await callLockFunc("perm", enactor, target, ["admin"]), true);
});

Deno.test("unknown func → false (fail-closed)", OPTS, async () => {
  const enactor = mockPlayer();
  const target = mockPlayer({ id: "lf_target1" });
  assertEquals(
    await callLockFunc("noSuchFunc_lf", enactor, target, []),
    false,
  );
});

Deno.test("func that throws → false (fail-closed)", OPTS, async () => {
  registerLockFunc("lf_throws", () => {
    throw new Error("boom");
  });
  const enactor = mockPlayer();
  const target = mockPlayer({ id: "lf_target1" });
  assertEquals(await callLockFunc("lf_throws", enactor, target, []), false);
});

// ── registerLockFunc (custom funcs) ────────────────────────────────────────

Deno.test("registered func returning true → evaluates true", OPTS, async () => {
  registerLockFunc("lf_alwaysTrue", () => true);
  const enactor = mockPlayer();
  const target = mockPlayer({ id: "lf_target1" });
  assertEquals(await callLockFunc("lf_alwaysTrue", enactor, target, []), true);
});

Deno.test("registered func returning false → evaluates false", OPTS, async () => {
  registerLockFunc("lf_alwaysFalse", () => false);
  const enactor = mockPlayer();
  const target = mockPlayer({ id: "lf_target1" });
  assertEquals(await callLockFunc("lf_alwaysFalse", enactor, target, []), false);
});

Deno.test("re-registering same name overwrites previous", OPTS, async () => {
  registerLockFunc("lf_overwrite", () => true);
  registerLockFunc("lf_overwrite", () => false);
  const enactor = mockPlayer();
  const target = mockPlayer({ id: "lf_target1" });
  assertEquals(await callLockFunc("lf_overwrite", enactor, target, []), false);
});

// ── evaluateLock integration ───────────────────────────────────────────────

Deno.test('evaluateLock "flag(wizard)" — evaluates correctly', OPTS, async () => {
  const withWiz = mockPlayer({ flags: new Set(["player", "connected", "wizard"]) });
  const without = mockPlayer();
  const target = mockPlayer({ id: "lf_target1" });
  assertEquals(await evaluateLock("flag(wizard)", withWiz, target), true);
  assertEquals(await evaluateLock("flag(wizard)", without, target), false);
});

Deno.test('evaluateLock "flag(wizard) || flag(admin)" — OR with ||', OPTS, async () => {
  const admin = mockPlayer({ flags: new Set(["player", "connected", "admin"]) });
  const plain = mockPlayer();
  const target = mockPlayer({ id: "lf_target1" });
  assertEquals(await evaluateLock("flag(wizard) || flag(admin)", admin, target), true);
  assertEquals(await evaluateLock("flag(wizard) || flag(admin)", plain, target), false);
});

Deno.test(
  'evaluateLock "flag(wizard) && flag(connected)" — AND with &&',
  OPTS,
  async () => {
    const wizConn = mockPlayer({
      flags: new Set(["player", "connected", "wizard"]),
    });
    const wizOnly = mockPlayer({
      flags: new Set(["player", "wizard"]),
    });
    const target = mockPlayer({ id: "lf_target1" });
    assertEquals(
      await evaluateLock("flag(wizard) && flag(connected)", wizConn, target),
      true,
    );
    assertEquals(
      await evaluateLock("flag(wizard) && flag(connected)", wizOnly, target),
      false,
    );
  },
);

Deno.test('evaluateLock "flag(wizard) | flag(admin)" — legacy | still works', OPTS, async () => {
  const admin = mockPlayer({ flags: new Set(["player", "connected", "admin"]) });
  const plain = mockPlayer();
  const target = mockPlayer({ id: "lf_target1" });
  assertEquals(await evaluateLock("flag(wizard) | flag(admin)", admin, target), true);
  assertEquals(await evaluateLock("flag(wizard) | flag(admin)", plain, target), false);
});

Deno.test(
  'evaluateLock "flag(wizard) & flag(connected)" — legacy & still works',
  OPTS,
  async () => {
    const wizConn = mockPlayer({
      flags: new Set(["player", "connected", "wizard"]),
    });
    const wizOnly = mockPlayer({ flags: new Set(["player", "wizard"]) });
    const target = mockPlayer({ id: "lf_target1" });
    assertEquals(
      await evaluateLock("flag(wizard) & flag(connected)", wizConn, target),
      true,
    );
    assertEquals(
      await evaluateLock("flag(wizard) & flag(connected)", wizOnly, target),
      false,
    );
  },
);

Deno.test('evaluateLock "!flag(wizard)" — NOT still works', OPTS, async () => {
  const withWiz = mockPlayer({ flags: new Set(["player", "connected", "wizard"]) });
  const without = mockPlayer();
  const target = mockPlayer({ id: "lf_target1" });
  assertEquals(await evaluateLock("!flag(wizard)", withWiz, target), false);
  assertEquals(await evaluateLock("!flag(wizard)", without, target), true);
});

Deno.test(
  'evaluateLock "mortal || !flag(wizard)" — mixed bare atom + lockfunc',
  OPTS,
  async () => {
    const mortal = mockPlayer({ flags: new Set(["player", "connected", "mortal"]) });
    const plain = mockPlayer();
    const withWiz = mockPlayer({ flags: new Set(["player", "connected", "wizard"]) });
    const target = mockPlayer({ id: "lf_target1" });
    // mortal flag present → true via bare atom
    assertEquals(await evaluateLock("mortal || !flag(wizard)", mortal, target), true);
    // no mortal, no wizard → true via !flag(wizard)
    assertEquals(await evaluateLock("mortal || !flag(wizard)", plain, target), true);
    // wizard present, no mortal flag → false (mortal=false, !wizard=false)
    assertEquals(
      await evaluateLock("mortal || !flag(wizard)", withWiz, target),
      false,
    );
  },
);

Deno.test(
  'evaluateLock "attr(tribe, glasswalker)" — attr 2-arg in full evaluator',
  OPTS,
  async () => {
    const matching = mockPlayer({ state: { tribe: "glasswalker" } });
    const notMatching = mockPlayer({ state: { tribe: "bonegnawer" } });
    const missing = mockPlayer({ state: {} });
    const target = mockPlayer({ id: "lf_target1" });
    assertEquals(
      await evaluateLock("attr(tribe, glasswalker)", matching, target),
      true,
    );
    assertEquals(
      await evaluateLock("attr(tribe, glasswalker)", notMatching, target),
      false,
    );
    assertEquals(
      await evaluateLock("attr(tribe, glasswalker)", missing, target),
      false,
    );
  },
);

// ── Security exploit tests ────────────────────────────────────────────────

Deno.test("H1 exploit: attr(__proto__) must NOT grant access to all enactors", OPTS, async () => {
  const plain = mockPlayer({ state: {} });
  const target = mockPlayer({ id: "lf_target1" });
  // __proto__ and other prototype keys must not leak as truthy own attrs
  assertEquals(await callLockFunc("attr", plain, target, ["__proto__"]), false);
  assertEquals(await callLockFunc("attr", plain, target, ["constructor"]), false);
  assertEquals(await callLockFunc("attr", plain, target, ["toString"]), false);
  assertEquals(await evaluateLock("attr(__proto__)", plain, target), false);
});

Deno.test("H2 exploit: registerLockFunc must not overwrite built-in flag/perm", OPTS, () => {
  // Attacker plugin tries to replace security-critical built-ins with always-true stubs
  // This must either throw or silently no-op — it must NOT succeed in replacing them
  registerLockFunc("flag", () => true);
  registerLockFunc("perm", () => true);

  const plain = mockPlayer(); // no wizard flag
  const target = mockPlayer({ id: "lf_target1" });
  // flag(wizard) must still return false for a non-wizard player
  return callLockFunc("flag", plain, target, ["wizard"]).then((result) => {
    assertEquals(result, false, "built-in 'flag' was overwritten — privilege escalation");
  });
});

Deno.test("M1 exploit: oversized lock string must be rejected (DoS guard)", OPTS, async () => {
  const plain = mockPlayer();
  const target = mockPlayer({ id: "lf_target1" });
  // 5000-char lock string — must not hang and must return false
  const huge = "flag(connected)||".repeat(300);
  assertEquals(await evaluateLock(huge, plain, target), false);
});

Deno.test("M2 exploit: excessive token count must be rejected (DoS guard)", OPTS, async () => {
  const plain = mockPlayer({ flags: new Set(["player", "connected"]) });
  const target = mockPlayer({ id: "lf_target1" });
  // Register an always-true custom func so the expression would naturally be true
  registerLockFunc("lf_ok", () => true);
  // 300 lf_ok() tokens joined by && → 599 tokens, 2698 chars (under 4096 string limit)
  // Without a token cap this returns true; with the cap it must return false
  const manyTokens = Array(300).fill("lf_ok()").join("&&");
  assertEquals(await evaluateLock(manyTokens, plain, target), false);
});
