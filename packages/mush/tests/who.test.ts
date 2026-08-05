/**
 * who — layout chrome (header/divider/footer) + web entity list.
 */
import {
  assertEquals,
  assertStringIncludes,
} from "@std/assert";
import { execWho } from "../src/verbs/social.ts";
import type { IDBObj, IUrsamuSDK } from "../src/commands/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function player(
  id: string,
  name: string,
  extra: Partial<IDBObj> = {},
): IDBObj {
  return {
    id,
    name,
    flags: new Set(["player", "connected"]),
    state: {
      name,
      lastCommand: Date.now() - 30_000,
      doing: "Testing",
    },
    location: "r1",
    contents: [],
    ...extra,
  } as IDBObj;
}

function mockU(opts: {
  clientType?: "web" | "telnet";
  players?: IDBObj[];
} = {}) {
  const sent: string[] = [];
  const layouts: unknown[] = [];
  const players = opts.players ?? [
    player("p1", "Alice"),
    player("p2", "Bob"),
  ];
  const me = players[0] ?? player("me", "Me");

  const u = {
    me,
    clientType: opts.clientType ?? "telnet",
    here: {
      id: "r1",
      name: "Room",
      flags: new Set(["room"]),
      state: {},
      location: "",
      contents: [],
      broadcast: () => {},
    },
    cmd: {
      name: "who",
      original: "who",
      args: [],
      switches: [],
    },
    socketId: "sock1",
    send: (m: string) => sent.push(m),
    db: {
      search: async () => players,
    },
    util: {
      displayName: (o: IDBObj) =>
        String(o.state?.name || o.name || "Unknown"),
      stripSubs: (s: string) => s,
    },
    ui: {
      layout: (opt: unknown) => {
        layouts.push(opt);
      },
    },
  } as unknown as IUrsamuSDK;

  return Object.assign(u, { _sent: sent, _layouts: layouts });
}

Deno.test("who telnet: header divider footer chrome", OPTS, async () => {
  const u = mockU({ clientType: "telnet" });
  await execWho(u);
  assertEquals(u._layouts.length, 0);
  assertEquals(u._sent.length, 1);
  const out = u._sent[0] ?? "";
  // header()/footer() use layout fillers; title present
  assertStringIncludes(out, "Who");
  assertStringIncludes(out, "Alice");
  assertStringIncludes(out, "Bob");
  assertStringIncludes(out, "2 players online");
  // divider lines or section structure
  assertEquals(out.includes("Idle") || out.includes("Doing"), true);
});

Deno.test("who web: entity-list layout, no plain send", OPTS, async () => {
  const u = mockU({ clientType: "web" });
  await execWho(u);
  assertEquals(u._sent.length, 0);
  assertEquals(u._layouts.length, 1);
  const lay = u._layouts[0] as {
    components: Array<Record<string, unknown>>;
    meta?: { type?: string };
  };
  assertEquals(lay.meta?.type, "who");
  const header = lay.components.find((c) => c.type === "header");
  assertEquals(header?.title, "Who's Online");
  const list = lay.components.find(
    (c) => c.type === "entity-list",
  ) as { items?: Array<Record<string, unknown>> };
  assertEquals(list?.items?.length, 2);
  const alice = list?.items?.[0];
  assertEquals(alice?.label, "Alice");
  assertEquals(
    (alice?.action as { cmd?: string })?.cmd,
    "look Alice",
  );
});

Deno.test("who web: empty list still layouts", OPTS, async () => {
  const u = mockU({ clientType: "web", players: [] });
  // me still needed
  (u as { me: IDBObj }).me = player("solo", "Solo");
  (u as { me: IDBObj }).me.flags = new Set(["player"]);
  await execWho(u);
  assertEquals(u._layouts.length, 1);
  const lay = u._layouts[0] as {
    components: Array<Record<string, unknown>>;
  };
  const list = lay.components.find(
    (c) => c.type === "entity-list",
  ) as { items?: unknown[] };
  assertEquals(list?.items?.length, 0);
});
