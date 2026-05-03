/**
 * @module utils/session
 *
 * Player session utilities: idle time formatting, socket lookup,
 * player resolution, channel setup, and moniker display.
 */
import type { IChanEntry } from "../@types/Channels.ts";
import type { IContext } from "../@types/IContext.ts";
import type { IDBOBJ } from "../@types/IDBObj.ts";
import type { UserSocket } from "../@types/IMSocket.ts";
import { chans, dbojs } from "../services/Database/index.ts";
import { send } from "../services/broadcast/index.ts";
import { flags } from "../services/flags/flags.ts";
import { wsService } from "../services/WebSocket/index.ts";

// ---------------------------------------------------------------------------
// Moniker
// ---------------------------------------------------------------------------

/** Return the object's moniker (custom display name), falling back to its data name. */
export const moniker = (obj: IDBOBJ): string =>
  (obj.data?.moniker as string | undefined) || (obj.data?.name as string | undefined) || "";

// ---------------------------------------------------------------------------
// Socket & player resolution
// ---------------------------------------------------------------------------

/** Look up the connected socket for a DB object ID. */
export const getSocket = (id: string): UserSocket | undefined =>
  wsService.getConnectedSockets().find(s => s.cid === id);

/** Fetch the DB object for an authenticated socket. Returns null when unauthenticated. */
export const playerForSocket = async (socket: UserSocket): Promise<IDBOBJ | null | undefined> => {
  if (!socket.cid) return null;
  return await dbojs.queryOne({ id: socket.cid });
};

// ---------------------------------------------------------------------------
// Idle time display
// ---------------------------------------------------------------------------

/**
 * Format a timestamp (ms since epoch) as a colored idle-time string.
 * Colors shift from green → yellow → red as idle time grows.
 */
export const idle = (secs: number): string => {
  const snds = secs ? Math.round((Date.now() - secs) / 1000) : 0;
  let time: string;

  if      (snds < 60)       time = `${snds}s`;
  else if (snds < 3600)     time = `${Math.floor(snds / 60)}m`;
  else if (snds < 86400)    time = `${Math.floor(snds / 3600)}h`;
  else if (snds < 604800)   time = `${Math.floor(snds / 86400)}d`;
  else if (snds < 2419200)  time = `${Math.floor(snds / 604800)}w`;
  else if (snds < 29030400) time = `${Math.floor(snds / 2592000)}mo`;
  else                      time = `${Math.floor(snds / 31536000)}y`;

  const IDLE_GREEN  = 600;   // 10 minutes
  const IDLE_YELLOW = 1500;  // 25 minutes
  const IDLE_RED    = 3600;  // 1 hour

  if (snds < IDLE_GREEN)  return `%ch%cg${time}%cn`;
  if (snds < IDLE_YELLOW) return `%ch%cy${time}%cn`;
  if (snds < IDLE_RED)    return `%ch%cr${time}%cn`;
  return `%ch%cx${time}%cn`;
};

// ---------------------------------------------------------------------------
// Channel setup
// ---------------------------------------------------------------------------

/**
 * Join a player to all channels they have access to, synchronising their
 * channel list and the socket's channel rooms.
 */
export const joinChans = async (ctx: IContext): Promise<void> => {
  const player = await playerForSocket(ctx.socket);
  if (!player) return;

  const channels = await chans.query({});
  ctx.socket.join(`#${player.location}`);
  ctx.socket.join(`#${player.id}`);

  player.data ||= {};
  player.data.channels ||= [];
  let userChans = player.data.channels as IChanEntry[];

  // Deduplicate existing entries
  const seen = new Set<string>();
  userChans = userChans.filter(ch => {
    const key = ch.channel.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  let changed = (player.data.channels as IChanEntry[]).length !== userChans.length;

  for (const channel of channels) {
    if (!channel.alias) continue;
    const hasAccess = flags.check(player.flags || "", channel.lock || "");
    const existing  = userChans.find(ch => ch.channel === channel.name);

    if (hasAccess && !existing) {
      userChans.push({ id: channel.id, channel: channel.name, alias: channel.alias, active: true });
      changed = true;
      send([ctx.socket.id], `You have joined ${channel.name} with the alias '${channel.alias}'.`);
    } else if (!hasAccess && existing) {
      userChans = userChans.filter(c => c.channel !== channel.name);
      ctx.socket.leave(channel.name);
      changed = true;
      send([ctx.socket.id], `You have left ${channel.name} with the alias '${channel.alias}'.`);
    }
  }

  if (changed) {
    await dbojs.modify({ id: player.id }, "$set", {
      "data.channels": userChans,
    } as unknown as Partial<IDBOBJ>);
  }

  for (const channel of userChans) {
    if (channel.active) ctx.socket.join(channel.channel);
  }
};
