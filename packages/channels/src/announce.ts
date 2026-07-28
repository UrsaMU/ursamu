/**
 * Channel presence announcements (connect / disconnect / join / leave).
 *
 * Uses rooms.broadcast only — never emits channel:message — so Discord
 * channel bridges do not mirror these system lines.
 */

import { DBO, getConfig, dbojs } from "@ursamu/mush";
import { rooms } from "@ursamu/core";
import type { IChannel, IChanEntry } from "./types.ts";

const chans = new DBO<IChannel>(() =>
  getConfig<string>("plugins.channels.db", "server.chans"),
);

function monikerOf(obj: {
  data?: Record<string, unknown>;
  id: string;
}): string {
  return (
    (obj.data?.moniker as string) ||
    (obj.data?.name as string) ||
    obj.id
  );
}

function headerOf(chan: IChannel): string {
  return chan.header || `[${chan.name.toUpperCase()}]`;
}

/** True when the channel should post presence lines. */
export function channelAnnounces(chan: IChannel | null | undefined): boolean {
  return Boolean(chan?.announce);
}

/**
 * Broadcast a system line to one channel (no Discord / history).
 * Joins use both name and id room keys — fan out to both.
 */
export function broadcastAnnounce(
  chan: IChannel,
  text: string,
): void {
  if (!channelAnnounces(chan)) return;
  const line = `${headerOf(chan)} ${text}`;
  const keys = new Set<string>([chan.name, chan.id]);
  if (chan.alias) keys.add(chan.alias);
  for (const key of keys) {
    if (key) rooms.broadcast(key, line);
  }
}

/**
 * Announce connect or disconnect on every announce-enabled channel
 * the player is actively subscribed to.
 */
export async function announcePresence(
  playerId: string,
  kind: "connect" | "disconnect",
): Promise<void> {
  const player = await dbojs.queryOne({ id: playerId });
  if (!player) return;

  const name = monikerOf(player);
  const entries = (player.data?.channels ?? []) as IChanEntry[];
  if (!entries.length) return;

  const all = (await chans.query({})) as IChannel[];
  const byName = new Map(
    all.map((c) => [c.name.toLowerCase(), c]),
  );

  const verb = kind === "connect" ? "connected" : "disconnected";
  const line = `${name} has ${verb}.`;

  const seen = new Set<string>();
  for (const entry of entries) {
    if (entry.active === false) continue;
    const key = entry.channel.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const chan = byName.get(key);
    if (!chan) continue;
    broadcastAnnounce(chan, line);
  }
}

/**
 * Announce join/leave on a single channel when announce is on.
 */
export async function announceChannelMember(
  channelName: string,
  playerName: string,
  kind: "join" | "leave",
): Promise<void> {
  const want = channelName.toLowerCase();
  const all = (await chans.query({})) as IChannel[];
  const chan = all.find(
    (c) =>
      c.name.toLowerCase() === want ||
      c.id.toLowerCase() === want,
  );
  if (!chan || !channelAnnounces(chan)) return;

  const line = kind === "join"
    ? `${playerName} has joined the channel.`
    : `${playerName} has left the channel.`;
  broadcastAnnounce(chan, line);
}
