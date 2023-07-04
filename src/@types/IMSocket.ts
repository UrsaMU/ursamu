import { Socket } from "socket.io";
import { WebSocket } from "ws";

export interface IMSocket extends Socket {
  id: string;
  cid?: number;
  channels?: Set<string>;
}
