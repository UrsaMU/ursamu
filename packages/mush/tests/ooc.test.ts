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
  webChat?: boolean;
} = {}) {
  const sent: string[] = [];
  const broadcasts: string[] = [];
  const broadcastOpts: unknown[] = [];
  const st = {
    name: "Tester",
    ...(opts.webChat === false ? { webChat: false } : {}),
    ...(opts.me?.state as Record<string, unknown> | undefined),
  };
  const me = {
    id: "p1",
    name: "Tester",
    flags: new Set(["player", "connected"]),
    location: "r1",
    contents: [],
    ...opts.me,
    state: {
      ...st,
      ...((opts.me?.state as Record<string, unknown>) ?? {}),
    },
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
      broadcast: (m: string, opts?: unknown) => {
        broadcasts.push(m);
        if (opts !== undefined) broadcastOpts.push(opts);
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

  return Object.assign(u, {
    _sent: sent,
    _broadcasts: broadcasts,
    _broadcastOpts: broadcastOpts,
  });
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

Deno.test("execOoc: web chat payload when chat on", OPTS, async () => {
  const u = mockU({ args: ["brb"] });
  await execOoc(u);
  assertEquals(u._broadcasts.length, 1);
  assertEquals(u._broadcastOpts.length, 1);
  const opts = u._broadcastOpts[0] as {
    data?: { ui?: Record<string, unknown> };
  };
  const ui = opts?.data?.ui;
  assertEquals(ui?.type, "chat");
  assertEquals(ui?.kind, "ooc");
  assertEquals(ui?.oocMode, "say");
  assertEquals(ui?.text, "brb");
  assertEquals(ui?.tag, "OOC");
});

Deno.test("execOoc: no chat payload when +chat off", OPTS, async () => {
  const u = mockU({ args: ["hi"], webChat: false });
  await execOoc(u);
  assertEquals(u._broadcasts.length, 1);
  const opts = u._broadcastOpts[0] as {
    data?: unknown;
    reality?: string;
  };
  assertEquals(opts?.data, undefined);
  assertEquals(opts?.reality, "material");
});
