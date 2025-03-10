import { express, RequestHandler, Request, Response } from "../deps.ts";
import { createServer } from "node:http";
import { IMSocket } from "./@types/IMSocket.ts";
import { cmdParser } from "./services/commands/index.ts";
import { Server } from "../deps.ts";
import { joinChans } from "./utils/joinChans.ts";
import { IContext } from "./@types/IContext.ts";
import { authRouter, dbObjRouter } from "./routes/index.ts";
import authMiddleware from "./middleware/authMiddleware.ts";
import { IMError } from "./@types/index.ts";
import { playerForSocket } from "./utils/playerForSocket.ts";

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

// Track connected sockets by character ID
export const connectedSockets = new Map<number, Set<IMSocket>>();

app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/v1/auth/", authRouter);
app.use("/api/v1/dbobj/", authMiddleware, dbObjRouter);

app.use(
  (error: IMError, _req: Request, res: Response, _next: RequestHandler): void => {
    // Handle error here
    console.error(error);
    res
      .status(error.status || 500)
      .json({ error: true, status: error.status, message: error.message });
  },
);

const handleSocketConnection = (socket: IMSocket) => {

  socket.on("message", async (message) => {
    if (message?.data?.cid) socket.cid = message.data.cid;
    const player = await playerForSocket(socket);
    if (player) socket.join(`#${player.location}`);

    if (message?.data?.disconnect) {
      socket.disconnect();
      return;
    }

    const ctx: IContext = { socket, msg: message.msg };
    joinChans(ctx);
    if (message.msg.trim()) cmdParser.run(ctx);
  });

  socket.on("disconnect", () => {
    socket.disconnect();
  });

  socket.on("error", () => {
    socket.disconnect();
  });
};

// Register the socket connection handler
io.on("connection", (socket) => handleSocketConnection(socket as unknown as IMSocket));
