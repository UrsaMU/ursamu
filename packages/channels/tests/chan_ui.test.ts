/**
 * Channel web hub layout builders.
 */
import { assertEquals } from "@std/assert";
import {
  buildWhoLayout,
  prefersWebUi,
  sendChannelHistoryUi,
  sendChannelsHub,
} from "../src/commands/chan-ui.ts";
import type { IUrsamuSDK } from "@ursamu/mush";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function mockU(opts: {
  web?: boolean;
  staff?: boolean;
  aliases?: Array<{
    alias: string;
    channel: string;
    active?: boolean;
    title?: string;
  }>;
} = {}) {
  const layouts: unknown[] = [];
  const sent: string[] = [];
  const flags = new Set(["player", "connected"]);
  if (opts.staff) {
    flags.add("admin");
  }
  const u = {
    clientType: opts.web === false ? "telnet" : "web",
    me: {
      id: "p1",
      name: "Tester",
      flags,
      state: {
        name: "Tester",
        channels: opts.aliases ?? [
          {
            id: "public",
            channel: "Public",
            alias: "pub",
            active: true,
          },
        ],
      },
    },
    ui: {
      layout: (p: unknown) => {
        layouts.push(p);
      },
    },
    send: (m: string) => {
      sent.push(m);
    },
  };
  return Object.assign(u as unknown as IUrsamuSDK, {
    _layouts: layouts,
    _sent: sent,
  });
}

type Layout = {
  meta: { type: string };
  components: Array<{
    type: string;
    title?: string;
    items?: Array<{
      label?: string;
      role?: string;
      meta?: string;
      sublabel?: string;
      badge?: string;
      action?: { cmd?: string; fill?: string };
    }>;
  }>;
};

function layoutsOf(u: IUrsamuSDK): Layout[] {
  return (u as unknown as { _layouts: Layout[] })._layouts;
}

Deno.test("prefersWebUi: web + layout", OPTS, () => {
  const u = mockU({ web: true });
  assertEquals(prefersWebUi(u), true);
  const t = mockU({ web: false });
  assertEquals(prefersWebUi(t), false);
});

Deno.test("sendChannelsHub: dense rows + join", OPTS, () => {
  const u = mockU({
    web: true,
    aliases: [{
      alias: "pub",
      channel: "Public",
      active: true,
      title: "Scout",
    }],
  });
  sendChannelsHub(u, {
    channels: [
      {
        id: "public",
        name: "Public",
        header: "[PUBLIC]",
        alias: "pub",
        online: 2,
      },
      {
        id: "staff",
        name: "Staff",
        header: "[STAFF]",
        alias: "st",
        online: 0,
      },
    ],
  });
  const ls = layoutsOf(u);
  assertEquals(ls.length, 1);
  assertEquals(ls[0].meta.type, "channels-hub");
  const comps = ls[0].components;
  const lists = comps.filter((c) => c.type === "entity-list");
  assertEquals(lists.length >= 2, true);

  // Joined Public → fill speak; role on/off
  const mine = lists[0];
  const pubAlias = mine.items?.find((i) => i.label === "pub");
  assertEquals(pubAlias?.action?.fill, "pub ");
  assertEquals(pubAlias?.role, "on");
  assertEquals(pubAlias?.meta, "Public");
  assertEquals(
    String(pubAlias?.sublabel || "").includes("Scout"),
    true,
  );

  // Available: Staff join; Public not listed
  const avail = lists.find((l) =>
    String(l.title || "").includes("Available")
  ) ?? lists[lists.length - 1];
  const staff = avail.items?.find((i) => i.label === "Staff");
  assertEquals(
    staff?.action?.cmd,
    "@channel/join Staff=st",
  );
  assertEquals(
    avail.items?.find((i) => i.label === "Public"),
    undefined,
  );

  // Alias tools use badge for alias name
  const tools = comps.find((c) =>
    c.type === "actions" &&
    String(c.title || "").includes("Alias")
  );
  assertEquals(!!tools, true);
  const mute = tools?.items?.find((i) =>
    i.label === "mute" && i.badge === "pub"
  );
  assertEquals(mute?.action?.cmd, "pub off");
});

Deno.test("sendChannelsHub: list mode metaType", OPTS, () => {
  const u = mockU({ web: true, staff: true });
  sendChannelsHub(u, {
    channels: [{
      id: "public",
      name: "Public",
      header: "[P]",
      alias: "pub",
      online: 1,
    }],
    mode: "list",
  });
  const ls = layoutsOf(u);
  assertEquals(ls[0].meta.type, "channels-list");
});

Deno.test("sendChannelsHub: telnet fallback text", OPTS, () => {
  const u = mockU({ web: false });
  sendChannelsHub(u, {
    channels: [{
      id: "public",
      name: "Public",
      header: "[P]",
      alias: "pub",
    }],
  });
  const sent = (u as unknown as { _sent: string[] })._sent;
  assertEquals(sent.length, 1);
  assertEquals(sent[0].includes("Public"), true);
});

Deno.test("buildWhoLayout: rows + actions", OPTS, () => {
  const built = buildWhoLayout({
    channel: "Public",
    alias: "pub",
    rows: [
      { name: "Alice", status: "on", isPlayer: true },
      { name: "Bot", status: "on", isPlayer: false },
    ],
  });
  assertEquals(built.metaType, "channels-who");
  const list = built.components.find((c) =>
    (c as { type?: string }).type === "entity-list"
  ) as { items?: Array<{ label?: string; meta?: string }> };
  assertEquals(list.items?.length, 2);
  assertEquals(list.items?.[0].label, "Alice");
  assertEquals(list.items?.[1].meta, "obj");
});

Deno.test("sendChannelHistoryUi: panels", OPTS, () => {
  const u = mockU({ web: true });
  sendChannelHistoryUi(u, {
    channel: "Public",
    lines: [
      {
        timestamp: Date.UTC(2026, 0, 1, 12, 0, 0),
        message: "Hello channel",
        playerName: "Alice",
      },
    ],
  });
  const ls = layoutsOf(u);
  assertEquals(ls[0].meta.type, "channels-history");
  const panels = ls[0].components.filter((c) =>
    c.type === "panel"
  );
  assertEquals(panels.length, 1);
  assertEquals(
    String((panels[0] as { content?: string }).content),
    "Hello channel",
  );
});
