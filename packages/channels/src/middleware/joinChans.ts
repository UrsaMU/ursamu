import { dbojs, DBO, evaluateLock, hydrate, getConfig } from "@ursamu/mush";
import { send, rooms } from "@ursamu/core";
import type { IChannel, IChanEntry } from "../types.ts";

const chans = new DBO<IChannel>(() =>
  getConfig<string>("plugins.channels.db", "server.chans"),
);

/**
 * Subscribe a socket to channels the player is eligible for.
 * Called from the player:login gameHook — socketId comes from SessionEvent.
 *
 * Behaviour:
 *   - Channel already in data.channels + active  → silently rejoin room socket.
 *   - Channel already in data.channels + inactive → leave alone (player chose off).
 *   - Channel not yet in data.channels + eligible → add, join, and announce.
 *   - Channel in data.channels but no longer eligible → remove entry silently.
 */
export async function joinChans(
  playerId: string,
  socketId: string,
): Promise<void> {
  const player = await dbojs.queryOne({ id: playerId });
  if (!player) return;

  const allChans = await chans.query({});
  const playerHydrated = hydrate(player);

  rooms.join(socketId, `#${playerId}`);
  if (player.location) rooms.join(socketId, `#${player.location}`);

  // Work on a stable snapshot; push mutations back at the end.
  player.data ||= {};
  player.data.channels ||= [];
  const chs = player.data.channels as IChanEntry[];
  let dirty = false;

  for (const channel of allChans) {
    if (!channel.alias) continue;

    const eligible = await evaluateLock(
      channel.lock || "",
      playerHydrated,
      playerHydrated,
    );

    const existingIdx = chs.findIndex(
      (c: IChanEntry) =>
        c.channel.toLowerCase() === channel.name.toLowerCase(),
    );
    const existing = existingIdx >= 0 ? chs[existingIdx] : null;

    if (eligible) {
      if (existing) {
        // Already a member — silently restore the socket subscription if active.
        if (existing.active) rooms.join(socketId, channel.name);
      } else {
        // First time on this channel — add, subscribe, and announce.
        chs.push({
          id: channel.id,
          channel: channel.name,
          alias: channel.alias,
          active: true,
        });
        dirty = true;
        rooms.join(socketId, channel.name);
        send(
          [socketId],
          `You have joined ${channel.name} ` +
            `with the alias '${channel.alias}'.`,
        );
      }
    } else if (existing) {
      // No longer eligible — remove the entry silently.
      chs.splice(existingIdx, 1);
      dirty = true;
    }
  }

  if (dirty) {
    // deno-lint-ignore no-explicit-any
    await dbojs.modify({ id: player.id }, "$set", {
      "data.channels": chs,
    } as any);
  }
}
