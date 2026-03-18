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
  } else {
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
