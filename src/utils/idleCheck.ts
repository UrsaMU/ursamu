import { connectedSockets } from "../app";
import { dbojs } from "../services/Database";
import { setFlags } from "./setFlags";
import { moniker } from "./moniker";
import { send } from "../services/broadcast";

const IDLE_TIMEOUT = 8 * 60 * 60 * 1000; // 8 hours in milliseconds

export const startIdleCheck = async () => {
  setInterval(async () => {
    try {
      // Get all connected characters
      const connectedChars = await dbojs.find({ flags: /connected/ });

      for (const char of connectedChars) {
        // Skip staff members
        if (char.flags.includes("staff")) continue;

        const now = Date.now();
        const lastCommand = char.lastCommand || 0;
        const idleTime = now - lastCommand;

        // Check for dead connections (connected flag but no socket)
        const hasSocket = connectedSockets.has(char.id);
        if (!hasSocket) {
          await setFlags(char, "!connected");
          await send(
            [`#${char.location}`],
            `${moniker(char)} has disconnected. (Dead Connection)`
          );
          continue;
        }

        // Check for idle timeout
        if (idleTime >= IDLE_TIMEOUT) {
          // Get all sockets for this character
          const sockets = connectedSockets.get(char.id);
          if (sockets) {
            // Notify all connected clients
            for (const socket of sockets) {
              socket.emit("message", {
                msg: "%ch%crYou have been disconnected due to inactivity.%cn\r\n",
                data: { quit: true, cid: char.id },
              });
            }
            // Clear the sockets
            connectedSockets.delete(char.id);
          }

          // Update character flags and notify room
          await setFlags(char, "!connected");
          await send(
            [`#${char.location}`],
            `${moniker(char)} has disconnected. (Idle Timeout)`
          );
        }
      }
    } catch (error) {
      console.error("Error in idle check:", error);
    }
  }, 1000); // Run every second
};
