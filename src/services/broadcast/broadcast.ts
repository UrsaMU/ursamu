import { wsService } from "../WebSocket/index.ts";
import parser from "../parser/parser.ts";
type data = Record<string, unknown>;

export const send = (targets: string[], msg: string, data?: data, _exclude: string[] = []) => {
  // Clean message
  const cleanedMsg = parser.substitute("telnet", msg);

  if (targets.length > 0) {
    wsService.send(targets, {
      event: "message",
      payload: {
        msg: cleanedMsg,
        data
      }
    })
  } else {
    wsService.broadcast({
      event: "message",
      payload: {
        msg: cleanedMsg,
        data
      }
    });
  }
};

export const broadcast = (msg: string, data?: data) => {
  const cleanedMsg = parser.substitute("telnet", msg);
  wsService.broadcast({
    event: "message",
    payload: {
      msg: cleanedMsg,
      data: data || {}
    }
  });
};
