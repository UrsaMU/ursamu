import { dbojs, DBO } from "@ursamu/mush";
import { send, rooms } from "@ursamu/core";
import type { IChannel, IChanEntry } from "../types.ts";

const chans = new DBO<IChannel>("server.chans");

function flagsMatch(flags: string, lock: string): boolean {
  if (!lock) return true;
  const flagSet = new Set(flags.toLowerCase().split(/\s+/).filter(Boolean));
  return lock.toLowerCase().split(/\s+/).filter(Boolean).every((l) => flagSet.has(l));
}

/**
 * Subscribe a socket to channels the player is eligible for.
 * Called from the player:login gameHook — socketId comes from SessionEvent.
 */
export async function joinChans(playerId: string, socketId: string): Promise<void> {
  const player = await dbojs.queryOne({ id: playerId });
  if (!player) return;

  const allChans = await chans.query({});

  rooms.join(socketId, `#${playerId}`);
  if (player.location) rooms.join(socketId, `#${player.location}`);

  for (const channel of allChans) {
    if (!channel.alias) continue;
    const eligible = flagsMatch(player.flags || "", channel.lock || "");
    const userChans = (player.data?.channels || []) as IChanEntry[];

    if (eligible) {
      const existing = userChans.find((c: IChanEntry) => c.channel === channel.name);
      if (!existing) {
        player.data ||= {};
        player.data.channels ||= [];
        const chs = player.data.channels as IChanEntry[];
        chs.push({ id: channel.id, channel: channel.name, alias: channel.alias, active: true });
        // deno-lint-ignore no-explicit-any
        await dbojs.modify({ id: player.id }, "$set", { "data.channels": chs } as any);
        rooms.join(socketId, channel.name);
        send([socketId], `You have joined ${channel.name} with the alias '${channel.alias}'.`);
      } else if (existing.active) {
        rooms.join(socketId, channel.name);
      }
    } else {
      const existing = userChans.find((c: IChanEntry) => c.channel === channel.name);
      if (existing) {
        player.data ||= {};
        const chs = (player.data.channels || []) as IChanEntry[];
        player.data.channels = chs.filter((c: IChanEntry) => c.channel !== channel.name);
        // deno-lint-ignore no-explicit-any
        await dbojs.modify({ id: player.id }, "$set", { "data.channels": player.data.channels } as any);
        send([socketId], `You have left ${channel.name} with the alias '${channel.alias}'.`);
      }
    }
  }

  const refreshed = await dbojs.queryOne({ id: playerId });
  const updatedChans = (refreshed?.data?.channels || []) as IChanEntry[];
  for (const ch of updatedChans) {
    if (ch.active) rooms.join(socketId, ch.channel);
  }
}
