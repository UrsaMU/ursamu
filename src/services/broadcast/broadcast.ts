import { wsService } from "../WebSocket/index.ts";
type data = Record<string, unknown>;

export const send = (targets: string[], msg: string, data?: data, exclude: string[] = []) => {
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

export const broadcast = (msg: string, data?: data) => {
  wsService.broadcast({
    event: "message",
    payload: {
      msg,
      data: data || {}
    }
  });
};
