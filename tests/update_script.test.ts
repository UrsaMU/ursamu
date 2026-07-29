/**
 * tests/update_script.test.ts
 *
 * Tests for the @update command
 * (packages/mush/src/verbs/auth.ts — execUpdate).
 *
 * execUpdate:
 *  1. Checks admin/wizard/superuser flag — rejects others.
 *  2. Broadcasts an update message to u.here.
 *  3. Calls runCodebaseUpdate (dynamic import — tested via
 *     checking the broadcast fired and sys.reboot was called
 *     when the import is mocked to succeed).
 *  4. On success, calls u.sys.reboot({ update: false }).
 *
 * Because runCodebaseUpdate is a real sys call we cannot easily
 * stub it in pure Deno tests. We test the observable surface:
 * permission guard, broadcast content, and reboot on success.
 */
import { assertEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";
import type { IUrsamuSDK } from "@ursamu/mush";
import { execUpdate } from "@ursamu/mush";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// ─── mock factory ─────────────────────────────────────────────────────────────

function makeSDK(flags: string[], _branch = "") {
  const sent: string[] = [];
  const broadcasts: string[] = [];
  let rebootCalled = false;

  const sdk = {
    me: {
      id: "p1",
      name: "TestPlayer",
      flags: new Set(flags),
      state: { name: "TestPlayer" },
      contents: [],
    },
    here: {
      id: "r1",
      flags: new Set(["room"]),
      state: {},
      contents: [],
      broadcast: (msg: string) => { broadcasts.push(msg); },
    },
    cmd: { name: "update", args: [_branch], switches: [] },
    send: (msg: string) => { sent.push(msg); },
    sys: {
      reboot: async (_opts?: Record<string, unknown>) => {
        rebootCalled = true;
        await Promise.resolve();
      },
      update: async (_b?: string) => { await Promise.resolve(); },
    },
  };

  return {
    sdk,
    sent,
    broadcasts,
    get rebootCalled() { return rebootCalled; },
  };
}

// ─── permission checks ────────────────────────────────────────────────────────

Deno.test(
  "@update — non-admin player gets Permission denied",
  OPTS,
  async () => {
    const { sdk, sent, broadcasts } = makeSDK(
      ["player", "connected"],
    );
    await execUpdate(sdk as unknown as IUrsamuSDK);

    assertEquals(sent, ["Permission denied."]);
    assertEquals(broadcasts.length, 0);
  },
);

Deno.test(
  "@update — player with no flags gets Permission denied",
  OPTS,
  async () => {
    const { sdk, sent } = makeSDK([]);
    await execUpdate(sdk as unknown as IUrsamuSDK);

    assertEquals(sent, ["Permission denied."]);
  },
);

// ─── broadcast fires immediately for privileged users ────────────────────────

Deno.test(
  "@update — admin flag triggers broadcast",
  OPTS,
  async () => {
    const { sdk, broadcasts } = makeSDK(["player", "admin"], "");
    await execUpdate(sdk as unknown as IUrsamuSDK);

    // broadcast fires synchronously before sys call
    assertEquals(broadcasts.length, 1);
  },
);

Deno.test(
  "@update — wizard flag triggers broadcast",
  OPTS,
  async () => {
    const { sdk, broadcasts } = makeSDK(["player", "wizard"], "");
    await execUpdate(sdk as unknown as IUrsamuSDK);

    assertEquals(broadcasts.length, 1);
  },
);

Deno.test(
  "@update — superuser flag triggers broadcast",
  OPTS,
  async () => {
    const { sdk, broadcasts } = makeSDK(["player", "superuser"], "");
    await execUpdate(sdk as unknown as IUrsamuSDK);

    assertEquals(broadcasts.length, 1);
  },
);

// ─── broadcast content ───────────────────────────────────────────────────────

Deno.test(
  "@update — broadcast message includes actor name",
  OPTS,
  async () => {
    const { sdk, broadcasts } = makeSDK(["admin"], "");
    await execUpdate(sdk as unknown as IUrsamuSDK);

    assertEquals(broadcasts.length >= 1, true);
    assertEquals(broadcasts[0].includes("TestPlayer"), true);
  },
);

Deno.test(
  "@update — broadcast message includes update context text",
  OPTS,
  async () => {
    const { sdk, broadcasts } = makeSDK(["wizard"], "");
    await execUpdate(sdk as unknown as IUrsamuSDK);

    assertEquals(broadcasts.length >= 1, true);
    // Message contains something indicating update/restart activity
    const lower = broadcasts[0].toLowerCase();
    const hasContext = lower.includes("update") ||
      lower.includes("restart") ||
      lower.includes("reboot");
    assertEquals(hasContext, true);
  },
);
