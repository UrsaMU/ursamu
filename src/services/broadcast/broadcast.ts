import { wsService } from "../WebSocket/index.ts";
import parser from "../parser/parser.ts";
type data = Record<string, unknown>;

export const send = (_targets: string[], msg: string, data?: data, _exclude: string[] = []) => {
  // TODO: Implement sophisticated targeting in WebSocketService
  // For now, mapping this to a simple broadcast for compatibility or direct send if ID known

  // Clean message
  const cleanedMsg = parser.substitute("telnet", msg);

  wsService.broadcast({
    event: "message",
    payload: {
      msg: cleanedMsg,
      data
    }
  });
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
