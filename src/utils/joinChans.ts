import type { IChanEntry } from "../@types/Channels.ts";
import type { IContext } from "../@types/IContext.ts";
import { chans, dbojs } from "@ursamu/mush";
import { send } from "../services/broadcast/index.ts";
import { flags } from "@ursamu/mush";
import { playerForSocket } from "./playerForSocket.ts";

export const joinChans = async (ctx: IContext): Promise<void> => {
  const player = await playerForSocket(ctx.socket);
  if (!player) return;

  const channels = await chans.query({});
  ctx.socket.join(`#${player.location}`);
  ctx.socket.join(`#${player.id}`);

  player.data ||= {};
  player.data.channels ||= [];
  let userChans = player.data.channels as IChanEntry[];

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
    const hasAccess = flags.check(player.flags || "", (channel.lock as string) || "");
    const existing  = userChans.find(ch => ch.channel === channel.name);

    if (hasAccess && !existing) {
      userChans.push({ id: channel.id, channel: channel.name, alias: channel.alias as string, active: true });
      changed = true;
      send([ctx.socket.id], `You have joined ${channel.name} with the alias '${channel.alias as string}'.`);
    } else if (!hasAccess && existing) {
      userChans = userChans.filter(c => c.channel !== channel.name);
      ctx.socket.leave(channel.name);
      changed = true;
      send([ctx.socket.id], `You have left ${channel.name} with the alias '${channel.alias as string}'.`);
    }
  }

  if (changed) {
    await dbojs.modify({ id: player.id }, "$set", {
      "data.channels": userChans,
    } as unknown as import("../@types/IDBObj.ts").IDBOBJ);
  }

  for (const channel of userChans) {
    if (channel.active) ctx.socket.join(channel.channel);
  }
};
