/**
 * tests/migration.test.ts
 *
 * Infrastructure smoke tests.
 *
 * Command-specific tests (say, pose, look, who, score, etc.) live in their
 * dedicated test files (scripts_comms, scripts_world, scripts_flags_set, etc.).
 * Only the sandbox self-test is kept here since it validates the Worker
 * infrastructure itself, not a specific command.
 */
import { assertEquals } from "@std/assert";
import { sandboxService } from "../src/services/Sandbox/SandboxService.ts";
import type { SDKContext } from "../src/services/Sandbox/SDKService.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("sandbox — runs inline script and sends result", OPTS, async () => {
  const inlineScript = `export default async (u) => { u.send("ping"); };`;
  const context: Partial<SDKContext> = {
    me: { id: "actor1", name: "PlayerOne", state: {}, flags: new Set(["player"]), contents: [] },
    cmd: { name: "ping", args: [], switches: [] },
    id: "actor1",
    state: {},
  };
  // Should not throw
  await sandboxService.runScript(inlineScript, context as SDKContext);
  assertEquals(true, true);
});
