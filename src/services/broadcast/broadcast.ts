/**
 * Bridge: re-exports send/broadcast from @ursamu/core with a backwards-compat
 * notify() that translates actorId/cid to socketId.
 */
import { send as _send, broadcastAll as _broadcast, sessions } from "@ursamu/core";

export { _send as send, _broadcast as broadcast };

/** notify(actorId, msg) — deliver to the socket whose cid (actorId) matches. */
export function notify(actorId: string, msg: string): boolean {
  const session = sessions.getBySession(actorId);
  if (session) {
    _send([session.socketId], msg);
    return true;
  }
  return false;
}
