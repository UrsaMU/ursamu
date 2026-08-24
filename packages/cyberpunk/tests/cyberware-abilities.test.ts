/**
 * Tests: Cyberware Active Abilities
 * Covers Kerenzikov, Sandevistan, Targeting Scope, and Pain Editor.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { woundActionPenalty } from "../engine/character.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cw(name: string) {
  return {
    id: crypto.randomUUID(),
    name,
    category: "neuralware" as const,
    hl: 0,
    installType: "hospital" as const,
    installedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Initiative calculation helpers (pure logic extracted for testing)
// ---------------------------------------------------------------------------

function calcInit(opts: {
  ref: number;
  d10: number;
  mod?: number;
  woundPen?: number;
  cyberware: Array<{ name: string }>;
  sandevistanActive?: boolean;
}): { total: number; kereBonus: number; sandyBonus: number } {
  const mod = opts.mod ?? 0;
  const woundPen = opts.woundPen ?? 0;
  const hasKerenzikov = opts.cyberware.some((c) => c.name === "kerenzikov");
  const kereBonus = hasKerenzikov ? 2 : 0;
  const hasSandevistanActive =
    opts.sandevistanActive === true &&
    opts.cyberware.some((c) => c.name === "sandevistan_speedware");
  const sandyBonus = hasSandevistanActive ? 3 : 0;
  const total = opts.ref + opts.d10 + mod + woundPen + kereBonus + sandyBonus;
  return { total, kereBonus, sandyBonus };
}

// ---------------------------------------------------------------------------
// Targeting Scope helper
// ---------------------------------------------------------------------------

function calcAimedAttackSkillBonus(opts: {
  aimed: boolean;
  cyberware: Array<{ name: string }>;
}): number {
  const hasTargetingScope = opts.cyberware.some((c) => c.name === "targeting_scope");
  return opts.aimed && hasTargetingScope ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Sandevistan cooldown helper
// ---------------------------------------------------------------------------

function canActivateSandevistan(opts: {
  lastUsed: number;
  now: number;
}): { allowed: boolean; remainingMs: number } {
  const COOLDOWN_MS = 3_600_000;
  const elapsed = opts.now - opts.lastUsed;
  if (elapsed < COOLDOWN_MS) {
    return { allowed: false, remainingMs: COOLDOWN_MS - elapsed };
  }
  return { allowed: true, remainingMs: 0 };
}

// ---------------------------------------------------------------------------
// 1. Kerenzikov: +2 when installed
// ---------------------------------------------------------------------------

Deno.test("Kerenzikov: +2 initiative when installed", () => {
  const { total, kereBonus } = calcInit({
    ref: 6,
    d10: 7,
    cyberware: [cw("kerenzikov")],
  });
  assertEquals(kereBonus, 2);
  assertEquals(total, 6 + 7 + 2); // 15
});

// ---------------------------------------------------------------------------
// 2. Kerenzikov: no bonus when not installed
// ---------------------------------------------------------------------------

Deno.test("Kerenzikov: no bonus when not installed", () => {
  const { total, kereBonus } = calcInit({
    ref: 6,
    d10: 7,
    cyberware: [],
  });
  assertEquals(kereBonus, 0);
  assertEquals(total, 6 + 7); // 13
});

// ---------------------------------------------------------------------------
// 3. Sandevistan: cooldown rejected within 1 hour
// ---------------------------------------------------------------------------

Deno.test("Sandevistan: activation rejected within 1-hour cooldown", () => {
  const now = Date.now();
  const lastUsed = now - 1_800_000; // 30 minutes ago
  const result = canActivateSandevistan({ lastUsed, now });
  assertEquals(result.allowed, false);
  // remaining should be roughly 30 min (1_800_000 ms)
  assertEquals(result.remainingMs > 0, true);
  assertEquals(result.remainingMs <= 1_800_001, true);
});

// ---------------------------------------------------------------------------
// 4. Sandevistan: +3 when active flag set
// ---------------------------------------------------------------------------

Deno.test("Sandevistan: +3 to initiative when active", () => {
  const { total, sandyBonus } = calcInit({
    ref: 6,
    d10: 7,
    cyberware: [cw("sandevistan_speedware")],
    sandevistanActive: true,
  });
  assertEquals(sandyBonus, 3);
  assertEquals(total, 6 + 7 + 3); // 16
});

Deno.test("Sandevistan: no bonus when not active", () => {
  const { sandyBonus } = calcInit({
    ref: 6,
    d10: 7,
    cyberware: [cw("sandevistan_speedware")],
    sandevistanActive: false,
  });
  assertEquals(sandyBonus, 0);
});

Deno.test("Sandevistan: no bonus when active flag set but not installed", () => {
  const { sandyBonus } = calcInit({
    ref: 6,
    d10: 7,
    cyberware: [],
    sandevistanActive: true,
  });
  assertEquals(sandyBonus, 0);
});

// ---------------------------------------------------------------------------
// 5. Targeting Scope: +1 to aimed shot roll when installed
// ---------------------------------------------------------------------------

Deno.test("Targeting Scope: +1 bonus on aimed shot when installed", () => {
  const bonus = calcAimedAttackSkillBonus({
    aimed: true,
    cyberware: [cw("targeting_scope")],
  });
  assertEquals(bonus, 1);
});

Deno.test("Targeting Scope: no bonus on non-aimed attack even if installed", () => {
  const bonus = calcAimedAttackSkillBonus({
    aimed: false,
    cyberware: [cw("targeting_scope")],
  });
  assertEquals(bonus, 0);
});

Deno.test("Targeting Scope: no bonus when not installed", () => {
  const bonus = calcAimedAttackSkillBonus({
    aimed: true,
    cyberware: [],
  });
  assertEquals(bonus, 0);
});

// ---------------------------------------------------------------------------
// 6. Pain Editor: woundActionPenalty returns 0 for "seriously" when installed
// ---------------------------------------------------------------------------

Deno.test("Pain Editor: no penalty for seriously wounded when pain_editor installed", () => {
  const penalty = woundActionPenalty("seriously", [cw("pain_editor")]);
  assertEquals(penalty, 0);
});

Deno.test("Pain Editor: -2 penalty for seriously wounded without pain_editor", () => {
  const penalty = woundActionPenalty("seriously", []);
  assertEquals(penalty, -2);
});

// ---------------------------------------------------------------------------
// 7. Pain Editor: mortally wounded still -4 even with pain_editor
// ---------------------------------------------------------------------------

Deno.test("Pain Editor: -4 penalty for mortally wounded even with pain_editor installed", () => {
  const penalty = woundActionPenalty("mortally", [cw("pain_editor")]);
  assertEquals(penalty, -4);
});

Deno.test("woundActionPenalty: healthy returns 0", () => {
  const penalty = woundActionPenalty("healthy", [cw("pain_editor")]);
  assertEquals(penalty, 0);
});

Deno.test("woundActionPenalty: lightly returns 0", () => {
  const penalty = woundActionPenalty("lightly", [cw("pain_editor")]);
  assertEquals(penalty, 0);
});

Deno.test("woundActionPenalty: no cyberware arg defaults to normal penalty", () => {
  assertEquals(woundActionPenalty("seriously"), -2);
  assertEquals(woundActionPenalty("mortally"), -4);
  assertEquals(woundActionPenalty("healthy"), 0);
});
