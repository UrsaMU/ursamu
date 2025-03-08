import { io } from "../../app.ts";
import parser from "../parser/parser.ts";
type data = { [key: string]: any };

export const send = async (targets: any[], msg: string, data?: data, exclude: string[] = []) => {
  // Create a socket.io instance for broadcasting
  let socket = io;
  
  // Add targets
  if (targets.length > 0) {
    socket = socket.to(targets);
  }
  
  // Exclude sockets if needed
  if (exclude.length > 0) {
    socket = socket.except(exclude);
  }
  
  // Send the message
  socket.emit("message", {
    msg: parser.substitute("telnet", msg),
    data,
  });
};

export const broadcast = async (msg: string, data?: data) =>
  io.emit("message", {
    msg: parser.substitute("telnet", msg),
    data: data || {},
  });
