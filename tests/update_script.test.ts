/**
 * tests/update_script.test.ts
 *
 * Tests for the @update system script (system/scripts/update.ts).
 *
 * The script checks for admin/wizard/superuser flags, broadcasts an update
 * message to the room, and calls u.sys.update(branch).
 */
import { assertEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";
import type { IUrsamuSDK } from "../src/@types/UrsamuSDK.ts";
import updateScript from "../system/scripts/update.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// ─── mock factory ─────────────────────────────────────────────────────────────

function makeSDK(flags: string[], branch = "") {
  const sent: string[] = [];
  const broadcasts: string[] = [];
  let updateCalled = false;
  let updateBranch: string | undefined;

  const sdk = {
    me: {
      id: "p1",
      name: "TestPlayer",
      flags: new Set(flags),
      state: {},
      contents: [],
    },
    here: {
      id: "r1",
      flags: new Set(["room"]),
      state: {},
      contents: [],
      broadcast: (msg: string) => { broadcasts.push(msg); },
    },
    cmd: { name: "update", args: [branch], switches: [] },
    send: (msg: string) => { sent.push(msg); },
    sys: {
      update: async (b?: string) => {
        updateCalled = true;
        updateBranch = b;
        await Promise.resolve();
      },
    },
  };

  return {
    sdk,
    sent,
    broadcasts,
    get updateCalled() { return updateCalled; },
    get updateBranch() { return updateBranch; },
  };
}

// ─── permission checks ────────────────────────────────────────────────────────

Deno.test("@update — non-admin player gets Permission denied", OPTS, async () => {
  const { sdk, sent, broadcasts, updateCalled } = makeSDK(["player", "connected"]);
  await updateScript(sdk as unknown as IUrsamuSDK);

  assertEquals(sent, ["Permission denied."]);
  assertEquals(broadcasts.length, 0);
  assertEquals(updateCalled, false);
});

Deno.test("@update — player with no flags gets Permission denied", OPTS, async () => {
  const { sdk, sent, updateCalled } = makeSDK([]);
  await updateScript(sdk as unknown as IUrsamuSDK);

  assertEquals(sent, ["Permission denied."]);
  assertEquals(updateCalled, false);
});

Deno.test("@update — admin flag allows update", OPTS, async () => {
  const result = makeSDK(["player", "admin"], "");
  await updateScript(result.sdk as unknown as IUrsamuSDK);

  assertEquals(result.sent.length, 0, "no send to actor");
  assertEquals(result.broadcasts.length, 1);
  assertEquals(result.updateCalled, true);
});

Deno.test("@update — wizard flag allows update", OPTS, async () => {
  const result = makeSDK(["player", "wizard"], "");
  await updateScript(result.sdk as unknown as IUrsamuSDK);

  assertEquals(result.sent.length, 0);
  assertEquals(result.broadcasts.length, 1);
  assertEquals(result.updateCalled, true);
});

Deno.test("@update — superuser flag allows update", OPTS, async () => {
  const result = makeSDK(["player", "superuser"], "");
  await updateScript(result.sdk as unknown as IUrsamuSDK);

  assertEquals(result.sent.length, 0);
  assertEquals(result.broadcasts.length, 1);
  assertEquals(result.updateCalled, true);
});

// ─── branch argument ─────────────────────────────────────────────────────────

Deno.test("@update — admin with no branch calls sys.update with empty string", OPTS, async () => {
  const result = makeSDK(["admin"], "");
  await updateScript(result.sdk as unknown as IUrsamuSDK);

  assertEquals(result.updateCalled, true);
  assertEquals(result.updateBranch, "");
});

Deno.test("@update — admin with branch 'main' calls sys.update('main')", OPTS, async () => {
  const result = makeSDK(["admin"], "main");
  await updateScript(result.sdk as unknown as IUrsamuSDK);

  assertEquals(result.updateCalled, true);
  assertEquals(result.updateBranch, "main");
});

Deno.test("@update — admin with feature branch calls sys.update with that branch", OPTS, async () => {
  const result = makeSDK(["admin"], "feature/new-stuff");
  await updateScript(result.sdk as unknown as IUrsamuSDK);

  assertEquals(result.updateCalled, true);
  assertEquals(result.updateBranch, "feature/new-stuff");
});

// ─── broadcast content ───────────────────────────────────────────────────────

Deno.test("@update — broadcast message includes actor name", OPTS, async () => {
  const { sdk, broadcasts } = makeSDK(["admin"], "");
  await updateScript(sdk as unknown as IUrsamuSDK);

  assertEquals(broadcasts.length, 1);
  assertEquals(broadcasts[0].includes("TestPlayer"), true);
});

Deno.test("@update — broadcast message includes update context text", OPTS, async () => {
  const { sdk, broadcasts } = makeSDK(["wizard"], "");
  await updateScript(sdk as unknown as IUrsamuSDK);

  assertEquals(broadcasts.length, 1);
  assertEquals(broadcasts[0].toLowerCase().includes("update"), true);
});

Deno.test("@update — broadcast fires before sys.update is called", OPTS, async () => {
  const order: string[] = [];
  const flags = ["admin"];
  const sdk = {
    me: {
      id: "p1",
      name: "AdminUser",
      flags: new Set(flags),
      state: {},
      contents: [],
    },
    here: {
      id: "r1",
      flags: new Set(["room"]),
      state: {},
      contents: [],
      broadcast: (_msg: string) => { order.push("broadcast"); },
    },
    cmd: { name: "update", args: [""], switches: [] },
    send: (_msg: string) => {},
    sys: {
      update: async (_b?: string) => {
        order.push("sys.update");
        await Promise.resolve();
      },
    },
  };

  await updateScript(sdk as unknown as IUrsamuSDK);

  assertEquals(order, ["broadcast", "sys.update"]);
});

// ─── branch trimming ─────────────────────────────────────────────────────────

Deno.test("@update — branch argument is trimmed of whitespace", OPTS, async () => {
  const result = makeSDK(["admin"], "  main  ");
  // The script does: const branch = (u.cmd.args[0] || "").trim()
  // So args[0] = "  main  " → trimmed to "main"
  await updateScript(result.sdk as unknown as IUrsamuSDK);
  assertEquals(result.updateBranch, "main");
});
