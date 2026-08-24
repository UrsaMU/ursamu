/**
 * tests/update_script.test.ts
 *
 * Tests for the @update command (execUpdate).
 * Live git/deno-cache is stubbed — nested `deno cache`
 * inside `deno test` segfaults CI (exit 139).
 */
import { assertEquals } from "@std/assert";
import type { IUrsamuSDK } from "@ursamu/mush";
import { execUpdate } from "@ursamu/mush";
import {
  setCodebaseUpdateRunner,
} from "../packages/mush/src/sys/codebase-update.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function stubCached() {
  return Promise.resolve({
    ok: true,
    lines: [],
    bumped: [],
    pulled: false,
    cached: true,
  });
}

async function withUpdateStub(
  fn: () => Promise<void>,
): Promise<void> {
  setCodebaseUpdateRunner(stubCached);
  try {
    await fn();
  } finally {
    setCodebaseUpdateRunner();
  }
}

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
  () =>
    withUpdateStub(async () => {
      const { sdk, broadcasts } = makeSDK(
        ["player", "admin"],
        "",
      );
      await execUpdate(sdk as unknown as IUrsamuSDK);
      assertEquals(broadcasts.length, 1);
    }),
);

Deno.test(
  "@update — wizard flag triggers broadcast",
  OPTS,
  () =>
    withUpdateStub(async () => {
      const { sdk, broadcasts } = makeSDK(
        ["player", "wizard"],
        "",
      );
      await execUpdate(sdk as unknown as IUrsamuSDK);
      assertEquals(broadcasts.length, 1);
    }),
);

Deno.test(
  "@update — superuser flag triggers broadcast",
  OPTS,
  () =>
    withUpdateStub(async () => {
      const { sdk, broadcasts } = makeSDK(
        ["player", "superuser"],
        "",
      );
      await execUpdate(sdk as unknown as IUrsamuSDK);
      assertEquals(broadcasts.length, 1);
    }),
);

// ─── broadcast content ───────────────────────────────────────────────────────

Deno.test(
  "@update — broadcast message includes actor name",
  OPTS,
  () =>
    withUpdateStub(async () => {
      const { sdk, broadcasts } = makeSDK(["admin"], "");
      await execUpdate(sdk as unknown as IUrsamuSDK);
      assertEquals(broadcasts.length >= 1, true);
      assertEquals(broadcasts[0].includes("TestPlayer"), true);
    }),
);

Deno.test(
  "@update — broadcast message includes update context text",
  OPTS,
  () =>
    withUpdateStub(async () => {
      const { sdk, broadcasts } = makeSDK(["wizard"], "");
      await execUpdate(sdk as unknown as IUrsamuSDK);
      assertEquals(broadcasts.length >= 1, true);
      const lower = broadcasts[0].toLowerCase();
      const hasContext = lower.includes("update") ||
        lower.includes("restart") ||
        lower.includes("reboot");
      assertEquals(hasContext, true);
    }),
);

Deno.test(
  "@update — cached stub calls sys.reboot",
  OPTS,
  () =>
    withUpdateStub(async () => {
      const ctx = makeSDK(["admin"], "");
      await execUpdate(ctx.sdk as unknown as IUrsamuSDK);
      assertEquals(ctx.rebootCalled, true);
    }),
);
