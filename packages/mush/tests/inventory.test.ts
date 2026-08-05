/**
 * inventory — layout chrome + web entity list.
 */
import {
  assertEquals,
  assertStringIncludes,
} from "@std/assert";
import {
  execInventory,
  renderInventoryText,
} from "../src/verbs/home.ts";
import type { IDBObj, IUrsamuSDK } from "../src/commands/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function mockItem(id: string, name: string): IDBObj {
  return {
    id,
    name,
    flags: new Set(),
    state: { name },
    location: "p1",
    contents: [],
  } as IDBObj;
}

function mockU(opts: {
  clientType?: "web" | "telnet";
  items?: IDBObj[];
} = {}) {
  const sent: string[] = [];
  const layouts: unknown[] = [];
  const items = opts.items ?? [mockItem("t1", "Sword")];
  const me = {
    id: "p1",
    name: "Tester",
    flags: new Set(["player", "connected"]),
    state: { name: "Tester" },
    location: "r1",
    contents: items,
  } as IDBObj;

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
      name: "inventory",
      original: "inventory",
      args: [],
      switches: [],
    },
    socketId: "s1",
    send: (m: string) => sent.push(m),
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

Deno.test("inventory telnet: header footer items", OPTS, async () => {
  const u = mockU({ clientType: "telnet" });
  await execInventory(u);
  assertEquals(u._layouts.length, 0);
  const out = u._sent.join("\n");
  assertStringIncludes(out, "Inventory");
  assertStringIncludes(out, "Sword");
  assertStringIncludes(out, "1 item");
});

Deno.test("inventory web: entity-list layout", OPTS, async () => {
  const u = mockU({
    clientType: "web",
    items: [mockItem("t1", "Lamp"), mockItem("t2", "Key")],
  });
  await execInventory(u);
  assertEquals(u._sent.length, 0);
  assertEquals(u._layouts.length, 1);
  const lay = u._layouts[0] as {
    meta?: { type?: string };
    components: Array<Record<string, unknown>>;
  };
  assertEquals(lay.meta?.type, "inventory");
  const list = lay.components.find(
    (c) => c.type === "entity-list",
  ) as { items?: Array<Record<string, unknown>> };
  assertEquals(list?.items?.length, 2);
  assertEquals(
    (list?.items?.[0]?.action as { cmd?: string })?.cmd,
    "look #t1",
  );
});

Deno.test("inventory empty message", OPTS, async () => {
  const u = mockU({ clientType: "telnet", items: [] });
  await execInventory(u);
  assertStringIncludes(
    u._sent.join("\n"),
    "not carrying anything",
  );
});

Deno.test("renderInventoryText export", OPTS, () => {
  const u = mockU();
  const text = renderInventoryText(u, [mockItem("x", "Cup")]);
  assertStringIncludes(text, "Cup");
});
