import type { IChanEntry } from "../@types/Channels.ts";
import type { IContext } from "../@types/IContext.ts";
import type { IDBOBJ } from "../@types/IDBObj.ts";
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

        // deno-lint-ignore no-explicit-any
        await dbojs.modify({ id: player.id }, "$set", { "data.channels": chs } as any as Partial<IDBOBJ>);
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
        const filtered = chs.filter(
          (c: IChanEntry) => c.channel !== channel.name
        );
        player.data.channels = filtered;

        ctx.socket.leave(channel.name);
        // deno-lint-ignore no-explicit-any
        await dbojs.modify({ id: player.id }, "$set", { "data.channels": filtered } as any as Partial<IDBOBJ>);
        await send(
          [ctx.socket.id],
          `You have left ${channel.name} with the alias '${channel.alias}'.`
        );
      }
    }
  }

  // Re-read player data to ensure we have the latest channel list,
  // then join ALL active channel rooms on the socket. This is the
  // single authoritative join point — covers both new and existing
  // channels, and ensures the socket is always in sync with the DB
  // even after a reconnect or server restart.
  const freshPlayer = await dbojs.queryOne({ id: player.id });
  const finalChans = ((freshPlayer?.data?.channels || []) as IChanEntry[]);
  for (const channel of finalChans) {
    if (channel.active) {
      ctx.socket.join(channel.channel);
    }
  }
};
