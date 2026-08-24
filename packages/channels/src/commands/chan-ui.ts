/**
 * Dense web layouts for channels (/play) — mail/jobs density.
 *
 * Telnet keeps classic text listings from exec.ts.
 * Middleware (alias who/on/off) can emit layouts via emitLayout().
 */
import { sendPayload, sessions } from "@ursamu/core";
import type { IUrsamuSDK } from "@ursamu/mush";
import type { IChanEntry, IChannel } from "../types.ts";

export function prefersWebUi(u: IUrsamuSDK): boolean {
  return u.clientType === "web" &&
    typeof (u as { ui?: { layout?: unknown } }).ui?.layout ===
      "function";
}

/** True when the socket is a web /play client. */
export function socketIsWeb(socketId: string): boolean {
  try {
    const s = sessions.get(socketId) as
      | { meta?: { clientType?: string } }
      | undefined;
    return s?.meta?.clientType === "web";
  } catch {
    return false;
  }
}

/** Emit a layout payload without a full IUrsamuSDK (middleware). */
export function emitLayout(
  socketId: string,
  components: unknown[],
  metaType: string,
  textFallback = "",
): void {
  if (!socketIsWeb(socketId)) return;
  sendPayload(socketId, textFallback, {
    ui: {
      type: "layout",
      components,
      meta: { type: metaType },
    },
  });
}

export function act(cmd: string): { cmd: string } {
  return { cmd };
}

export function fill(text: string): { fill: string } {
  return { fill: text };
}

function isStaff(u: IUrsamuSDK): boolean {
  const f = u.me.flags;
  return f.has("admin") || f.has("wizard") ||
    f.has("superuser");
}

function myAliases(u: IUrsamuSDK): IChanEntry[] {
  return ((u.me.state as Record<string, unknown>).channels as
    | IChanEntry[]
    | undefined) ?? [];
}

function joinedAlias(
  aliases: IChanEntry[],
  chanName: string,
): IChanEntry | undefined {
  const n = chanName.toLowerCase();
  return aliases.find((e) =>
    String(e.channel || "").toLowerCase() === n
  );
}

function defaultAlias(chan: IChannel): string {
  const a = String(chan.alias || "").trim();
  if (a) return a.toLowerCase();
  return String(chan.name || "ch")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 6) || "ch";
}

function flagsOf(chan: IChannel): string {
  return `${chan.hidden ? "H" : "-"}${
    chan.masking ? "M" : "-"
  }${chan.logHistory ? "L" : "-"}${
    chan.announce ? "A" : "-"
  }`;
}

function onlineOf(
  channels: ChanListRow[],
  chanName: string,
): number | undefined {
  const n = chanName.toLowerCase();
  const row = channels.find((c) =>
    String(c.name || "").toLowerCase() === n
  );
  return row?.online;
}

function sendLayout(
  u: IUrsamuSDK,
  components: unknown[],
  metaType: string,
  textFallback: string,
): void {
  if (prefersWebUi(u)) {
    u.ui.layout({
      components,
      meta: { type: metaType },
    });
    return;
  }
  u.send(textFallback);
}

export type ChanListRow = IChannel & {
  online?: number;
};

type Act = {
  label: string;
  badge?: string;
  action: { cmd?: string; fill?: string };
};

