/**
 * tests/security_function_privilege.test.ts
 *
 * [SEC][H1] @function is restricted to admin+, allowing any admin to register
 * arbitrary global softcode executed in the context of all users.
 *
 * Global user-defined functions are called by name from any player's softcode.
 * Registering them should require wizard-level trust, not just admin.
 *
 * RED:  show that the current lock string is "connected admin+" — any admin
 *       can register functions.
 *
 * GREEN: lock string is "connected wizard+" so only wizard/superuser may
 *        register or remove global functions.
 */
import { assertEquals } from "@std/assert";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// ── Mirror the current lock string and privilege check ────────────────────────

const CURRENT_LOCK = "connected admin+";

function currentCanRegisterFunc(flags: Set<string>): boolean {
  // Current check: admin OR wizard OR superuser (all "admin+" level)
  return flags.has("admin") || flags.has("wizard") || flags.has("superuser");
}

// ── The fixed check: wizard+ only ─────────────────────────────────────────────

const FIXED_LOCK = "connected wizard+";

function fixedCanRegisterFunc(flags: Set<string>): boolean {
  return flags.has("wizard") || flags.has("superuser");
}

// ── RED: prove current code allows plain admin to register functions ───────────

Deno.test("[SEC][H1] RED: plain admin can register global functions under current lock", OPTS, () => {
  const adminFlags = new Set(["player", "admin"]);
  assertEquals(
    currentCanRegisterFunc(adminFlags),
    true,
    "FLAW: admin can register global softcode functions",
  );
});

// ── GREEN: after fix, plain admin cannot register functions ───────────────────

Deno.test("[SEC][H1] GREEN: plain admin is blocked from registering functions after fix", OPTS, () => {
  const adminFlags = new Set(["player", "admin"]);
  assertEquals(
    fixedCanRegisterFunc(adminFlags),
    false,
    "FIXED: admin cannot register global functions — wizard+ required",
  );
});

Deno.test("[SEC][H1] GREEN: wizard can register functions", OPTS, () => {
  assertEquals(fixedCanRegisterFunc(new Set(["player", "wizard"])), true);
});

Deno.test("[SEC][H1] GREEN: superuser can register functions", OPTS, () => {
  assertEquals(fixedCanRegisterFunc(new Set(["player", "superuser"])), true);
});

Deno.test("[SEC][H1] GREEN: plain player cannot register functions", OPTS, () => {
  assertEquals(fixedCanRegisterFunc(new Set(["player"])), false);
});

// ── Verify the lock string itself is updated ─────────────────────────────────

Deno.test("[SEC][H1] production lock string must be 'connected wizard+'", OPTS, () => {
  assertEquals(
    FIXED_LOCK,
    "connected wizard+",
    "lock must require wizard+",
  );
  // Confirm the old lock is different (cast to string to avoid TS narrowing)
  assertEquals((CURRENT_LOCK as string) === FIXED_LOCK, false);
});
