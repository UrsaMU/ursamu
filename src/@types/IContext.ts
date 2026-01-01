import { UserSocket, IMSocket } from "./IMSocket.ts";

export interface IContext {
  socket: UserSocket | IMSocket;
  msg?: string;
  data?: Record<string, unknown>;
}
