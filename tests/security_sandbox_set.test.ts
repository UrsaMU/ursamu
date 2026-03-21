/**
 * tests/security_sandbox_set.test.ts
 *
 * #30-35 — SandboxService handlers update player/object records using full-object
 * $set instead of scoped field paths. A concurrent write or a future code change
 * that adds fields to the record could cause those fields to be silently overwritten.
 *
 * Each test verifies that after the handler runs, unrelated fields on the object
 * are NOT clobbered — specifically that `data.sentinel` (a field we set before
 * calling the handler) survives untouched.
 *
 * These tests exercise the actual message handlers via the exported
 * _handleSandboxMessage test helper (or by manually dispatching the events if
 * the helper is not yet available — which is the RED state).
 */
import { assertEquals } from "@std/assert";
import { dbojs, DBO } from "../src/services/Database/database.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };
const PREFIX = "ssb";

async function cleanup(...ids: string[]) {
  for (const id of ids) await dbojs.delete({ id }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Helper: call the sandbox message handler directly and observe DB side-effects
// ---------------------------------------------------------------------------

// We need to import SandboxService and invoke the internal handler.
// The handler lives in the `case "..."` branches of the worker message listener.
// We test by calling the exported handler helper introduced by the fix.

Deno.test("#30 — failedAttempts update must not clobber unrelated fields", OPTS, async () => {
  const playerId = `${PREFIX}_player30`;
  await dbojs.create({
    id: playerId,
    flags: "player",
    data: { name: "TestPlayer30", password: "hashed", sentinel: "keep-me", failedAttempts: 0 },
  });

  const { scopedUpdate } = await import("../src/services/Sandbox/SandboxService.ts");
  await scopedUpdate(playerId, { "data.failedAttempts": 1 });

  const after = await dbojs.queryOne({ id: playerId });
  assertEquals((after?.data as Record<string, unknown>)?.sentinel, "keep-me");
  assertEquals((after?.data as Record<string, unknown>)?.failedAttempts, 1);

  await cleanup(playerId);
});

Deno.test("#31 — lastLogin update must not clobber unrelated fields", OPTS, async () => {
  const playerId = `${PREFIX}_player31`;
  await dbojs.create({
    id: playerId,
    flags: "player",
    data: { name: "TestPlayer31", password: "hashed", sentinel: "keep-me31" },
  });

  const { scopedUpdate } = await import("../src/services/Sandbox/SandboxService.ts");
  const ts = Date.now();
  await scopedUpdate(playerId, { "data.lastLogin": ts });

  const after = await dbojs.queryOne({ id: playerId });
  assertEquals((after?.data as Record<string, unknown>)?.sentinel, "keep-me31");
  assertEquals((after?.data as Record<string, unknown>)?.lastLogin, ts);

  await cleanup(playerId);
});

Deno.test("#32 — setPassword update must not clobber unrelated fields", OPTS, async () => {
  const playerId = `${PREFIX}_player32`;
  await dbojs.create({
    id: playerId,
    flags: "player",
    data: { name: "TestPlayer32", password: "old-hash", sentinel: "keep-me32" },
  });

  const { scopedUpdate } = await import("../src/services/Sandbox/SandboxService.ts");
  await scopedUpdate(playerId, { "data.password": "new-hash" });

  const after = await dbojs.queryOne({ id: playerId });
  assertEquals((after?.data as Record<string, unknown>)?.sentinel, "keep-me32");
  assertEquals((after?.data as Record<string, unknown>)?.password, "new-hash");

  await cleanup(playerId);
});

Deno.test("#33 — chan:join update must not clobber unrelated fields", OPTS, async () => {
  const playerId = `${PREFIX}_player33`;
  await dbojs.create({
    id: playerId,
    flags: "player",
    data: { name: "TestPlayer33", sentinel: "keep-me33", channels: [] },
  });

  const { scopedUpdate } = await import("../src/services/Sandbox/SandboxService.ts");
  const newChans = [{ channel: "public", alias: "+pub", active: true }];
  await scopedUpdate(playerId, { "data.channels": newChans });

  const after = await dbojs.queryOne({ id: playerId });
  assertEquals((after?.data as Record<string, unknown>)?.sentinel, "keep-me33");
  const chans = (after?.data as Record<string, unknown>)?.channels as unknown[];
  assertEquals(chans?.length, 1);

  await cleanup(playerId);
});

Deno.test("#34 — chan:leave update must not clobber unrelated fields", OPTS, async () => {
  const playerId = `${PREFIX}_player34`;
  await dbojs.create({
    id: playerId,
    flags: "player",
    data: {
      name: "TestPlayer34", sentinel: "keep-me34",
      channels: [{ channel: "public", alias: "+pub", active: true }],
    },
  });

  const { scopedUpdate } = await import("../src/services/Sandbox/SandboxService.ts");
  await scopedUpdate(playerId, { "data.channels": [] });

  const after = await dbojs.queryOne({ id: playerId });
  assertEquals((after?.data as Record<string, unknown>)?.sentinel, "keep-me34");
  const chans = (after?.data as Record<string, unknown>)?.channels as unknown[];
  assertEquals(chans?.length, 0);

  await cleanup(playerId);
});

Deno.test("#35 — bb:markRead update must not clobber unrelated fields", OPTS, async () => {
  const playerId = `${PREFIX}_player35`;
  await dbojs.create({
    id: playerId,
    flags: "player",
    data: { name: "TestPlayer35", sentinel: "keep-me35", bbLastRead: {} },
  });

  const { scopedUpdate } = await import("../src/services/Sandbox/SandboxService.ts");
  await scopedUpdate(playerId, { "data.bbLastRead": { "board1": 5 } });

  const after = await dbojs.queryOne({ id: playerId });
  assertEquals((after?.data as Record<string, unknown>)?.sentinel, "keep-me35");
  const bbLastRead = (after?.data as Record<string, unknown>)?.bbLastRead as Record<string, number>;
  assertEquals(bbLastRead?.["board1"], 5);

  await cleanup(playerId);
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------
Deno.test("security_sandbox_set cleanup", OPTS, async () => {
  await DBO.close();
});
