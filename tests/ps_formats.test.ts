/**
 * Tests for PSFORMAT / PSROWFORMAT — mirrors who_formats.test.ts.
 *
 * Unit-style tests drive the plugin-handler registry (softcode attr path
 * returns null when `u.attr.get` is stubbed to null).
 * Integration tests use real dbojs + softcodeService via the two-tier
 * `resolveGlobalFormat` lookup (#0 then enactor).
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import type { IUrsamuSDK, IDBObj } from "../src/@types/UrsamuSDK.ts";
import { execPs } from "../src/commands/ps.ts";
import { queue } from "../src/services/Queue/index.ts";
import {
  registerFormatHandler,
  unregisterFormatHandler,
  _clearFormatHandlers,
  type FormatHandler,
} from "../src/utils/formatHandlers.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };
const SLOW = { timeout: 15000 };

// ── helpers ───────────────────────────────────────────────────────────────

function makeActor(id: string, name: string, staff = false): IDBObj {
  const flags = new Set(["player", "connected"]);
  if (staff) flags.add("admin");
  return {
    id,
    name,
    flags,
    state: { name },
    location: "0",
    contents: [],
  } as unknown as IDBObj;
}

function makeMock(actor: IDBObj, attrGet?: (id: string, name: string) => Promise<string | null>) {
  const sent: string[] = [];
  const u = {
    me: actor,
    here: { id: "r1", flags: new Set(["room"]), state: {}, contents: [], broadcast: () => {} },
    cmd: { name: "@ps", original: "@ps", args: ["", ""], switches: [] },
    socketId: "sock-1",
    send: (m: string) => { sent.push(m); },
    db: { search: () => Promise.resolve([]) },
    attr: { get: attrGet ?? (() => Promise.resolve(null)) },
    util: {
      displayName: (o: IDBObj) => o.name ?? "Unknown",
      center: (s: string, w: number, fill: string) => {
        const pad = Math.max(0, w - s.length);
        const left = Math.floor(pad / 2);
        return fill.repeat(left) + s + fill.repeat(pad - left);
      },
      ljust: (s: string, w: number, fill = " ") => s + fill.repeat(Math.max(0, w - s.length)),
    },
  };
  return { u: u as unknown as IUrsamuSDK, sent };
}

// Track PIDs created in tests so we can clean them up.
const createdPids: number[] = [];

async function enqueueFor(executor: string): Promise<number> {
  const pid = await queue.enqueue({ command: "think hi", executor, enactor: executor }, 30_000);
  createdPids.push(pid);
  return pid;
}

async function cleanupQueue() {
  for (const pid of createdPids.splice(0)) {
    await queue.cancel(pid).catch(() => {});
  }
}

// ── Unit tests ────────────────────────────────────────────────────────────

Deno.test("ps: no attr + no handler — default rendering", OPTS, async () => {
  _clearFormatHandlers();
  const actor = makeActor("999101", "Alice");
  await enqueueFor(actor.id);
  try {
    const { u, sent } = makeMock(actor);
    await execPs(u);
    const out = sent.join("\n");
    assertStringIncludes(out, "Process Queue");
    assertStringIncludes(out, `#${actor.id}`);
    assertStringIncludes(out, "%chTotal:%cn");
  } finally {
    await cleanupQueue();
  }
});

Deno.test("ps: PSFORMAT handler overrides full block", OPTS, async () => {
  _clearFormatHandlers();
  const actor = makeActor("999102", "Alice");
  await enqueueFor(actor.id);
  try {
    const fn: FormatHandler = (_u, _t, arg) => `BLOCK<<${arg.length}>>`;
    registerFormatHandler("PSFORMAT", fn);
    const { u, sent } = makeMock(actor);
    try {
      await execPs(u);
    } finally {
      unregisterFormatHandler("PSFORMAT", fn);
    }
    const out = sent.join("\n");
    assertStringIncludes(out, "BLOCK<<");
    assertEquals(out.includes("Process Queue "), false);
  } finally {
    await cleanupQueue();
  }
});

Deno.test("ps: PSROWFORMAT handler overrides per-row", OPTS, async () => {
  _clearFormatHandlers();
  const actor = makeActor("999103", "Alice");
  await enqueueFor(actor.id);
  await enqueueFor(actor.id);
  try {
    const fn: FormatHandler = (_u, _t, arg) => `ROW[${arg.split(/\s+/).slice(0, 3).join("|")}]`;
    registerFormatHandler("PSROWFORMAT", fn);
    const { u, sent } = makeMock(actor);
    try {
      await execPs(u);
    } finally {
      unregisterFormatHandler("PSROWFORMAT", fn);
    }
    const out = sent.join("\n");
    assertStringIncludes(out, "ROW[");
    // Header & footer still rendered because PSFORMAT not set.
    assertStringIncludes(out, "Process Queue");
    assertStringIncludes(out, "%chTotal:%cn");
  } finally {
    await cleanupQueue();
  }
});

Deno.test("ps: handler returning null falls through to default", OPTS, async () => {
  _clearFormatHandlers();
  const actor = makeActor("999104", "Alice");
  await enqueueFor(actor.id);
  try {
    const fn: FormatHandler = () => null;
    registerFormatHandler("PSFORMAT", fn);
    const { u, sent } = makeMock(actor);
    try {
      await execPs(u);
    } finally {
      unregisterFormatHandler("PSFORMAT", fn);
    }
    const out = sent.join("\n");
    assertStringIncludes(out, "Process Queue");
    assertStringIncludes(out, `#${actor.id}`);
  } finally {
    await cleanupQueue();
  }
});

Deno.test("ps: handler throw is swallowed; default rendering wins", OPTS, async () => {
  _clearFormatHandlers();
  const actor = makeActor("999105", "Alice");
  await enqueueFor(actor.id);
  try {
    const fn: FormatHandler = () => { throw new Error("boom"); };
    registerFormatHandler("PSFORMAT", fn);
    const { u, sent } = makeMock(actor);
    try {
      await execPs(u);
    } finally {
      unregisterFormatHandler("PSFORMAT", fn);
    }
    const out = sent.join("\n");
    assertStringIncludes(out, "Process Queue");
  } finally {
    await cleanupQueue();
  }
});

// ── Integration tests (real softcode + dbojs) ─────────────────────────────

const { dbojs, DBO } = await import("../src/services/Database/database.ts");
const { createNativeSDK } = await import("../src/services/SDK/index.ts");

const ROOT = "0";
const ACTOR = "920001";

async function dbCleanup() {
  for (const id of [ROOT, ACTOR]) {
    await dbojs.delete({ id }).catch(() => {});
  }
}

async function seed(opts: { rootAttrs?: Record<string, string>; actorAttrs?: Record<string, string> } = {}) {
  await dbCleanup();
  _clearFormatHandlers();
  const mkAttrs = (m: Record<string, string>) =>
    Object.entries(m).map(([name, value]) => ({ name, value, setter: ACTOR, type: "attribute" }));
  await dbojs.create({
    id: ROOT,
    flags: "room",
    data: { name: "Root", attributes: mkAttrs(opts.rootAttrs ?? {}) },
  });
  await dbojs.create({
    id: ACTOR,
    flags: "player connected wizard",
    data: { name: "Alice", attributes: mkAttrs(opts.actorAttrs ?? {}) },
    location: ROOT,
  });
  await enqueueFor(ACTOR);
}

async function runPs(): Promise<string> {
  const u = await createNativeSDK("ps-sock", ACTOR, {
    name: "@ps", original: "@ps", args: ["", ""], switches: [],
  });
  const sent: string[] = [];
  u.send = (m: string) => { sent.push(m); };
  await execPs(u);
  return sent.join("\n");
}

Deno.test("softcode: @psformat on #0 wraps the default block", { ...OPTS, ...SLOW }, async () => {
  await seed({ rootAttrs: { PSFORMAT: "<<<%0>>>" } });
  try {
    const out = await runPs();
    assertStringIncludes(out, "<<<");
    assertStringIncludes(out, ">>>");
    assertStringIncludes(out, "Process Queue");
  } finally {
    await cleanupQueue();
    await dbCleanup();
  }
});

Deno.test("softcode: @psrowformat on #0 overrides each row", { ...OPTS, ...SLOW }, async () => {
  await seed({ rootAttrs: { PSROWFORMAT: "ROW:[trim(%0)]" } });
  try {
    const out = await runPs();
    assertStringIncludes(out, "ROW:");
    // Header still renders because PSFORMAT not set.
    assertStringIncludes(out, "Process Queue");
  } finally {
    await cleanupQueue();
    await dbCleanup();
  }
});

Deno.test("softcode: priority — #0 attr wins over enactor attr", { ...OPTS, ...SLOW }, async () => {
  await seed({
    rootAttrs:  { PSFORMAT: "ROOT-WINS" },
    actorAttrs: { PSFORMAT: "ENACTOR" },
  });
  try {
    const out = await runPs();
    assertStringIncludes(out, "ROOT-WINS");
    assertEquals(out.includes("ENACTOR"), false);
  } finally {
    await cleanupQueue();
    await dbCleanup();
  }
});

Deno.test("softcode: priority — enactor attr used when #0 absent", { ...OPTS, ...SLOW }, async () => {
  await seed({ actorAttrs: { PSFORMAT: "FROM-ENACTOR-%0" } });
  // Wipe PSFORMAT off #0 by removing #0 entirely so two-tier falls to enactor.
  await dbojs.delete({ id: ROOT }).catch(() => {});
  try {
    const out = await runPs();
    assertStringIncludes(out, "FROM-ENACTOR-");
    assertStringIncludes(out, "Process Queue");
  } finally {
    await cleanupQueue();
    await dbCleanup();
  }
});

Deno.test("softcode: priority — neither set, default renders", { ...OPTS, ...SLOW }, async () => {
  await seed();
  try {
    const out = await runPs();
    assertStringIncludes(out, "Process Queue");
    assertStringIncludes(out, "%chTotal:%cn");
  } finally {
    await cleanupQueue();
    await dbCleanup();
    await DBO.close();
  }
});
