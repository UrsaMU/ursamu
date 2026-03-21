/**
 * tests/startup_attrs.test.ts
 *
 * Tests for the STARTUP attribute runner (src/services/startup/index.ts).
 *
 * Verifies:
 *   - Objects with a STARTUP attribute have their command executed via force()
 *   - Objects without a STARTUP attribute are silently skipped
 *   - Multiple objects each get their own STARTUP command executed
 */
import { assertEquals } from "@std/assert";
import { dbojs, DBO } from "../src/services/Database/database.ts";
import { addCmd, clearCmds } from "../src/services/commands/cmdParser.ts";
import { runStartupAttrs } from "../src/services/startup/index.ts";

// H4 IDs
const H4_PLAIN_ID   = "st_h4_plain";
const H4_WIZARD_ID  = "st_h4_wizard";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// DB ID prefix for this test file
const OBJ_A_ID = "st_obj_a";
const OBJ_B_ID = "st_obj_b";
const OBJ_C_ID = "st_obj_c";

async function cleanup(...ids: string[]) {
  for (const id of ids) await dbojs.delete({ id }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Test 1: Object with STARTUP — command is executed
// ---------------------------------------------------------------------------
Deno.test(
  "runStartupAttrs — object with STARTUP has its command executed",
  OPTS,
  async () => {
    // Register a custom test command that records the calling actor's id
    const called: string[] = [];
    clearCmds();
    addCmd({
      name: "st-ping",
      pattern: /^st-ping$/i,
      // deno-lint-ignore no-explicit-any
      exec: (u: any) => {
        called.push(u.actor?.id ?? "unknown");
      },
    });

    // Create an elevated object (wizard) with STARTUP set to the test command
    await dbojs.create({
      id: OBJ_A_ID,
      flags: "thing wizard",
      data: { name: "PingObj", STARTUP: "st-ping" },
    });

    await runStartupAttrs();

    // The custom command should have been invoked once
    assertEquals(called.length >= 1, true);

    clearCmds();
    await cleanup(OBJ_A_ID);
  },
);

// ---------------------------------------------------------------------------
// Test 2: Object without STARTUP — no error, no invocation for that object
// ---------------------------------------------------------------------------
Deno.test(
  "runStartupAttrs — object without STARTUP is skipped without error",
  OPTS,
  async () => {
    const called: string[] = [];
    clearCmds();
    addCmd({
      name: "st-ping2",
      pattern: /^st-ping2$/i,
      // deno-lint-ignore no-explicit-any
      exec: (u: any) => {
        called.push(u.actor?.id ?? "unknown");
      },
    });

    // Create an object with NO STARTUP attribute
    await dbojs.create({
      id: OBJ_B_ID,
      flags: "thing",
      data: { name: "SilentObj" },
    });

    // Should complete without throwing
    await runStartupAttrs();

    // The test command should not have been invoked for this object
    assertEquals(called.length, 0);

    clearCmds();
    await cleanup(OBJ_B_ID);
  },
);

// ---------------------------------------------------------------------------
// Test 3: Multiple objects — each with STARTUP gets executed
// ---------------------------------------------------------------------------
Deno.test(
  "runStartupAttrs — multiple objects each execute their STARTUP command",
  OPTS,
  async () => {
    const invocations: string[] = [];
    clearCmds();
    addCmd({
      name: "st-mark",
      pattern: /^st-mark$/i,
      // deno-lint-ignore no-explicit-any
      exec: (_u: any) => {
        invocations.push("fired");
      },
    });

    // Create two elevated objects (admin), both with STARTUP
    await dbojs.create({
      id: OBJ_A_ID,
      flags: "thing admin",
      data: { name: "Alpha", STARTUP: "st-mark" },
    });
    await dbojs.create({
      id: OBJ_C_ID,
      flags: "thing admin",
      data: { name: "Gamma", STARTUP: "st-mark" },
    });

    await runStartupAttrs();

    // At least two invocations — one per object
    assertEquals(invocations.length >= 2, true);

    clearCmds();
    await cleanup(OBJ_A_ID, OBJ_C_ID);
  },
);

// ---------------------------------------------------------------------------
// Test 4: STARTUP with only whitespace — treated as empty, skipped
// ---------------------------------------------------------------------------
Deno.test(
  "runStartupAttrs — whitespace-only STARTUP is skipped",
  OPTS,
  async () => {
    const called: string[] = [];
    clearCmds();
    addCmd({
      name: "st-ws",
      pattern: /^st-ws$/i,
      // deno-lint-ignore no-explicit-any
      exec: (_u: any) => {
        called.push("fired");
      },
    });

    await dbojs.create({
      id: OBJ_B_ID,
      flags: "thing",
      data: { name: "WhitespaceObj", STARTUP: "   " },
    });

    await runStartupAttrs();

    assertEquals(called.length, 0);

    clearCmds();
    await cleanup(OBJ_B_ID);
    await DBO.close();
  },
);

// ---------------------------------------------------------------------------
// H4 — STARTUP must NOT fire on plain (non-admin/wizard) objects
// ---------------------------------------------------------------------------

Deno.test(
  "H4 — plain 'thing' object STARTUP must NOT fire (privilege guard)",
  OPTS,
  async () => {
    const fired: string[] = [];
    addCmd({
      name: "h4-ping",
      pattern: /^h4-ping$/,
      // deno-lint-ignore no-explicit-any
      exec: (_u: any) => { fired.push("should-not-fire"); },
    });

    await dbojs.create({
      id: H4_PLAIN_ID,
      flags: "thing",
      data: { name: "PlainThing", STARTUP: "h4-ping" },
    });

    await runStartupAttrs();

    // A plain thing (no wizard/admin/superuser) must NOT have STARTUP executed
    if (fired.length > 0) {
      throw new Error("H4 EXPLOIT: plain object STARTUP fired — privilege escalation possible");
    }

    clearCmds();
    await cleanup(H4_PLAIN_ID);
  },
);

Deno.test(
  "H4 — wizard-flagged object STARTUP fires normally",
  OPTS,
  async () => {
    const fired: string[] = [];
    addCmd({
      name: "h4-wizping",
      pattern: /^h4-wizping$/,
      // deno-lint-ignore no-explicit-any
      exec: (_u: any) => { fired.push("wizard-fired"); },
    });

    await dbojs.create({
      id: H4_WIZARD_ID,
      flags: "thing wizard",
      data: { name: "WizardThing", STARTUP: "h4-wizping" },
    });

    await runStartupAttrs();

    assertEquals(fired.length, 1, "wizard object STARTUP should fire");

    clearCmds();
    await cleanup(H4_WIZARD_ID);
    await DBO.close();
  },
);
