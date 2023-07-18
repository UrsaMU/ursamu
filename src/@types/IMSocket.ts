import { Socket } from "socket.io";

export interface IMSocket extends Socket {
  id: string;
  cid?: number;
  channels?: Set<string>;
}
