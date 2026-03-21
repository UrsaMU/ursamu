import type { IChanEntry } from "../../@types/Channels.ts";
import type { IContext } from "../../@types/IContext.ts";
import { moniker } from "../../utils/moniker.ts";
import { chans, dbojs, chanHistory } from "../Database/index.ts";
import { getNextId } from "../../utils/getNextId.ts";
import { send } from "../broadcast/index.ts";
import { flags } from "../flags/flags.ts";
import { force } from "./force.ts";
import { discordBridge } from "../discord/index.ts";
import { channelEvents } from "../channel-events.ts";
import { gameHooks } from "../Hooks/GameHooks.ts";

export const matchChannel = async (ctx: IContext) => {
  if (!ctx.socket.cid) {
    return false;
  }
  const en = await dbojs.queryOne({ id: ctx.socket.cid });

  if (!en) return false;
  const parts = ctx.msg?.split(" ") || [];
  const trig = parts[0];
  let msg = parts.slice(1).join(" ").trim();
  const match = msg?.match(/^(:|;)?(.*)$/i);
  if (!match) return false;

  if (!en.data?.channels) {
    return false;
  }
  const userChans = en.data.channels as IChanEntry[];
  const channel = userChans.find((c: IChanEntry) => c.alias === trig);
  if (!channel) {
    return false;
  }
  const chan = await chans.queryOne({ name: channel.channel });

  if (!chan) {
    return false;
  }
  if (!flags.check(en.flags || "", chan.lock || "")) return false;

  // Toggle on/off — use loose checks so undefined active is treated as off
  if (msg.toLowerCase() === "on" && !channel.active) {
    channel.active = true;
    ctx.socket.join(channel.channel);
    await dbojs.modify({ id: en.id }, "$set", { "data.channels": userChans } as Partial<typeof en>);
    await force(ctx, `${channel.alias} :has joined the channel.`);
    send([ctx.socket.id], `You have joined channel ${channel.channel}.`, {});
    return true;
  } else if (msg.toLowerCase() === "off" && channel.active) {
    channel.active = false;
    ctx.socket.leave(channel.channel);
    await dbojs.modify({ id: en.id }, "$set", { "data.channels": userChans } as Partial<typeof en>);
    await force(ctx, `${channel.alias} :has left the channel.`);
    send([ctx.socket.id], `You have left channel ${channel.channel}.`, {});
    return true;
  }

  // Reject empty messages
  if (!msg || !msg.trim()) {
    return true;
  }

  if (match[1] === ":") {
    msg = `${channel?.title ? channel?.title + " " : ""}${channel?.mask ? channel.mask : moniker(en)
      } ${match[2]}`;
  } else if (match[1] === ";") {
    msg = `${channel?.title ? channel?.title + " " : ""}${channel?.mask ? channel.mask : moniker(en)
      }${match[2]}`;
  } else {
    msg = `${channel?.title || ""}${channel?.mask ? channel.mask : moniker(en)
      } says, "${msg}"`;
  }

  if (!channel?.active) {
    return false;
  }

  send([chan.name], `${chan.header} ${msg}`, {});
  discordBridge.sendToDiscord(chan.name, moniker(en), msg);
  const chanPayload = {
    channelName: chan.name,
    senderId:    en.id,
    senderName:  moniker(en),
    message:     msg,
  };
  channelEvents.emit("channel:message", chanPayload);
  gameHooks.emit("channel:message", chanPayload).catch(e => console.error("[GameHooks] channel:message:", e));

  // Persist message if channel has logging enabled
  if (chan.logHistory) {
    const limit = chan.historyLimit ?? 500;
    const id = await getNextId("chanHistoryId");
    await chanHistory.create({
      id,
      chanId: chan.id,
      chanName: chan.name,
      playerId: en.id,
      playerName: moniker(en),
      message: msg,
      timestamp: Date.now(),
    });
    // Trim to limit — only check every 50 messages to avoid
    // a full table scan on every single message sent
    if (Math.random() < 0.02) {
      const all = await chanHistory.find({ chanId: chan.id });
      if (all.length > limit) {
        all.sort((a, b) => a.timestamp - b.timestamp);
        const toDelete = all.slice(0, all.length - limit);
        for (const entry of toDelete) {
          await chanHistory.delete({ id: entry.id });
        }
      }
    }
  }

  return true;
};
