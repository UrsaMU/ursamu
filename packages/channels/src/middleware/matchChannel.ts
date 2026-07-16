import { dbojs, DBO, evaluateLock, hydrate, getConfig } from "@ursamu/mush";
import { send, rooms, sessions } from "@ursamu/core";
import type { ICoreContext } from "@ursamu/core";
import type { IChannel, IChanEntry, IChanMessage } from "../types.ts";
import { channelEvents } from "../channel-events.ts";

const chans = new DBO<IChannel>(() =>
  getConfig<string>("plugins.channels.db", "server.chans"),
);
const chanHistory = new DBO<IChanMessage>(() =>
  getConfig<string>(
    "plugins.channels.historyDb",
    "server.chan_history",
  ),
);

function moniker(obj: {
  data?: Record<string, unknown>;
  id: string;
}): string {
  return (
    (obj.data?.moniker as string) ||
    (obj.data?.name as string) ||
    obj.id
  );
}

function chanSend(
  chanName: string,
  header: string,
  text: string,
): void {
  rooms.broadcast(chanName, `${header} ${text}`);
}

async function persistMessage(
  chan: IChannel,
  actorId: string,
  name: string,
  msg: string,
): Promise<void> {
  if (!chan.logHistory) return;
  const limit = chan.historyLimit ?? 500;
  await chanHistory.create({
    id: crypto.randomUUID(),
    chanId: chan.id,
    chanName: chan.name,
    playerId: actorId,
    playerName: name,
    message: msg,
    timestamp: Date.now(),
  });
  const all = await chanHistory.find({ chanId: chan.id });
  all.sort(
    (a: IChanMessage, b: IChanMessage) => a.timestamp - b.timestamp,
  );
  if (all.length > limit) {
    for (const entry of all.slice(0, all.length - limit)) {
      await chanHistory.delete({ id: entry.id });
    }
  }
}

async function getChannelMembers(
  channelName: string,
): Promise<{ players: string[]; objects: string[] }> {
  const sockets = rooms.members(channelName);
  const playerIds = new Set<string>();

  for (const socketId of sockets) {
    const s = sessions.get(socketId);
    const actorId = (s as any)?.actorId;
    if (actorId) {
      playerIds.add(actorId);
    }
  }

  const players: string[] = [];
  const objects: string[] = [];

  for (const id of playerIds) {
    const dbObj = await dbojs.queryOne({ id });
    if (dbObj) {
      const name = (dbObj.data?.name as string) || dbObj.id;
      // IDBOBJ.flags is a space-delimited string
      const isPlayer = String(dbObj.flags ?? "")
        .split(/\s+/)
        .includes("player");
      if (isPlayer) {
        players.push(name);
      } else {
        objects.push(name);
      }
    }
  }

  players.sort();
  objects.sort();
  return { players, objects };
}

export async function matchChannel(
  ctx: ICoreContext,
): Promise<boolean> {
  const session = sessions.get(ctx.socketId);
  const actorId = (session as any)?.actorId ?? ctx.sessionId;
  if (!actorId) return false;

  const en = await dbojs.queryOne({ id: actorId });
  if (!en || !en.data?.channels) return false;

  const parts = ctx.input?.split(" ") || [];
  const trig = parts[0];
  const rawRest = parts.slice(1).join(" ").trim();
  const match = rawRest?.match(/^(:|;)?(.*)$/i);
  if (!match) return false;

  const userChans = en.data.channels as IChanEntry[];
  const channel = userChans.find((c: IChanEntry) => c.alias === trig);
  if (!channel) return false;

  const chan = await chans.queryOne({ name: channel.channel });
  if (!chan) return false;

  const enHydrated = hydrate(en);
  if (!(await evaluateLock(chan.lock || "", enHydrated, enHydrated))) {
    return false;
  }

  const displayName = channel.mask ?? moniker(en);
  const titlePrefix = channel.title ? channel.title + " " : "";
  let msg = rawRest;

  if (msg.toLowerCase() === "on") {
    if (!channel.active) {
      channel.active = true;
      rooms.join(ctx.socketId, channel.channel);
      // deno-lint-ignore no-explicit-any
      await dbojs.modify({ id: en.id }, "$set", {
        "data.channels": en.data.channels,
      } as any);
      chanSend(
        channel.channel,
        chan.header,
        `${displayName} has joined the channel.`,
      );
      send(
        [ctx.socketId],
        `You have joined channel ${channel.channel}.`,
      );
    } else {
      send(
        [ctx.socketId],
        `You are already on channel ${channel.channel}.`,
      );
    }
    return true;
  }

  if (msg.toLowerCase() === "off") {
    if (channel.active) {
      chanSend(
        channel.channel,
        chan.header,
        `${displayName} has left the channel.`,
      );
      channel.active = false;
      rooms.leave(ctx.socketId, channel.channel);
      // deno-lint-ignore no-explicit-any
      await dbojs.modify({ id: en.id }, "$set", {
        "data.channels": en.data.channels,
      } as any);
      send(
        [ctx.socketId],
        `You have left channel ${channel.channel}.`,
      );
    } else {
      send(
        [ctx.socketId],
        `You are already off channel ${channel.channel}.`,
      );
    }
    return true;
  }

  if (msg.toLowerCase() === "who") {
    const { players, objects } = await getChannelMembers(channel.channel);
    send([ctx.socketId], "-- Players --");
    for (const p of players) {
      send([ctx.socketId], p);
    }
    send([ctx.socketId], "-- Objects --");
    for (const o of objects) {
      send([ctx.socketId], o);
    }
    send([ctx.socketId], `-- ${channel.channel} --`);
    return true;
  }

  if (!channel.active) return false;

  if (match[1] === ":") {
    msg = `${titlePrefix}${displayName} ${match[2]}`;
  } else if (match[1] === ";") {
    msg = `${titlePrefix}${displayName}${match[2]}`;
  } else {
    msg = `${titlePrefix}${displayName} says, "${msg}"`;
  }

  chanSend(chan.name, chan.header, msg);

  channelEvents
    .emit("channel:message", {
      channelName: chan.name,
      senderId: en.id,
      senderName: moniker(en),
      message: msg,
      source: "game",
    })
    .catch((e: unknown) =>
      console.error("[channels] channel:message:", e)
    );

  await persistMessage(chan, en.id, moniker(en), msg);
  return true;
}
