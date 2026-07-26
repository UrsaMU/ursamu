import { dbojs, DBO, evaluateLock, hydrate, getConfig } from "@ursamu/mush";
import { send, rooms } from "@ursamu/core";
import type { IChannel, IChanEntry } from "../types.ts";

const chans = new DBO<IChannel>(() =>
  getConfig<string>("plugins.channels.db", "server.chans"),
);

type ChanDefault = { name: string; alias: string; lock?: string };

/**
 * Subscribe a socket to channels the player is eligible for.
 * Called from the player:login gameHook — socketId comes from SessionEvent.
 *
 * Behaviour:
 *   - Not in data.channels + eligible → add, join, announce
 *     (this is how defaults re-attach after clearcom/delcom)
 *   - In list + active → silently rejoin socket room
 *   - In list + inactive → leave alone (player chose off via allcom)
 *   - In list + no longer eligible → remove silently
 */
export async function joinChans(
  playerId: string,
  socketId: string,
): Promise<void> {
  const player = await dbojs.queryOne({ id: playerId });
  if (!player) return;

  const allChans = (await chans.query({})) as IChannel[];
  const playerHydrated = hydrate(player);

  // Login just set `connected` on the DB row; a concurrent read can still
  // miss it. We're past auth with a live socket — treat as connected for
  // lock checks so defaults with lock "connected" always match.
  if (!playerHydrated.flags.has("connected")) {
    playerHydrated.flags.add("connected");
  }

  rooms.join(socketId, `#${playerId}`);
  if (player.location) rooms.join(socketId, `#${player.location}`);

  player.data ||= {};
  // Prefer data.channels; fall back to state.channels (older shapes).
  const fromState = (playerHydrated.state as Record<string, unknown>)
    ?.channels;
  if (!Array.isArray(player.data.channels)) {
    player.data.channels = Array.isArray(fromState) ? fromState : [];
  }
  const chs = player.data.channels as IChanEntry[];
  let dirty = false;

  // Config defaults are always candidates (even if missing from DB seed).
  const defaults = getConfig<ChanDefault[]>(
    "plugins.channels.defaults",
  ) ?? [];
  const defaultNames = new Set(
    defaults.map((d) => d.name.toLowerCase()),
  );

  for (const channel of allChans) {
    if (!channel.alias) continue;

    let eligible = false;
    try {
      eligible = await evaluateLock(
        channel.lock || "",
        playerHydrated,
        playerHydrated,
      );
    } catch (e: unknown) {
      console.error(
        `[channels] lock eval failed for ${channel.name}:`,
        e,
      );
      continue;
    }

    const existingIdx = chs.findIndex(
      (c: IChanEntry) =>
        c.channel.toLowerCase() === channel.name.toLowerCase(),
    );
    const existing = existingIdx >= 0 ? chs[existingIdx] : null;
    const isDefault = defaultNames.has(channel.name.toLowerCase());

    if (eligible) {
      if (existing) {
        // Already a member — restore socket if active.
        // Defaults: if entry is missing alias, repair it.
        if (!existing.alias && channel.alias) {
          existing.alias = channel.alias;
          existing.active = true;
          dirty = true;
        }
        if (existing.active !== false) {
          // Join by name and id so Discord inject can find listeners
          // regardless of which key it broadcasts on.
          rooms.join(socketId, channel.name);
          if (channel.id !== channel.name) {
            rooms.join(socketId, channel.id);
          }
        }
      } else {
        // Missing from list — auto-join (defaults and any open channel).
        chs.push({
          id: channel.id,
          channel: channel.name,
          alias: channel.alias,
          active: true,
        });
        dirty = true;
        rooms.join(socketId, channel.name);
        if (channel.id !== channel.name) {
          rooms.join(socketId, channel.id);
        }
        send(
          [socketId],
          `You have joined ${channel.name} ` +
            `with the alias '${channel.alias}'.`,
        );
      }
    } else if (existing && !isDefault) {
      // Drop non-default channels the player can no longer access.
      chs.splice(existingIdx, 1);
      dirty = true;
    } else if (existing && isDefault && !eligible) {
      // Keep the row but don't subscribe (e.g. Admin without staff).
      // Do not force-remove defaults so a later promotion can rejoin.
    }
  }

  if (dirty) {
    // deno-lint-ignore no-explicit-any
    await dbojs.modify({ id: player.id }, "$set", {
      "data.channels": chs,
    } as any);
  }
}
