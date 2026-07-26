/**
 * Two-way channel bridge helpers.
 * Game → Discord uses webhooks (existing).
 * Discord → game uses injectChannelMessage + source flag.
 */

import { DBO, rooms, sessions, send } from "@ursamu/mush";
import { clean, stripMushMarkup } from "./helpers.ts";
import { getWebhookUrl } from "./config.ts";
import { postWebhook } from "./webhook.ts";

export interface IChannelMessageEvent {
  channelName: string;
  senderId: string;
  senderName: string;
  message: string;
  /** Origin of the message — skip Discord outbound when "discord". */
  source?: "game" | "discord";
}

interface IChanRow {
  id: string;
  name: string;
  header?: string;
  alias?: string;
}

/**
 * Outbound: game channel speech → Discord webhook.
 * Skips messages that originated from Discord (loop prevention).
 */
export async function onGameChannelMessage(
  ev: IChannelMessageEvent,
): Promise<void> {
  if (ev.source === "discord") return;
  const url = await getWebhookUrl(ev.channelName.toLowerCase());
  if (!url) return;

  const { getDiscordConfig } = await import("./config.ts");
  const { resolveAvatar } = await import("./helpers.ts");
  const cfg = await getDiscordConfig();
  const avatar = await resolveAvatar(
    ev.senderId,
    ev.senderName,
    cfg.publicUrl,
  );
  console.log(
    `[discord] outbound ${ev.channelName} id=${ev.senderId} ` +
      `avatar=${avatar ?? "(none)"}`,
  );
  postWebhook(url, {
    username: clean(ev.senderName),
    ...(avatar ? { avatar_url: avatar } : {}),
    content: stripMushMarkup(ev.message).slice(0, 2000),
  });
}

/**
 * Format inbound Discord text for a game channel line (no header).
 * Returns null if empty after sanitize.
 */
export function formatDiscordChannelBody(
  displayName: string,
  rawText: string,
): string | null {
  const who = clean(displayName);
  const text = rawText
    .replace(/\r\n/g, "\n")
    .replace(/\n+/g, " ")
    .trim()
    .slice(0, 1500);
  if (!text) return null;

  if (text.startsWith(":")) {
    return `[Discord] ${who} ${text.slice(1).trim()}`;
  }
  if (text.startsWith(";")) {
    return `[Discord] ${who}${text.slice(1).trim()}`;
  }
  return `[Discord] ${who} says, "${text}"`;
}

/** Resolve a game channel by id, name, or alias (case-insensitive). */
export async function resolveGameChannel(
  raw: string,
): Promise<IChanRow | null> {
  const key = raw.toLowerCase().trim();
  if (!key) return null;

  const chans = new DBO<IChanRow>("server.chans");
  const all = await chans.all();
  const hit = all.find((c) => {
    const id = String(c.id ?? "").toLowerCase();
    const name = String(c.name ?? "").toLowerCase();
    const alias = String(c.alias ?? "").toLowerCase();
    return id === key || name === key || alias === key;
  });
  return hit ?? null;
}

/**
 * Deliver a line to everyone listening on a game channel.
 * Tries room membership first; falls back to scanning player
 * data.channels so Discord traffic is not dropped when the room
 * key does not match joinChans' room name.
 */
async function deliverToGameChannel(
  chan: IChanRow,
  line: string,
): Promise<number> {
  const roomKeys = new Set<string>([
    chan.name,
    chan.id,
    chan.name.toLowerCase(),
    chan.id.toLowerCase(),
  ]);
  if (chan.alias) roomKeys.add(chan.alias);

  const seen = new Set<string>();
  for (const key of roomKeys) {
    for (const sid of rooms.members(key)) {
      seen.add(sid);
    }
  }

  // Fallback: any connected session whose player has this channel.
  if (seen.size === 0) {
    try {
      const { dbojs } = await import("@ursamu/mush");
      for (const s of sessions.list()) {
        const actorId = (s as { actorId?: string }).actorId;
        if (!actorId) continue;
        const p = await dbojs.queryOne({ id: actorId });
        if (!p) continue;
        const list = (p.data?.channels ?? []) as Array<{
          channel?: string;
          id?: string;
          alias?: string;
          active?: boolean;
        }>;
        const on = list.some((e) => {
          if (e.active === false) return false;
          const cn = String(e.channel ?? "").toLowerCase();
          const cid = String(e.id ?? "").toLowerCase();
          const al = String(e.alias ?? "").toLowerCase();
          return (
            cn === chan.name.toLowerCase() ||
            cid === chan.id.toLowerCase() ||
            (chan.alias != null && al === chan.alias.toLowerCase())
          );
        });
        if (on) seen.add(s.socketId);
      }
    } catch (e: unknown) {
      console.error("[discord] deliver fallback failed:", e);
    }
  }

  if (seen.size === 0) {
    console.warn(
      `[discord] inject: no listeners for channel ` +
        `${chan.name} (${chan.id})`,
    );
    return 0;
  }

  send([...seen], line);
  return seen.size;
}

/**
 * Inbound: inject a Discord message into a game channel.
 * Does not re-emit channel:message — caller emits with source:"discord".
 */
export async function injectChannelMessage(opts: {
  channelName: string;
  displayName: string;
  text: string;
}): Promise<boolean> {
  const chan = await resolveGameChannel(opts.channelName);
  if (!chan) {
    const chans = new DBO<IChanRow>("server.chans");
    const known = (await chans.all()).map(
      (c) => `${c.id}/${c.name}/${c.alias ?? ""}`,
    );
    console.warn(
      `[discord] inject: unknown channel ` +
        `"${opts.channelName}" known=[${known.join(", ")}]`,
    );
    return false;
  }

  const body = formatDiscordChannelBody(opts.displayName, opts.text);
  if (!body) return false;

  const header = chan.header ? `${chan.header} ` : "";
  const line = `${header}${body}`;
  const n = await deliverToGameChannel(chan, line);
  console.log(
    `[discord] inject → ${chan.name} ` +
      `(${n} listener${n === 1 ? "" : "s"})`,
  );
  return true;
}
