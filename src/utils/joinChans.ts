import type { IChanEntry } from "../@types/Channels.ts";
import type { IContext } from "../@types/IContext.ts";
import type { IDBOBJ } from "../@types/IDBObj.ts";
import { chans, dbojs } from "../services/Database/index.ts";
import { send } from "../services/broadcast/index.ts";
import { flags } from "../services/flags/flags.ts";
import { playerForSocket } from "./playerForSocket.ts";

export const joinChans = async (ctx: IContext) => {
  const player = await playerForSocket(ctx.socket);
  if (!player) return;
  const channels = await chans.query({});
  ctx.socket.join(`#${player.location}`);
  ctx.socket.join(`#${player.id}`);

  player.data ||= {};
  player.data.channels ||= [];
  let userChans = player.data.channels as IChanEntry[];

  // Deduplicate existing entries first (fix corruption from prior bug)
  const originalLength = userChans.length;
  const seen = new Set<string>();
  userChans = userChans.filter(ch => {
    const key = ch.channel.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  let changed = userChans.length !== originalLength;

  for (const channel of channels) {
    if (!channel.alias) continue;

    const hasAccess = flags.check(player.flags || "", channel.lock || "");
    const existing = userChans.find(ch => ch.channel === channel.name);

    if (hasAccess && !existing) {
      // Player has access but isn't on the channel — add them
      userChans.push({
        id: channel.id,
        channel: channel.name,
        alias: channel.alias,
        active: true,
      });
      changed = true;
      send(
        [ctx.socket.id],
        `You have joined ${channel.name} with the alias '${channel.alias}'.`
      );
    } else if (!hasAccess && existing) {
      // Player lost access — remove them
      userChans = userChans.filter(c => c.channel !== channel.name);
      ctx.socket.leave(channel.name);
      changed = true;
      send(
        [ctx.socket.id],
        `You have left ${channel.name} with the alias '${channel.alias}'.`
      );
    }
  }

  // Save once if anything changed (not per-channel)
  if (changed) {
    await dbojs.modify({ id: player.id }, "$set", {
      "data.channels": userChans,
    } as unknown as Partial<IDBOBJ>);
  }

  // Join all active channel rooms on the socket
  for (const channel of userChans) {
    if (channel.active) {
      ctx.socket.join(channel.channel);
    }
  }
};
