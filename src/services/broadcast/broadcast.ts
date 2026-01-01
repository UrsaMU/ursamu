import { wsService } from "../WebSocket/index.ts";
import parser from "../parser/parser.ts";
type data = { [key: string]: any };

export const send = async (targets: string[], msg: string, data?: data, exclude: string[] = []) => {
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

export const broadcast = async (msg: string, data?: data) => {
  const cleanedMsg = parser.substitute("telnet", msg);
  wsService.broadcast({
    event: "message",
    payload: {
      msg: cleanedMsg,
      data: data || {}
    }
  });
};
