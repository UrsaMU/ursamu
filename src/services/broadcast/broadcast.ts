import { io } from "../../app.ts";
import { emitter } from "../index.ts";
import parser from "../parser/parser.ts";
type data = { [key: string]: any };
export const send = async (targets: any[], msg: string, data?: data) => {
  const m = await parser.run({ msg, data: data || {}, scope: {} });
  io.to(targets).emit("message", {
    msg: parser.substitute("telnet", m || ""),
    data,
  });

  emitter.emit("send", targets, msg, data);
};

export const broadcast = async (msg: string, data?: data) => {
  const m = await parser.run({ msg, data: data || {}, scope: {} });
  io.emit("message", {
    msg: parser.substitute("telnet", m || ""),
    data: data || {},
  });

  emitter.emit("broadcast", msg, data);
};
