import express, { NextFunction, Request, Response } from "express";
import { createServer } from "http";
import { IMSocket } from "./@types/IMSocket.ts";
import { cmdParser } from "./services/commands";
import { Server } from "socket.io";
import { dbojs } from "./services/Database";
import { send } from "./services/broadcast";
import { moniker } from "./utils/moniker.ts";
import { joinChans } from "./utils/joinChans.ts";
import { IContext } from "./@types/IContext.ts";
import { setFlags } from "./utils/setFlags.ts";
import { authRouter, dbObjRouter } from "./routes";
import authMiddleware from "./middleware/authMiddleware.ts";
import { IMError } from "./@types";

export const app = express();
export const server = createServer(app);
export const io = new Server(server);

app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/v1/auth/", authRouter);
app.use("/api/v1/dbobj/", authMiddleware, dbObjRouter);

app.use(
  (error: IMError, req: Request, res: Response, next: NextFunction): void => {
    // Handle error here
    console.error(error);
    res
      .status(error.status || 500)
      .json({ error: true, status: error.status, message: error.message });
  }
);

io.on("connection", (socket: IMSocket) => {
  socket.on("message", async (message) => {
    if (message.data.cid) socket.cid = message.data.cid;
    const player = await dbojs.findOne({ id: socket.cid });
    if (player) socket.join(`#${player.location}`);

    if (message.data.disconnect) {
      socket.disconnect();
      return;
    }

    const ctx: IContext = { socket, msg: message.msg };
    joinChans(ctx);
    if (message.msg.trim()) cmdParser.run(ctx);
  });

  socket.on("disconnect", async () => {
    const en = await dbojs.findOne({ id: socket.cid });
    if (!en) return;

    const socks: IMSocket[] = [];
    for (const [id, sock] of io.sockets.sockets.entries()) {
      const s = sock as IMSocket;
      if (s.cid && s.cid === en.id) {
        socks.push(s);
      }
    }

    if (socks.length < 1) {
      await setFlags(en, "!connected");
      return await send(
        [`#${en.location}`],
        `${moniker(en)} has disconnected.`
      );
    }

    return await send(
      [`#${en.location}`],
      `${moniker(en)} has partially disconnected.`
    );
  });

  socket.on("error", () => {
    socket.disconnect();
  });
});
