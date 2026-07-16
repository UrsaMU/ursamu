/**
 * Two-way channel bridge helpers.
 * Game → Discord uses webhooks (existing).
 * Discord → game uses injectChannelMessage + source flag.
 */

import { DBO, rooms } from "@ursamu/core";
import { clean, toLatin1 } from "./helpers.ts";
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
  header: string;
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

  // Dynamic import to avoid circular hard deps in tests
  const { getDiscordConfig } = await import("./config.ts");
  const { resolveAvatar } = await import("./helpers.ts");
  const cfg = await getDiscordConfig();
  const avatar = await resolveAvatar(
    ev.senderId,
    ev.senderName,
    cfg.publicUrl,
  );
  postWebhook(url, {
    username: clean(ev.senderName),
    avatar_url: avatar,
    content: ev.message.slice(0, 2000),
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

/**
 * Inbound: inject a Discord message into a game channel.
 * Does not re-emit channel:message — caller emits with source:"discord".
 */
export async function injectChannelMessage(opts: {
  channelName: string;
  displayName: string;
  text: string;
}): Promise<boolean> {
  // Query by `id` (always lowercase) — `name` preserves input case
  // and may not match a lowercased lookup.
  const id = opts.channelName.toLowerCase().trim();
  const chans = new DBO<IChanRow>("server.chans");
  const allChans = await chans.all();
  console.log(`[discord] All channels in DB:`, JSON.stringify(allChans));
  const chan = await chans.queryOne({ id });
  if (!chan) {
    console.warn(`[discord] inject: unknown channel "${id}"`);
    return false;
  }

  const body = formatDiscordChannelBody(opts.displayName, opts.text);
  if (!body) return false;

  const header = chan.header ? `${chan.header} ` : "";
  rooms.broadcast(chan.name, `${header}${body}`);
  return true;
}
