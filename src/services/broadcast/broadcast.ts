import { wsService } from "../WebSocket/index.ts";
import parser from "../parser/parser.ts";
type data = Record<string, unknown>;

export const send = (targets: string[], msg: string, data?: data, _exclude: string[] = []) => {
  if (targets.length > 0) {
    wsService.send(targets, {
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
