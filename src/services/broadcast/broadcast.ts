/**
 * Bridge: re-exports send/broadcast from @ursamu/core with a backwards-compat
 * notify() that translates actorId/cid to socketId.
 */
import { send as _send, broadcastAll as _broadcast, sessions, listSocketIds } from "@ursamu/core";

export { _send as send, _broadcast as broadcast };

/** notify(actorId, msg) — deliver to the socket whose cid (actorId) matches. */
export function notify(actorId: string, msg: string): boolean {
  for (const socketId of listSocketIds()) {
    const session = sessions.get(socketId);
    const actor = ((session as unknown as Record<string, unknown>)?.actorId as string) ?? "";
    if (actor === actorId) {
      _send([socketId], msg);
      return true;
    }
  }
  return false;
}
