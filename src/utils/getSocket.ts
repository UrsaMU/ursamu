import { wsService } from "../services/WebSocket/index.ts";

/**
 * Get a socket by database object ID
 * @param id The ID of the database object (player)
 * @returns The socket associated with the player, if any
 */
export const getSocket = (id: string) => {
  const sockets = wsService.getConnectedSockets();
  // Find the socket with matching cid
  return sockets.find((socket) => socket.cid === id);
};
