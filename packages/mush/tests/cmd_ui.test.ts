/**
 * Shared interactive command UI helpers.
 */
import { assertEquals } from "@std/assert";
import {
  buildListComponents,
  cmdAction,
  getCmdUiTheme,
  lookAction,
  prefersCmdUi,
  renderListText,
  sendListLayout,
} from "../src/verbs/cmd-ui.ts";
import type { IUrsamuSDK } from "../src/commands/types.ts";
import { setConfig } from "@ursamu/core";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function mockU(opts: {
  clientType?: string;
  layouts?: unknown[];
  sent?: string[];
} = {}): IUrsamuSDK {
  const layouts = opts.layouts ?? [];
  const sent = opts.sent ?? [];
  return {
    clientType: opts.clientType ?? "web",
    me: {
      id: "1",
      name: "Tester",
      flags: new Set(["player", "connected"]),
      state: { name: "Tester", termWidth: 78 },
      location: "r1",
      contents: [],
    },
    ui: {
      layout: (o: unknown) => {
        layouts.push(o);
      },
      panel: () => ({}),
      render: (t: string) => t,
    },
    send: (m: string) => {
      sent.push(m);
    },
    util: {
      displayName: (o: { name?: string }) => o.name ?? "?",
    },
  } as unknown as IUrsamuSDK;
}

Deno.test("prefersCmdUi: web with layout only", OPTS, () => {
  assertEquals(prefersCmdUi(mockU({ clientType: "web" })), true);
  assertEquals(
    prefersCmdUi(mockU({ clientType: "telnet" })),
    false,
  );
});

Deno.test("buildListComponents: header list text", OPTS, () => {
  const comps = buildListComponents({
    metaType: "demo",
    title: "Demo",
    items: [
      {
        label: "Sword",
        action: cmdAction("look #9"),
      },
    ],
    emptyText: "Nothing.",
    footerText: "1 item.",
  });
  assertEquals(comps.map((c) => c.type), [
    "header",
    "entity-list",
    "text",
  ]);
  assertEquals(comps[0].title, "Demo");
  const list = comps[1];
  assertEquals(
    (list.items as { action?: { cmd: string } }[])[0]
      .action?.cmd,
    "look #9",
  );
});

Deno.test("lookAction respects theme.lookOnClick", OPTS, () => {
  setConfig("plugins.globals.theme.cmdUi", {
    lookOnClick: false,
  });
  assertEquals(getCmdUiTheme().lookOnClick, false);
  assertEquals(lookAction("Alice"), undefined);
  setConfig("plugins.globals.theme.cmdUi", {
    lookOnClick: true,
  });
  assertEquals(lookAction("Alice")?.cmd, "look Alice");
  setConfig("plugins.globals.theme.cmdUi", {});
});

Deno.test("sendListLayout: web uses layout not send", OPTS, () => {
  const layouts: unknown[] = [];
  const sent: string[] = [];
  const u = mockU({ clientType: "web", layouts, sent });
  sendListLayout(u, {
    metaType: "inventory",
    title: "Bag",
    items: [{ label: "Key", action: cmdAction("look #3") }],
    emptyText: "Empty",
    footerText: "1 item.",
  });
  assertEquals(layouts.length, 1);
  assertEquals(sent.length, 0);
  const body = layouts[0] as {
    meta: { type: string };
    components: unknown[];
  };
  assertEquals(body.meta.type, "inventory");
  assertEquals(body.components.length, 3);
});

Deno.test("sendListLayout: telnet uses text chrome", OPTS, () => {
  const layouts: unknown[] = [];
  const sent: string[] = [];
  const u = mockU({ clientType: "telnet", layouts, sent });
  sendListLayout(u, {
    metaType: "inventory",
    title: "Bag",
    items: [{ label: "Key" }],
    emptyText: "Empty",
    footerText: "1 item.",
  });
  assertEquals(layouts.length, 0);
  assertEquals(sent.length, 1);
  assertEquals(sent[0].includes("Key"), true);
  assertEquals(sent[0].includes("1 item."), true);
});

Deno.test("renderListText: empty list", OPTS, () => {
  const u = mockU({ clientType: "telnet" });
  const t = renderListText(u, {
    metaType: "x",
    title: "Bag",
    items: [],
    emptyText: "Nothing here.",
    footerText: "0 items.",
  });
  assertEquals(t.includes("Nothing here."), true);
  assertEquals(t.includes("0 items."), true);
});
