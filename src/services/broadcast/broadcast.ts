import { io } from "../../app";
import parser from "../parser/parser";
type data = { [key: string]: any };
export const send = async (targets: any[], msg: string, data: data) => {
  io.to(targets).emit("message", {
    msg: parser.substitute("telnet", msg),
    data,
  });
};

export const broadcast = async (msg: string, data: data) =>
  io.emit("message", { msg: parser.substitute("telnet", msg), data });
