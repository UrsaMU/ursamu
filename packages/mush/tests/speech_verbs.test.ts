/**
 * Core speech verbs: say, pose, think, page (usage guards + format).
 */
import {
  assertEquals,
  assertStringIncludes,
} from "@std/assert";
import {
  execPage,
  execPose,
  execSay,
  execThink,
} from "../src/verbs/say.ts";
import type { IDBObj, IUrsamuSDK } from "../src/commands/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function mockU(opts: {
  args?: string[];
  original?: string;
  me?: Partial<IDBObj>;
  targetResult?: IDBObj | null;
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
      name: "",
      original: opts.original ?? "",
      args: opts.args ?? [],
      switches: [],
    },
    socketId: "s1",
    send: (m: string) => {
      sent.push(m);
    },
    broadcast: () => {},
    evalString: (s: string) => Promise.resolve(s),
    trigger: () => Promise.resolve(),
    db: {
      search: () => Promise.resolve([]),
      modify: () => Promise.resolve(),
    },
    util: {
      target: () => Promise.resolve(opts.targetResult ?? null),
      displayName: (o: IDBObj) => o.name ?? "Unknown",
      stripSubs: (s: string) => s,
    },
  } as unknown as IUrsamuSDK;

  return Object.assign(u, { _sent: sent, _broadcasts: broadcasts });
}

Deno.test("execSay: empty prompts", OPTS, async () => {
  const u = mockU({ args: [""] });
  await execSay(u);
  assertEquals(u._sent[0], "What do you want to say?");
  assertEquals(u._broadcasts.length, 0);
});

Deno.test("execSay: broadcasts say line", OPTS, async () => {
  const u = mockU({ args: ["hello world"] });
  await execSay(u);
  assertEquals(u._broadcasts.length, 1);
  assertStringIncludes(u._broadcasts[0], "Tester");
  assertStringIncludes(u._broadcasts[0], "says,");
  assertStringIncludes(u._broadcasts[0], "hello world");
});

Deno.test("execPose: empty prompts", OPTS, async () => {
  const u = mockU({ args: [""] });
  await execPose(u);
  assertEquals(u._sent[0], "Pose what?");
});

Deno.test("execPose: space pose", OPTS, async () => {
  const u = mockU({
    args: ["waves"],
    original: ":waves",
  });
  await execPose(u);
  assertEquals(u._broadcasts.length, 1);
  assertStringIncludes(u._broadcasts[0], "Tester waves");
});

Deno.test("execPose: semipose joins name", OPTS, async () => {
  const u = mockU({
    args: ["'s phone rings"],
    original: ";'s phone rings",
  });
  await execPose(u);
  assertStringIncludes(u._broadcasts[0], "Tester's phone rings");
});

Deno.test("execThink: empty and private", OPTS, async () => {
  const empty = mockU({ args: [""] });
  await execThink(empty);
  assertEquals(empty._sent[0], "What do you want to think?");

  const u = mockU({ args: ["secret"] });
  await execThink(u);
  assertEquals(u._sent[0], "secret");
  assertEquals(u._broadcasts.length, 0);
});

Deno.test("execPage: usage without equals", OPTS, async () => {
  const u = mockU({ args: ["nobody"] });
  await execPage(u);
  assertEquals(u._sent[0], "Usage: page <target>=<message>");
});