/** Full hub: my aliases + available + tools. */
export function sendChannelsHub(
  u: IUrsamuSDK,
  opts: {
    channels: ChanListRow[];
    mode?: "hub" | "list" | "mine";
  },
): void {
  const aliases = myAliases(u);
  const staff = isStaff(u);
  const mode = opts.mode || "hub";
  const channels = opts.channels.filter((c) => {
    if (!c.hidden) return true;
    return staff;
  });

  // alias | on/off | channel | title · N online
  const mineItems = aliases.map((e) => {
    const on = e.active !== false;
    const online = onlineOf(channels, e.channel);
    const title = e.title ? String(e.title).slice(0, 24) : "";
    const sub = [
      title,
      online != null ? `${online} online` : "",
    ].filter(Boolean).join(" · ") || "—";
    return {
      id: e.alias,
      label: e.alias,
      role: on ? "on" : "off",
      meta: e.channel,
      sublabel: sub,
      action: fill(`${e.alias} `),
    };
  });

  // Compact controls: toggle (badge) · who · leave  per alias
  const mineActs: Act[] = [];
  for (const e of aliases.slice(0, 12)) {
    const on = e.active !== false;
    mineActs.push(
      {
        label: on ? "mute" : "unmute",
        badge: e.alias,
        action: act(`${e.alias} ${on ? "off" : "on"}`),
      },
      {
        label: "who",
        badge: e.alias,
        action: act(`${e.alias} who`),
      },
      {
        label: "leave",
        badge: e.alias,
        action: act(`@channel/leave ${e.alias}`),
      },
    );
  }

  // name | N online | flags | join as alias
  const availItems = channels
    .filter((c) => !joinedAlias(aliases, c.name))
    .map((c) => {
      const alias = defaultAlias(c);
      const fl = flagsOf(c);
      return {
        id: c.id || c.name,
        label: c.name,
        role: c.online != null
          ? `${c.online}`
          : "—",
        meta: fl !== "----" ? fl : "join",
        sublabel: `as ${alias}` +
          (c.header ? ` · ${c.header}` : ""),
        action: act(
          `@channel/join ${c.name}=${alias}`,
        ),
      };
    });

  // Full list mode (clist/full): every channel as dense row
  const listItems = mode === "list"
    ? channels.map((c) => {
      const joined = joinedAlias(aliases, c.name);
      const fl = flagsOf(c);
      return {
        id: c.id || c.name,
        label: c.name,
        role: c.online != null
          ? `${c.online}`
          : "—",
        meta: fl,
        sublabel: joined
          ? `joined · ${joined.alias}`
          : `as ${defaultAlias(c)}`,
        action: joined
          ? fill(`${joined.alias} `)
          : act(
            `@channel/join ${c.name}=${defaultAlias(c)}`,
          ),
      };
    })
    : [];

  const topActs: Act[] = [
    { label: "Refresh", action: act("@channel") },
    { label: "My aliases", action: act("comlist") },
    { label: "All on", action: act("allcom on") },
    { label: "All off", action: act("allcom off") },
    {
      label: "Join…",
      action: fill("@channel/join Channel=alias"),
    },
    {
      label: "Speak…",
      action: fill(
        aliases[0] ? `${aliases[0].alias} ` : "pub ",
      ),
    },
    {
      label: "Title…",
      action: fill("@comtitle alias=title"),
    },
  ];

  if (staff) {
    topActs.push(
      {
        label: "Create…",
        action: fill("@chancreate "),
      },
      {
        label: "History…",
        action: fill("@chanhistory "),
      },
      {
        label: "Set…",
        action: fill("@chanset chan/prop=val"),
      },
      {
        label: "Full list",
        action: act("@clist/full"),
      },
      {
        label: "Who…",
        action: fill("@cwho "),
      },
    );
  }

  const onN = aliases.filter((e) => e.active !== false).length;
  const countLine = aliases.length
    ? `${aliases.length} alias(es) · ${onN} on · ` +
      `${channels.length} channel(s)`
    : `${channels.length} channel(s) · join below`;

  const components: unknown[] = [
    { type: "header", title: "Channels" },
    { type: "text", content: countLine },
    {
      type: "actions",
      title: "Commands",
      items: topActs.slice(0, 14),
    },
  ];

  if (mode === "list") {
    components.push({
      type: "entity-list",
      title: channels.length
        ? `All channels (${channels.length})`
        : "No channels",
      items: listItems,
    });
  } else {
    if (mode !== "list") {
      components.push({
        type: "entity-list",
        title: aliases.length
          ? `Your aliases (${aliases.length})`
          : "No aliases yet",
        items: mineItems.length
          ? mineItems
          : [{
            id: "none",
            label: "(join below)",
            role: "—",
            meta: "—",
            sublabel: "click a channel to join",
          }],
      });
      if (mineActs.length) {
        components.push({
          type: "actions",
          title: "Alias tools",
          items: mineActs.slice(0, 36),
        });
      }
    }

    if (mode !== "mine") {
      components.push({
        type: "entity-list",
        title: availItems.length
          ? `Available (${availItems.length})`
          : "No open channels",
        items: availItems.length
          ? availItems
          : [{
            id: "none-a",
            label: "(all joined or none)",
            role: "—",
            meta: "—",
            sublabel: "—",
          }],
      });
    }
  }

  const textLines = [
    "--- Channels ---",
    ...aliases.map((e) =>
      `  ${e.alias} → ${e.channel}` +
      (e.active === false ? " [off]" : " [on]")
    ),
    "--- Available ---",
    ...channels.map((c) =>
      `  ${c.name}` +
        (joinedAlias(aliases, c.name)
          ? " (joined)"
          : ` (join as ${defaultAlias(c)})`)
    ),
    "  @channel/join Name=alias  ·  comlist  ·  alias text",
  ];

  sendLayout(
    u,
    components,
    mode === "list"
      ? "channels-list"
      : mode === "mine"
      ? "channels-mine"
      : "channels-hub",
    textLines.join("\n"),
  );
}

/** Compact “my aliases only” (comlist). */
export function sendMyAliasesUi(
  u: IUrsamuSDK,
  textFallback: string,
): void {
  if (!prefersWebUi(u)) {
    u.send(textFallback);
    return;
  }
  sendChannelsHub(u, {
    channels: [],
    mode: "mine",
  });
}

export type WhoRow = {
  name: string;
  status?: string;
  isPlayer?: boolean;
};

