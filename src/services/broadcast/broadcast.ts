import { wsService } from "../WebSocket/index.ts";
type data = Record<string, unknown>;

export const send = (targets: string[], msg: string, data?: data, exclude: string[] = []): void => {
  const filtered = exclude.length > 0 ? targets.filter(t => !exclude.includes(t)) : targets;
  if (filtered.length > 0) {
    wsService.send(filtered, {
      event: "message",
      payload: {
        msg,
        data
      }
    })
  } else if (targets.length === 0) {
    // Only broadcast to everyone when no targets were specified (intentional broadcast).
    // If targets were specified but all got excluded, send to nobody.
    wsService.broadcast({
      event: "message",
      payload: {
        msg,
        data
      }
    });
  }
};

/**
 * Deliver a message to a single online actor by id.
 * Returns true if at least one socket was found for the actor.
 * Returns false if the actor is offline (no socket carries that cid).
 */
export const notify = (actorId: string, msg: string, data?: data): boolean => {
  const online = wsService.getConnectedSockets().some(s => s.cid === actorId);
  if (!online) return false;
  wsService.send([actorId], {
    event: "message",
    payload: { msg, data },
  });
  return true;
};

export const broadcast = (msg: string, data?: data) => {
  wsService.broadcast({
    event: "message",
    payload: {
      msg,
      data: data || {}
    }
  });
};
