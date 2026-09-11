/**
 * Room presence lines when a player connects or goes offline.
 * Same-room only: "Alice has connected." / "Alice has disconnected."
 */
import { send, sessions } from "@ursamu/core";
import { dbojs } from "../world/dbobjs.ts";
import type { IDBOBJ } from "../world/types.ts";

function playerLabel(player: IDBOBJ): string {
  return (
    (player.data?.moniker as string | undefined) ||
    (player.data?.name as string | undefined) ||
    "Someone"
  );
}

/**
 * Socket ids for connected players in `loc`, optionally skipping one id.
 */
async function roomSocketIds(
  loc: string,
  excludeId?: string,
): Promise<string[]> {
  const others = await dbojs.query({
    $and: [
      { location: loc },
      { flags: /connected/i },
      ...(excludeId ? [{ id: { $ne: excludeId } }] : []),
    ],
  });
  if (others.length === 0) return [];

  const allSessions = sessions.list();
  const socketIds: string[] = [];
  for (const o of others) {
    for (const s of allSessions) {
      const aid = (s as { actorId?: string | null }).actorId;
      if (aid === o.id) socketIds.push(s.socketId);
    }
  }
  return socketIds;
}

/**
 * Tell others in the room that this player connected.
 * Call after the player is flagged connected and location is set.
 */
export async function notifyRoomConnect(
  player: IDBOBJ,
): Promise<void> {
  const loc = player.location;
  if (!loc) return;

  const socketIds = await roomSocketIds(loc, player.id);
  if (socketIds.length === 0) return;
  send(socketIds, `${playerLabel(player)} has connected.`);
}

/**
 * Tell others in the room that this player disconnected.
 * Call after the leaver's connected flag is cleared so they
 * are not matched by the connected query.
 */
export async function notifyRoomDisconnect(
  player: IDBOBJ,
): Promise<void> {
  const loc = player.location;
  if (!loc) return;

  const socketIds = await roomSocketIds(loc, player.id);
  if (socketIds.length === 0) return;
  send(socketIds, `${playerLabel(player)} has disconnected.`);
}
