import { IContext } from "../@types/IContext.ts";
import { IMSocket } from "../@types/IMSocket.ts";
import { io } from "../app.ts";
import { dbojs } from "../services/Database/index.ts";

export const getSocket = async (id: string) => {
  console.log(`getSocket called for ID: ${id}`);
  
  try {
    // Get the database object
    const dbo = await dbojs.queryOne({ id });
    if (!dbo) {
      console.log(`No database object found for ID: ${id}`);
      return;
    }
    
    console.log(`Found database object for ID: ${id}`);
    
    // Get all sockets
    const sockets = io.sockets.sockets;
    console.log(`Total sockets: ${sockets.size}`);
    
    // Find the socket with matching cid
    for (const [socketId, sock] of sockets.entries()) {
      const socket = sock as IMSocket;
      
      if (socket.cid && socket.cid === dbo.id) {
        console.log(`Found matching socket with ID: ${socketId}`);
        return socket;
      }
    }
    
    console.log(`No matching socket found for ID: ${id}`);
  } catch (error) {
    console.error(`Error in getSocket:`, error);
  }
};
