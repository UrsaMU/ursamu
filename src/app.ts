import express, { NextFunction, Request, Response } from "express";
import { createServer } from "http";
import { IMSocket } from "./@types/IMSocket";
import { cmdParser } from "./services/commands";
import { Server } from "socket.io";
import { dbojs } from "./services/Database";
import { send } from "./services/broadcast";
import { moniker } from "./utils/moniker";
import { joinChans } from "./utils/joinChans";
import { IContext } from "./@types/IContext";
import { setFlags } from "./utils/setFlags";
import { authRouter, dbObjRouter } from "./routes";
import authMiddleware from "./middleware/authMiddleware";
import { IMError } from "./@types";
import cfg from "./ursamu.config";
import { chans, createObj } from "./services";
import { loadDir, loadTxtDir } from "./utils";
import { join } from "path";
import { pluginService } from "./services/plugins";
import { startIdleCheck } from "./utils/idleCheck";
import {
  clearConnectionTimeout,
  startConnectionTimeout,
} from "./utils/connectionTimeout";

export const app = express();
export const server = createServer(app);
export const io = new Server(server, {
  pingTimeout: 60000,
  pingInterval: 25000,
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true,
  },
});
export { cfg };

// Track connected sockets by character ID
export const connectedSockets = new Map<number, Set<IMSocket>>();

app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/v1/auth/", authRouter);
app.use("/api/v1/dbobj/", authMiddleware, dbObjRouter);

app.use(
  (error: IMError, req: Request, res: Response, next: NextFunction): void => {
    console.error(error);
    res
      .status(error.status || 500)
      .json({ error: true, status: error.status, message: error.message });
  },
);

const handleSocketConnection = (socket: IMSocket) => {
  startConnectionTimeout(socket);

  socket.on("message", async (message) => {
    try {
      if (message.data?.cid) {
        const cid = message.data.cid as number;
        socket.cid = cid;

        clearConnectionTimeout(socket);

        // Add socket to connected sockets map
        if (!connectedSockets.has(cid)) {
          connectedSockets.set(cid, new Set());
        }
        const sockets = connectedSockets.get(cid);
        if (sockets) {
          sockets.add(socket);
        }
      }

      if (socket.cid) {
        const player = await dbojs.findOne({ id: socket.cid });
        if (player) {
          socket.join(`#${player.location}`);
        }
      }

      if (message.data?.disconnect) {
        handleSocketDisconnect(socket);
        return;
      }

      if (message.data?.reconnect && socket.cid) {
        const player = await dbojs.findOne({ id: socket.cid });
        if (player) {
          await setFlags(player, "connected");
          await send(
            [`#${player.location}`],
            `${moniker(player)} reconnects.`,
          );
        }
        return;
      }

      const ctx: IContext = { socket, msg: message.msg };
      joinChans(ctx);
      if (message.msg.trim()) cmdParser.run(ctx);
    } catch (error) {
      console.error("Error handling socket message:", error);
      socket.emit("message", {
        msg: "%ch%crError processing your request. Please try again.%cn\r\n",
        data: { cid: socket.cid },
      });
    }
  });

  socket.on("disconnect", () => handleSocketDisconnect(socket));
  socket.on("error", () => handleSocketDisconnect(socket));
};

const handleSocketDisconnect = async (socket: IMSocket) => {
  try {
    if (!socket.cid) return;

    const sockets = connectedSockets.get(socket.cid);
    if (sockets) {
      sockets.delete(socket);
      if (sockets.size === 0) {
        connectedSockets.delete(socket.cid);
        const en = await dbojs.findOne({ id: socket.cid });
        if (en) {
          await setFlags(en, "!connected");
          await send(
            [`#${en.location}`],
            `${moniker(en)} has disconnected.`,
          );
        }
      } else {
        const en = await dbojs.findOne({ id: socket.cid });
        if (en) {
          await send(
            [`#${en.location}`],
            `${moniker(en)} has partially disconnected.`,
          );
        }
      }
    }
  } catch (error) {
    console.error("Error handling socket disconnect:", error);
  }
};

io.on("connection", handleSocketConnection);

export class UrsaMU {
  constructor() {
    try {
      // Load text files first
      loadTxtDir(join(__dirname, "../text"));
      // Load help files
      loadTxtDir(join(__dirname, "../help"));

      // Load commands
      loadDir(join(__dirname, "commands"));
    } catch (error) {
      console.error("Error loading directories:", error);
    }
  }

  public async start() {
    server.listen(cfg.config.server?.ws, async () => {
      try {
        // Initialize plugins
        await pluginService.initialize();
        console.log("Plugin system initialized");

        const rooms = await dbojs.find({ flags: /room/ });

        if (rooms.length === 0) {
          const room = await createObj("room safe void", { name: "The Void" });
          console.log("The Void created.");
        }

        // create the default channels
        const channels = await chans.find({});
        if (!channels.length) {
          console.log("No channels found, creating some!");
          await chans.insert({
            name: "Public",
            header: "%ch%cc[Public]%cn",
            alias: "pub",
          });

          await chans.insert({
            name: "Admin",
            header: "%ch%cy[Admin]%cn",
            alias: "ad",
            lock: "admin+",
          });
        }

        // Start the idle check system
        startIdleCheck();
        console.log("Idle check system started");

        console.log(`Server started on port ${cfg.config.server?.ws}.`);
      } catch (error) {
        console.error("Error during startup:", error);
      }
    });
  }

  public async stop() {
    // Clean up plugins before stopping
    const plugins = pluginService.getAllPlugins();
    for (const [name, plugin] of plugins) {
      if (plugin.cleanup) {
        await plugin.cleanup();
      }
    }
    server.close();
  }
}
