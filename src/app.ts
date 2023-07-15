import express from "express";
import { createServer } from "http";
import { IMSocket } from "./@types/IMSocket";
import { cmdParser } from "./services/commands";
import { Server } from "socket.io";
import { dbojs } from "./services/Database";
import { flags } from "./services/flags/flags";
import { send } from "./services/broadcast";
import { moniker } from "./utils/moniker";
import { joinChans } from "./utils/joinChans";
import { IContext } from "./@types/IContext";
import { setFlags } from "./utils/setFlags";

export const app = express();
export const server = createServer(app);
export const io = new Server(server);

app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

io.on("connection", (socket: IMSocket) => {
  socket.on("message", async (message) => {
    if (message.data.cid) socket.cid = message.data.cid;
    const player = await dbojs.findOne({ id: socket.cid });
    if (player) socket.join(`#${player.location}`);
    const ctx: IContext = { socket, msg: message.msg };
    joinChans(ctx);
    if (message.msg) cmdParser.run(ctx);
  });

  socket.on("disconnect", async () => {
    const en = await dbojs.findOne({ id: socket.cid });
    if (!en) return;

    await send([`#${en.location}`], `${moniker(en)} has disconnected.`, {});
  });
});
