import type { IPlugin } from "../../@types/IPlugin.ts";
import { registerPluginRoute } from "../../app.ts";
import { chargenRouteHandler } from "./router.ts";
import { chargenHooks, registerChargenHooks } from "./hooks.ts";
import { wsService } from "../../services/WebSocket/index.ts";
import { send } from "../../services/broadcast/index.ts";
import { dbojs } from "../../services/Database/index.ts";
// Import commands to trigger their addCmd registration at init time
import "./commands.ts";

export { chargenHooks } from "./hooks.ts";
export type { ChargenHookMap } from "./hooks.ts";

const chargenPlugin: IPlugin = {
  name: "chargen",
  version: "1.0.0",
  description: "Character generation system for new players",

  init: () => {
    registerPluginRoute("/api/v1/chargen", chargenRouteHandler);

    // Wire aconnect hook
    registerChargenHooks();

    // Notify online staff when a player submits their application
    chargenHooks.on("chargen:submitted", async (app) => {
      const sockets = wsService.getConnectedSockets();
      const notified = new Set<string>();
      for (const sock of sockets) {
        if (!sock.cid || notified.has(sock.cid)) continue;
        const playerObj = await dbojs.queryOne({ id: sock.cid });
        if (!playerObj) continue;
        const flags = playerObj.flags || "";
        if (flags.includes("superuser") || flags.includes("admin") || flags.includes("wizard")) {
          send([sock.id], `%ch>CHARGEN:%cn New application submitted by ${app.data.playerId}.`);
          notified.add(sock.cid);
        }
      }
    });

    console.log("[chargen] Plugin initialized — +chargen commands active, /api/v1/chargen routes registered");
    return true;
  },

  remove: () => {
    console.log("[chargen] Plugin removed");
  },
};

export default chargenPlugin;
