import type { IChanEntry } from "../@types/Channels.ts";
import type { IContext } from "../@types/IContext.ts";
import { chans, dbojs } from "../services/Database/index.ts";
import { send } from "../services/broadcast/index.ts";
import { force } from "../services/commands/index.ts";
import { flags } from "../services/flags/flags.ts";
import { playerForSocket } from "./playerForSocket.ts";

export const joinChans = async (ctx: IContext) => {
  const player = await playerForSocket(ctx.socket);
  if (!player) return;
  const channels = await chans.query({});
  ctx.socket.join(`#${player.location}`);
  ctx.socket.join(`#${player.id}`);

  for (const channel of channels) {
    if (channel.alias && flags.check(player.flags || "", channel.lock || "")) {
      const userChans = (player.data?.channels || []) as IChanEntry[];
      const chan = userChans.filter(
        (ch: IChanEntry) => ch.channel === channel.name
      );

      if (!chan?.length) {
        player.data ||= {};
        player.data.channels ||= [];
        const chs = player.data.channels as IChanEntry[];

        chs.push({
          id: channel.id,
          channel: channel.name,
          alias: channel.alias,
          active: true,
        });

        ctx.socket.join(channel.name);
        await dbojs.modify({ id: player.id }, "$set", player);
        await force(ctx, `${channel.alias} :has joined the channel.`);
        send(
          [ctx.socket.id],
          `You have joined ${channel.name} with the alias '${channel.alias}'.`
        );
      }
    } else if (
      channel.alias &&
      !flags.check(player.flags || "", channel.lock || "")
    ) {
      // remove channels that are locked from the player.
      const userChans = (player.data?.channels || []) as IChanEntry[];
      const chan = userChans.filter(
        (ch: IChanEntry) => ch.channel === channel.name
      );

      if (chan?.length) {
        player.data ||= {};
        player.data.channels ||= [];
        const chs = player.data.channels as IChanEntry[];
        player.data.channels = chs.filter(
          (c: IChanEntry) => c.channel !== channel.name
        );

        ctx.socket.leave(channel.name);
        await dbojs.modify({ id: player.id }, "$set", player);
        await send(
          [ctx.socket.id],
          `You have left ${channel.name} with the alias '${channel.alias}'.`
        );
      }
    }
  }

  const userChans = (player.data?.channels || []) as IChanEntry[];
  userChans.forEach(
    (channel: IChanEntry) => channel.active && ctx.socket.join(channel.channel)
  );
};
