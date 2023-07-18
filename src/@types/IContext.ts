import { IMSocket } from "./IMSocket";

export interface IContext {
  socket: IMSocket;
  msg?: string;
  data?: { [key: string]: any };
}
