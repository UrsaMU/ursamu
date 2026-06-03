/**
 * Bridge: re-exports send/broadcast from @ursamu/core with a backwards-compat
 * notify() that translates actorId/cid to socketId using the old wsService.
 */
import { send as _send, broadcastAll as _broadcast, sessions } from "@ursamu/core";
import { wsService } from "../WebSocket/index.ts";

export { _send as send, _broadcast as broadcast };

/**
 * notify(actorId, msg) — find the socket whose cid matches actorId.
 * Tries new sessions store first, then falls back to wsService cid lookup.
 */
export function notify(actorId: string, msg: string): boolean {
  // Try new sessions store
  const session = sessions.getBySession(actorId);
  if (session) {
    _send([session.socketId], msg);
    return true;
  }

  // Fall back to old wsService cid-based lookup
  const socket = wsService.getConnectedSockets().find((s) => s.cid === actorId);
  if (!socket) return false;
  wsService.send([actorId], { event: "message", payload: { msg } });
  return true;
}
