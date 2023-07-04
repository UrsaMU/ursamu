import express from "express";
import { createServer } from "http";
import { IMSocket } from "./@types/IMSocket";
import { cmdParser } from "./services/commands";
import { Server } from "socket.io";
import { dbojs } from "./services/Database";

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
    socket.join(`#${socket.cid}`);
    if (player) socket.join(`#${player.location}`);
    cmdParser.run({ socket, msg: message.msg });
  });
});
