import { connectedSockets } from "../app";
import { dbojs } from "../services/Database";
import { setFlags } from "./setFlags";
import { moniker } from "./moniker";
import { send } from "../services/broadcast";
import { isAdmin } from "./isAdmin";

const IDLE_TIMEOUT = 8 * 60 * 60 * 1000; // 8 hours in milliseconds
const GRACE_PERIOD = 30 * 1000; // 30 second grace period for new connections

export const startIdleCheck = async () => {
  setInterval(async () => {
    try {
      // Get all connected characters
      const connectedChars = await dbojs.find({ flags: /connected/ });
      const now = Date.now();

      for (const char of connectedChars) {
        // Skip staff members
        if (isAdmin(char)) continue;

        const lastCommand = char.lastCommand || 0;
        const idleTime = now - lastCommand;
        const sockets = connectedSockets.get(char.id);
        const timeSinceLogin = now - (char.data?.lastLogin || 0);

        // Give new connections a grace period
        if (timeSinceLogin < GRACE_PERIOD) {
          continue;
        }

        // Check for dead connections (connected flag but no socket)
        if (!sockets || sockets.size === 0) {
          // Double check the character is still marked as connected
          const currentChar = await dbojs.findOne({ id: char.id });
          if (currentChar && currentChar.flags?.includes("connected")) {
            await setFlags(char, "!connected");
            await send(
              [`#${char.location}`],
              `${moniker(char)} has disconnected. (Dead Connection)`,
            );
          }
          continue;
        }

        // Check for idle timeout
        if (idleTime >= IDLE_TIMEOUT) {
          // Notify all connected clients
          for (const socket of sockets) {
            socket.emit("message", {
              msg: "%ch%crYou have been disconnected due to inactivity.%cn\r\n",
              data: { quit: true, cid: char.id },
            });
          }

          // Clear the sockets
          connectedSockets.delete(char.id);

          // Update character flags and notify room
          await setFlags(char, "!connected");
          await send(
            [`#${char.location}`],
            `${moniker(char)} has disconnected. (Idle Timeout)`,
          );
        }
      }
    } catch (error) {
      console.error("Error in idle check:", error);
    }
  }, 1000); // Run every second
};
