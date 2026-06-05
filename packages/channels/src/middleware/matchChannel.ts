import { dbojs, DBO, gameHooks } from "@ursamu/mush";
import { send, rooms } from "@ursamu/core";
import type { ICoreContext } from "@ursamu/core";
import type { IChannel, IChanEntry, IChanMessage } from "../types.ts";

const chans = new DBO<IChannel>("server.chans");
const chanHistory = new DBO<IChanMessage>("server.chan_history");

function moniker(obj: { data?: Record<string, unknown>; id: string }): string {
  return (obj.data?.moniker as string) || (obj.data?.name as string) || obj.id;
}

function flagsMatch(flags: string, lock: string): boolean {
  if (!lock) return true;
  const flagSet = new Set(flags.toLowerCase().split(/\s+/).filter(Boolean));
  return lock.toLowerCase().split(/\s+/).filter(Boolean).every((l) => flagSet.has(l));
}

function chanSend(chanName: string, header: string, text: string): void {
  rooms.broadcast(chanName, `${header} ${text}`);
}

async function persistMessage(chan: IChannel, actorId: string, name: string, msg: string): Promise<void> {
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
  all.sort((a: IChanMessage, b: IChanMessage) => a.timestamp - b.timestamp);
  if (all.length > limit) {
    for (const entry of all.slice(0, all.length - limit)) {
      await chanHistory.delete({ id: entry.id });
    }
  }
}

export async function matchChannel(ctx: ICoreContext): Promise<boolean> {
  if (!ctx.sessionId) return false;

  const en = await dbojs.queryOne({ id: ctx.sessionId });
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

  if (!flagsMatch(en.flags || "", chan.lock || "")) return false;

  const displayName = channel.mask ?? moniker(en);
  const titlePrefix = channel.title ? channel.title + " " : "";
  let msg = rawRest;

  if (msg.toLowerCase() === "on" && channel.active === false) {
    channel.active = true;
    rooms.join(ctx.socketId, channel.channel);
    // deno-lint-ignore no-explicit-any
    await dbojs.modify({ id: en.id }, "$set", en as any);
    chanSend(channel.channel, chan.header, `${displayName} has joined the channel.`);
    send([ctx.socketId], `You have joined channel ${channel.channel}.`);
    return true;
  }

  if (msg.toLowerCase() === "off" && channel.active === true) {
    chanSend(channel.channel, chan.header, `${displayName} has left the channel.`);
    channel.active = false;
    rooms.leave(ctx.socketId, channel.channel);
    // deno-lint-ignore no-explicit-any
    await dbojs.modify({ id: en.id }, "$set", en as any);
    send([ctx.socketId], `You have left channel ${channel.channel}.`);
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

  gameHooks.emit("channel:message", {
    channelName: chan.name,
    senderId:    en.id,
    senderName:  moniker(en),
    message:     msg,
  }).catch((e: unknown) => console.error("[channels] channel:message:", e));

  await persistMessage(chan, en.id, moniker(en), msg);
  return true;
}
