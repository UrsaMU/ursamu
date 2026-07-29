/**
 * Unit tests for ooc speech helpers and execOoc.
 */
import {
  assertEquals,
  assertStringIncludes,
} from "@std/assert";
import {
  buildOocBody,
  defaultOocLine,
  execOoc,
  parseOocInput,
} from "../src/verbs/ooc.ts";
import type { IDBObj, IUrsamuSDK } from "../src/commands/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("parseOocInput: say / pose / semi", OPTS, () => {
  assertEquals(parseOocInput("hello there"), {
    mode: "say",
    text: "hello there",
  });
  assertEquals(parseOocInput(":waves"), {
    mode: "pose",
    text: "waves",
  });
  assertEquals(parseOocInput(";'s phone rings"), {
    mode: "semi",
    text: "'s phone rings",
  });
  assertEquals(parseOocInput("  :  nods"), {
    mode: "pose",
    text: "nods",
  });
});

Deno.test("buildOocBody formats say pose semi", OPTS, () => {
  assertEquals(
    buildOocBody("Alice", "say", "hi"),
    'Alice says, "hi"',
  );
  assertEquals(
    buildOocBody("Alice", "pose", "waves"),
    "Alice waves",
  );
  assertEquals(
    buildOocBody("Alice", "semi", "'s phone buzzes"),
    "Alice's phone buzzes",
  );
});

Deno.test("defaultOocLine uses red <OOC> prefix", OPTS, () => {
  assertEquals(
    defaultOocLine('Bob says, "brb"'),
    '%cr<OOC>%cn Bob says, "brb"',
  );
});

function mockU(opts: {
  args?: string[];
  me?: Partial<IDBObj>;
  formatResult?: string | null;
} = {}) {
  const sent: string[] = [];
  const broadcasts: string[] = [];
  const me = {
    id: "p1",
    name: "Tester",
    flags: new Set(["player", "connected"]),
    state: { name: "Tester" },
    location: "r1",
    contents: [],
    ...opts.me,
  } as IDBObj;

  const u = {
    me,
    here: {
      id: "r1",
      name: "Room",
      flags: new Set(["room"]),
      state: {},
      location: "",
      contents: [],
      broadcast: (m: string) => {
        broadcasts.push(m);
      },
    },
    cmd: {
      name: "ooc",
      original: `ooc ${opts.args?.[0] ?? ""}`,
      args: opts.args ?? [],
      switches: [],
    },
    socketId: "sock1",
    send: (m: string) => sent.push(m),
    evalString: (s: string) => Promise.resolve(s),
    util: {
      displayName: (o: IDBObj) =>
        String(o.state?.name || o.name || "Unknown"),
      stripSubs: (s: string) => s,
    },
    attr: {
      get: () =>
        Promise.resolve(
          opts.formatResult === undefined
            ? null
            : opts.formatResult,
        ),
    },
  } as unknown as IUrsamuSDK;

  return Object.assign(u, { _sent: sent, _broadcasts: broadcasts });
}

Deno.test("execOoc: default say line", OPTS, async () => {
  const u = mockU({ args: ["brb five"] });
  await execOoc(u);
  assertEquals(u._broadcasts.length, 1);
  assertEquals(
    u._broadcasts[0],
    '%cr<OOC>%cn Tester says, "brb five"',
  );
});

Deno.test("execOoc: pose with colon", OPTS, async () => {
  const u = mockU({ args: [":waves"] });
  await execOoc(u);
  assertEquals(
    u._broadcasts[0],
    "%cr<OOC>%cn Tester waves",
  );
});

Deno.test("execOoc: empty asks for text", OPTS, async () => {
  const u = mockU({ args: [""] });
  await execOoc(u);
  assertEquals(u._broadcasts.length, 0);
  assertStringIncludes(u._sent.join("\n"), "OOC what");
});
