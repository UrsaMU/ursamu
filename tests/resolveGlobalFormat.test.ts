/**
 * Tests for `resolveGlobalFormat` — promoted from inline copies in social.ts
 * and ps.ts. Covers two-tier ordering (#0 → enactor → null), phantom-#0
 * guard, and the sandbox bridge.
 */
import { assertEquals } from "@std/assert";
import { dbojs, DBO } from "../src/services/Database/database.ts";
import {
  resolveGlobalFormat,
  resolveGlobalFormatOr,
} from "../src/utils/resolveGlobalFormat.ts";
import {
  registerFormatHandler,
  unregisterFormatHandler,
  _clearFormatHandlers,
  type FormatHandler,
} from "../src/utils/formatHandlers.ts";
import { sandboxService } from "../src/services/Sandbox/SandboxService.ts";
import type { SDKContext } from "../src/services/Sandbox/SDKService.ts";
import type { IUrsamuSDK, IDBObj } from "../src/@types/UrsamuSDK.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };
const SLOW = { timeout: 20000 };

const ROOT  = "0";
const ACTOR = "rgf_actor1";

function mockU(): IUrsamuSDK {
  return {
    me: {
      id: ACTOR, name: "Alice",
      flags: new Set(["player", "connected"]),
      state: { name: "Alice" }, location: ROOT, contents: [],
    } as unknown as IDBObj,
    socketId: "s-rgf",
    cmd: { name: "test", args: [], switches: [] },
    send: () => {},
    canEdit: () => Promise.resolve(true),
    attr: {
      get: () => Promise.resolve(null),  // force plugin-handler path
      set: () => Promise.resolve(),
      clear: () => Promise.resolve(false),
    },
    util: { displayName: (o: IDBObj) => o.name ?? "?" },
  } as unknown as IUrsamuSDK;
}

async function setup() {
  _clearFormatHandlers();
  await dbojs.delete({ id: ROOT }).catch(() => {});
  await dbojs.delete({ id: ACTOR }).catch(() => {});
}

Deno.test("resolveGlobalFormat: #0 wins when both targets have handlers", OPTS, async () => {
  await setup();
  await dbojs.create({ id: ROOT,  flags: "room",   data: { name: "Root" } });
  await dbojs.create({ id: ACTOR, flags: "player connected", data: { name: "Alice" } });
  const seen: string[] = [];
  const handler: FormatHandler = (_u, target) => { seen.push(target.id); return target.id === ROOT ? "ROOT" : "ACTOR"; };
  registerFormatHandler("WHOFORMAT", handler);
  try {
    const out = await resolveGlobalFormat(mockU(), "WHOFORMAT", "default");
    assertEquals(out, "ROOT");
    assertEquals(seen, [ROOT]);  // enactor never consulted
  } finally {
    unregisterFormatHandler("WHOFORMAT", handler);
    await setup();
  }
});

Deno.test("resolveGlobalFormat: enactor consulted when #0 returns null", OPTS, async () => {
  await setup();
  await dbojs.create({ id: ROOT,  flags: "room",   data: { name: "Root" } });
  await dbojs.create({ id: ACTOR, flags: "player connected", data: { name: "Alice" } });
  const seen: string[] = [];
  const handler: FormatHandler = (_u, target) => { seen.push(target.id); return target.id === ACTOR ? "FROM_ACTOR" : null; };
  registerFormatHandler("WHOFORMAT", handler);
  try {
    const out = await resolveGlobalFormat(mockU(), "WHOFORMAT", "default");
    assertEquals(out, "FROM_ACTOR");
    assertEquals(seen, [ROOT, ACTOR]);
  } finally {
    unregisterFormatHandler("WHOFORMAT", handler);
    await setup();
  }
});

Deno.test("resolveGlobalFormat: skips #0 entirely when #0 doesn't exist (M1 guard)", OPTS, async () => {
  await setup();  // #0 absent
  await dbojs.create({ id: ACTOR, flags: "player connected", data: { name: "Alice" } });
  const seen: string[] = [];
  const handler: FormatHandler = (_u, target) => { seen.push(target.id); return null; };
  registerFormatHandler("WHOFORMAT", handler);
  try {
    const out = await resolveGlobalFormat(mockU(), "WHOFORMAT", "default");
    assertEquals(out, null);
    assertEquals(seen, [ACTOR]);  // never invoked with phantom "0"
  } finally {
    unregisterFormatHandler("WHOFORMAT", handler);
    await setup();
  }
});

Deno.test("resolveGlobalFormatOr: returns fallback when resolver yields null", OPTS, async () => {
  await setup();
  await dbojs.create({ id: ACTOR, flags: "player connected", data: { name: "Alice" } });
  const out = await resolveGlobalFormatOr(mockU(), "WHOFORMAT", "default", "FALLBACK");
  assertEquals(out, "FALLBACK");
  await setup();
});

Deno.test("sandbox: u.util.resolveGlobalFormat bridge works end-to-end", { ...OPTS, ...SLOW }, async () => {
  await setup();
  await dbojs.create({
    id: ROOT,
    flags: "room",
    data: {
      name: "Root",
      attributes: [
        { name: "WHOFORMAT", value: "<<%0>>", setter: ACTOR, type: "attribute" },
      ],
    },
  });
  await dbojs.create({ id: ACTOR, flags: "player connected", data: { name: "Alice" } });

  const script = `
    u.ui = { ...u.ui, layout: () => {}, panel: (o) => o };
    return await u.util.resolveGlobalFormat("WHOFORMAT", "default-block");
  `;
  const ctx: SDKContext = {
    id: ACTOR,
    state: {},
    me: { id: ACTOR, name: "Alice", flags: new Set(["player", "connected"]), state: { name: "Alice" }, location: ROOT },
    here: { id: ROOT, name: "Root", flags: new Set(["room"]), state: {} },
    cmd: { name: "test", args: [] },
    socketId: "sock-rgf",
  };
  const result = await sandboxService.runScript(script, ctx, SLOW);
  assertEquals(result, "<<default-block>>");
  await setup();
  await DBO.close();
});
