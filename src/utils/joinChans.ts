import { IChanEntry } from "../@types/Channels";
import { IContext } from "../@types/IContext";
import { chans, dbojs } from "../services/Database";
import { send } from "../services/broadcast";
import { force } from "../services/commands";
import { flags } from "../services/flags/flags";

export const joinChans = async (ctx: IContext) => {
  const player = await dbojs.findOne({ id: ctx.socket.cid });
  if (!player) return;
  const channels = await chans.find({});
  ctx.socket.join(`#${player.location}`);
  ctx.socket.join(`#${player.id}`);

  for (const channel of channels) {
    if (channel.alias && flags.check(player.flags || "", channel.lock || "")) {
      const chan = player.data?.channels?.filter(
        (ch: IChanEntry) => ch.channel === channel.name
      );

      if (!chan?.length) {
        player.data ||= {};
        player.data.channels ||= [];

        player.data?.channels?.push({
          channel: channel.name,
          alias: channel.alias,
          active: true,
        });

        ctx.socket.join(channel.name);
        await dbojs.update({ id: player.id }, player);
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
      const chan = player.data?.channels?.filter(
        (ch: IChanEntry) => ch.channel === channel.name
      );

      if (chan?.length) {
        player.data ||= {};
        player.data.channels ||= [];
        player.data.channels = player.data.channels.filter(
          (c: IChanEntry) => c.channel !== channel.name
        );

        console.log("Flag change!");
        ctx.socket.leave(channel.name);
        await dbojs.update({ id: player.id }, player);
        await send(
          [ctx.socket.id],
          `You have left ${channel.name} with the alias '${channel.alias}'.`
        );
      }
    }
  }

  player.data?.channels?.forEach(
    (channel: IChanEntry) => channel.active && ctx.socket.join(channel.channel)
  );
};
