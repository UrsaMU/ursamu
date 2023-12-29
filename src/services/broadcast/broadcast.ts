import { io } from "../../app.ts";
import { emitter } from "../index.ts";
import parser from "../parser/parser.ts";
type data = { [key: string]: any };
export const send = async (targets: any[], msg: string, data?: data) => {
  io.to(targets).emit("message", {
    msg: parser.substitute("telnet", msg),
    data,
  });

  emitter.emit("send", targets, msg, data);
};

export const broadcast = async (msg: string, data?: data) => {
  io.emit("message", {
    msg: parser.substitute("telnet", msg),
    data: data || {},
  });

  emitter.emit("broadcast", msg, data);
};
