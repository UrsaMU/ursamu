import { IMSocket } from "../@types/IMSocket";

const CONNECTION_TIMEOUT = 5 * 60 * 1000; // 5 minutes in milliseconds
const pendingConnections = new Map<string, NodeJS.Timeout>();

export const startConnectionTimeout = (socket: IMSocket) => {
  // Set a timeout for the socket
  const timeout = setTimeout(() => {
    if (!socket.cid) {
      socket.emit("message", {
        msg: "Connection timed out. Please connect with a character.\r\n",
        data: { 
          disconnect: true,
          quit: true  // This ensures the telnet socket disconnects properly
        },
      });
      socket.disconnect(true);
    }
    pendingConnections.delete(socket.id);
  }, CONNECTION_TIMEOUT);

  pendingConnections.set(socket.id, timeout);
};

export const clearConnectionTimeout = (socket: IMSocket) => {
  const timeout = pendingConnections.get(socket.id);
  if (timeout) {
    clearTimeout(timeout);
    pendingConnections.delete(socket.id);
  }
};