/** Build who layout parts (shared by SDK + middleware). */
export function buildWhoLayout(
  opts: {
    channel: string;
    rows: WhoRow[];
    alias?: string;
  },
): {
  components: unknown[];
  metaType: string;
  text: string;
} {
  const ch = opts.channel;
  const items = opts.rows.map((r, i) => ({
    id: `${i}-${r.name}`,
    label: r.name,
    role: r.status || "on",
    meta: r.isPlayer === false ? "obj" : "player",
    sublabel: ch,
  }));

  const acts: Act[] = [
    { label: "Hub", action: act("@channel") },
    {
      label: "Refresh",
      action: act(
        opts.alias
          ? `${opts.alias} who`
          : `@cwho ${ch}`,
      ),
    },
  ];
  if (opts.alias) {
    acts.unshift({
      label: "Speak…",
      action: fill(`${opts.alias} `),
    });
  }

  const count = items.length
    ? `${items.length} on ${ch}`
    : `Nobody on ${ch}`;

  return {
    metaType: "channels-who",
    text: [
      `Who on ${ch}:`,
      ...opts.rows.map((r) =>
        `  ${r.name}` +
        (r.status ? ` [${r.status}]` : "")
      ),
    ].join("\n"),
    components: [
      { type: "header", title: `Who · ${ch}` },
      { type: "text", content: count },
      {
        type: "entity-list",
        title: "Present",
        items: items.length
          ? items
          : [{
            id: "empty",
            label: "(empty)",
            role: "—",
            meta: "—",
            sublabel: ch,
          }],
      },
      {
        type: "actions",
        title: "Channel",
        items: acts,
      },
    ],
  };
}

/** Who-on-channel — dense list + back to hub. */
export function sendChannelWhoUi(
  u: IUrsamuSDK,
  opts: {
    channel: string;
    rows: WhoRow[];
    alias?: string;
  },
): void {
  const built = buildWhoLayout(opts);
  sendLayout(u, built.components, built.metaType, built.text);
}

/** Middleware path — emit who layout to a web socket. */
export function emitChannelWho(
  socketId: string,
  opts: {
    channel: string;
    rows: WhoRow[];
    alias?: string;
  },
): boolean {
  if (!socketIsWeb(socketId)) return false;
  const built = buildWhoLayout(opts);
  emitLayout(
    socketId,
    built.components,
    built.metaType,
    built.text,
  );
  return true;
}

export type HistLine = {
  timestamp: number;
  message: string;
  playerName?: string;
};

/** Channel history — panels for each line (readable wrap). */
export function sendChannelHistoryUi(
  u: IUrsamuSDK,
  opts: {
    channel: string;
    lines: HistLine[];
  },
): void {
  const ch = opts.channel;
  const comps: unknown[] = [
    {
      type: "header",
      title: `History · ${ch}`,
    },
    {
      type: "text",
      content: opts.lines.length
        ? `Last ${opts.lines.length} line(s)`
        : "No history logged.",
    },
  ];

  for (let i = 0; i < opts.lines.length; i++) {
    const line = opts.lines[i];
    const when = Number.isFinite(line.timestamp)
      ? new Date(line.timestamp).toUTCString()
      : "";
    const who = line.playerName
      ? String(line.playerName).slice(0, 24)
      : "";
    const title = [
      `#${i + 1}`,
      who,
      when,
    ].filter(Boolean).join(" · ");
    comps.push({
      type: "panel",
      title: title || `Line ${i + 1}`,
      content: String(line.message || "").slice(0, 2000),
    });
  }

  comps.push({
    type: "actions",
    title: "Channel",
    items: [
      { label: "Hub", action: act("@channel") },
      {
        label: "More…",
        action: fill(`@chanhistory ${ch}=`),
      },
      {
        label: "Refresh",
        action: act(
          `@chanhistory ${ch}=${Math.max(opts.lines.length, 20)}`,
        ),
      },
    ],
  });

  sendLayout(
    u,
    comps,
    "channels-history",
    [
      `History ${ch}:`,
      ...opts.lines.map((l) =>
        `  [${new Date(l.timestamp).toUTCString()}] ` +
        l.message
      ),
    ].join("\n"),
  );
}

/** After join/leave/mute — rebuild hub with fresh channel list. */
export async function refreshChannelsHub(
  u: IUrsamuSDK,
): Promise<void> {
  if (!prefersWebUi(u)) return;
  const list = (await u.chan.list()) as ChanListRow[];
  try {
    const { rooms } = await import("jsr:@ursamu/core@^1.0.0");
    for (const c of list) {
      try {
        c.online = rooms.members(c.name).length;
      } catch {
        c.online = undefined;
      }
    }
  } catch {
    /* core rooms optional */
  }
  sendChannelsHub(u, { channels: list, mode: "hub" });
}
