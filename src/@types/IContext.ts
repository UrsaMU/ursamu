import { IMSocket } from "./IMSocket.ts";

export interface IContext {
  socket: IMSocket;
  msg?: string;
  data?: { [key: string]: any };
}
