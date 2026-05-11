/**
 * Tests for WHOFORMAT / WHOROWFORMAT — mirrors look_formats[_integration].
 *
 * Unit-style tests drive the priority chain via the plugin-handler registry
 * (softcode attr path returns null when `u.attr.get` is stubbed to null).
 * Integration-style tests use the real dbojs + softcodeService.
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import type { IUrsamuSDK, IDBObj } from "../src/@types/UrsamuSDK.ts";
import { execWho } from "../src/commands/social.ts";
import {
  registerFormatHandler,
  unregisterFormatHandler,
  _clearFormatHandlers,
  type FormatHandler,
} from "../src/utils/formatHandlers.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };
const SLOW = { timeout: 15000 };

// ── Unit mocks ────────────────────────────────────────────────────────────

function makePlayer(id: string, name: string, doing?: string): IDBObj {
  return {
    id,
    name,
    flags: new Set(["player", "connected"]),
    state: { name, doing: doing ?? "" },
    location: "0",
    contents: [],
  } as unknown as IDBObj;
}

function makeMock(players: IDBObj[], attrGet?: (id: string, name: string) => Promise<string | null>) {
  const me = makePlayer("p1", "Alice");
  const sent: string[] = [];
  const u = {
    me,
    here: { id: "r1", flags: new Set(["room"]), state: {}, contents: [], broadcast: () => {} },
    cmd: { name: "who", original: "who", args: [], switches: [] },
    socketId: "sock-1",
    send: (m: string) => { sent.push(m); },
    db: { search: () => Promise.resolve(players) },
    attr: { get: attrGet ?? (() => Promise.resolve(null)) },
    util: { displayName: (o: IDBObj) => o.name ?? "Unknown" },
  };
  return { u: u as unknown as IUrsamuSDK, sent };
}

// ── Unit tests ────────────────────────────────────────────────────────────

Deno.test("who: no attr + no handler — default rendering", OPTS, async () => {
  _clearFormatHandlers();
  const { u, sent } = makeMock([makePlayer("p2", "Bob", "Adventuring")]);
  await execWho(u);
  assertStringIncludes(sent[0], "%chWho's Online%cn");
  assertStringIncludes(sent[0], "Bob");
  assertStringIncludes(sent[0], "Adventuring");
  assertStringIncludes(sent[0], "1 player online.");
});

Deno.test("who: WHOFORMAT handler overrides full block", OPTS, async () => {
  _clearFormatHandlers();
  const { u, sent } = makeMock([makePlayer("p2", "Bob")]);
  const fn: FormatHandler = (_u, _t, arg) => `BLOCK<<${arg.length}>>`;
  registerFormatHandler("WHOFORMAT", fn);
  try {
    await execWho(u);
  } finally {
    unregisterFormatHandler("WHOFORMAT", fn);
  }
  assertStringIncludes(sent[0], "BLOCK<<");
  assertEquals(sent[0].includes("%chWho's Online%cn"), false);
});

Deno.test("who: WHOROWFORMAT handler overrides per-row", OPTS, async () => {
  _clearFormatHandlers();
  const { u, sent } = makeMock([
    makePlayer("p2", "Bob"),
    makePlayer("p3", "Carol"),
  ]);
  const fn: FormatHandler = (_u, _t, arg) => `ROW[${arg.trim().split(/\s+/)[0]}]`;
  registerFormatHandler("WHOROWFORMAT", fn);
  try {
    await execWho(u);
  } finally {
    unregisterFormatHandler("WHOROWFORMAT", fn);
  }
  assertStringIncludes(sent[0], "ROW[Bob]");
  assertStringIncludes(sent[0], "ROW[Carol]");
  // Header/footer of the default block still present (WHOFORMAT not set).
  assertStringIncludes(sent[0], "%chWho's Online%cn");
});

Deno.test("who: handler returning null falls through to default", OPTS, async () => {
  _clearFormatHandlers();
  const { u, sent } = makeMock([makePlayer("p2", "Bob")]);
  const fn: FormatHandler = () => null;
  registerFormatHandler("WHOFORMAT", fn);
  try {
    await execWho(u);
  } finally {
    unregisterFormatHandler("WHOFORMAT", fn);
  }
  assertStringIncludes(sent[0], "%chWho's Online%cn");
  assertStringIncludes(sent[0], "Bob");
});

Deno.test("who: handler throw is swallowed; default rendering wins", OPTS, async () => {
  _clearFormatHandlers();
  const { u, sent } = makeMock([makePlayer("p2", "Bob")]);
  const fn: FormatHandler = () => { throw new Error("boom"); };
  registerFormatHandler("WHOFORMAT", fn);
  try {
    await execWho(u);
  } finally {
    unregisterFormatHandler("WHOFORMAT", fn);
  }
  assertStringIncludes(sent[0], "%chWho's Online%cn");
});

// ── Integration tests (real softcode + dbojs) ─────────────────────────────

const { dbojs, DBO } = await import("../src/services/Database/database.ts");
const { createNativeSDK } = await import("../src/services/SDK/index.ts");

const ROOT = "0";
const ACTOR = "910001";
const PEER = "910002";

async function cleanup() {
  for (const id of [ROOT, ACTOR, PEER]) {
    await dbojs.delete({ id }).catch(() => {});
  }
}

async function seed(opts: { rootAttrs?: Record<string, string>; actorAttrs?: Record<string, string> } = {}) {
  await cleanup();
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
  await dbojs.create({
    id: PEER,
    flags: "player connected",
    data: { name: "Bob", doing: "Adventuring" },
    location: ROOT,
  });
}

async function runWho(): Promise<string> {
  const u = await createNativeSDK("who-sock", ACTOR, {
    name: "who", original: "who", args: [], switches: [],
  });
  const sent: string[] = [];
  u.send = (m: string) => { sent.push(m); };
  await execWho(u);
  return sent.join("\n");
}

Deno.test("softcode: @whoformat on #0 wraps the default block", { ...OPTS, ...SLOW }, async () => {
  await seed({ rootAttrs: { WHOFORMAT: "<<<%0>>>" } });
  const out = await runWho();
  assertStringIncludes(out, "<<<");
  assertStringIncludes(out, ">>>");
  assertStringIncludes(out, "Bob");
  await cleanup();
});

Deno.test("softcode: @whorowformat on #0 overrides each row", { ...OPTS, ...SLOW }, async () => {
  await seed({ rootAttrs: { WHOROWFORMAT: "ROW:[trim(%0)]" } });
  const out = await runWho();
  assertStringIncludes(out, "ROW:");
  assertStringIncludes(out, "Bob");
  // The default WHO header still renders because WHOFORMAT isn't set.
  assertStringIncludes(out, "Who's Online");
  await cleanup();
});

Deno.test("softcode: priority — #0 attr wins over enactor attr", { ...OPTS, ...SLOW }, async () => {
  await seed({
    rootAttrs:  { WHOFORMAT: "ROOT-WINS" },
    actorAttrs: { WHOFORMAT: "ENACTOR" },
  });
  const out = await runWho();
  assertStringIncludes(out, "ROOT-WINS");
  assertEquals(out.includes("ENACTOR"), false);
  await cleanup();
});

Deno.test("softcode: priority — enactor attr used when #0 absent", { ...OPTS, ...SLOW }, async () => {
  await seed({ actorAttrs: { WHOFORMAT: "FROM-ENACTOR-%0" } });
  const out = await runWho();
  assertStringIncludes(out, "FROM-ENACTOR-");
  // The default header text is the %0 payload, so it should appear inside the wrap.
  assertStringIncludes(out, "Who's Online");
  await cleanup();
});

Deno.test("softcode: priority — neither set, default renders", { ...OPTS, ...SLOW }, async () => {
  await seed();
  const out = await runWho();
  assertStringIncludes(out, "%chWho's Online%cn");
  assertStringIncludes(out, "Bob");
  await cleanup();
  await DBO.close();
});
