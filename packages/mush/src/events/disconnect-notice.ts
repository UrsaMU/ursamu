/**
 * Room announcement when a player fully goes offline.
 * Mirrors login's "has connected." from verbs/auth.ts.
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
 * Notify other connected players in the leaver's room.
 * Call after the leaver's connected flag is cleared so they
 * are not matched by the connected query.
 */
export async function notifyRoomDisconnect(
  player: IDBOBJ,
): Promise<void> {
  const loc = player.location;
  if (!loc) return;

  const others = await dbojs.query({
    $and: [
      { location: loc },
      { flags: /connected/i },
      { id: { $ne: player.id } },
    ],
  });
  if (others.length === 0) return;

  const allSessions = sessions.list();
  const socketIds: string[] = [];
  for (const o of others) {
    for (const s of allSessions) {
      const aid = (s as { actorId?: string | null }).actorId;
      if (aid === o.id) socketIds.push(s.socketId);
    }
  }
  if (socketIds.length === 0) return;
  send(socketIds, `${playerLabel(player)} has disconnected.`);
}
