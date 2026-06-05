import type { UserSocket } from "../@types/IMSocket.ts";
import { wsService } from "../services/WebSocket/index.ts";

/** Look up the connected socket for a DB object ID. */
export const getSocket = (id: string): UserSocket | undefined =>
  wsService.getConnectedSockets().find(s => s.cid === id);
