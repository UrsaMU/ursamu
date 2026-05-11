/**
 * M1 — `resolveGlobalFormat` in social.ts constructs a synthetic IDBObj for
 * `#0` without verifying that object exists. When #0 doesn't exist, plugin
 * handlers are still invoked with target.id="0" (a phantom target).
 *
 * Inconsistent with ps.ts which checks `dbojs.queryOne({ id: "0" })` first.
 * Functionally safe today because softcode attr lookup also fails on
 * non-existent objects, but the phantom-target leak through to plugin
 * handlers is a latent bug.
 *
 * Fix: only resolve against #0 when #0 actually exists in the DB.
 */
import { assertEquals } from "@std/assert";
import { dbojs, DBO } from "../src/services/Database/database.ts";
import { execWho } from "../src/commands/social.ts";
import {
  registerFormatHandler,
  unregisterFormatHandler,
  _clearFormatHandlers,
  type FormatHandler,
} from "../src/utils/formatHandlers.ts";
import type { IUrsamuSDK, IDBObj } from "../src/@types/UrsamuSDK.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false, timeout: 15000 };

const ACTOR = "710001";

async function setup() {
  _clearFormatHandlers();
  await dbojs.delete({ id: "0" }).catch(() => {});  // ensure #0 absent
  await dbojs.delete({ id: ACTOR }).catch(() => {});
  await dbojs.create({
    id: ACTOR,
    flags: "player connected",
    data: { name: "Alice" },
    location: ACTOR,
  });
}

function makeMockSDK(): { u: IUrsamuSDK; sent: string[] } {
  const sent: string[] = [];
  const me = {
    id: ACTOR,
    name: "Alice",
    flags: new Set(["player", "connected"]),
    state: { name: "Alice" },
    location: ACTOR,
    contents: [],
  } as unknown as IDBObj;
  const u = {
    me,
    here: me,
    socketId: "sock-m1",
    cmd: { name: "who", original: "who", args: [], switches: [] },
    send: (m: string) => { sent.push(m); },
    canEdit: () => Promise.resolve(true),
    db: {
      search: () => Promise.resolve([me]),
      modify: () => Promise.resolve(),
      create: () => Promise.resolve(me),
      destroy: () => Promise.resolve(),
    },
    attr: {
      get: async (id: string, n: string) => {
        const o = await dbojs.queryOne({ id });
        if (!o) return null;
        const attrs = (o.data?.attributes as Array<{ name: string; value: string }>) || [];
        return attrs.find((a) => a.name.toUpperCase() === n.toUpperCase())?.value ?? null;
      },
      set: () => Promise.resolve(),
      clear: () => Promise.resolve(false),
    },
    util: {
      displayName: (o: { name?: string }) => o.name ?? "Unknown",
      stripSubs: (s: string) => s,
      center: (s: string) => s,
      ljust: (s: string, w: number) => s.padEnd(w),
      rjust: (s: string, w: number) => s.padStart(w),
    },
  } as unknown as IUrsamuSDK;
  return { u, sent };
}

Deno.test("M1: WHO handler must NOT be invoked with phantom target.id='0' when #0 absent", OPTS, async () => {
  await setup();

  const seenIds: string[] = [];
  const probe: FormatHandler = (_u, target) => {
    seenIds.push(target.id);
    return null;  // fall through so default renders
  };
  registerFormatHandler("WHOFORMAT", probe);
  try {
    const { u } = makeMockSDK();
    await execWho(u);
  } finally {
    unregisterFormatHandler("WHOFORMAT", probe);
  }

  // Today (pre-fix), this list includes "0" because social.ts synthesizes a
  // phantom #0 target unconditionally. After the fix it should only contain
  // the enactor id (ACTOR).
  assertEquals(
    seenIds.includes("0"),
    false,
    `Plugin handler was invoked with phantom target.id="0" even though #0 doesn't exist. seenIds=${JSON.stringify(seenIds)}`,
  );
});

Deno.test("M1: cleanup", OPTS, async () => {
  await dbojs.delete({ id: ACTOR }).catch(() => {});
  await DBO.close();
});
