import { createServer, Socket } from "net";
import { io } from "socket.io-client";
import cfg from "./ursamu.config";
import { join } from "path";
import { readFile } from "fs/promises";

const connectTextPath = join(__dirname, "../text/default_connect.txt");

interface ITelnetSocket extends Socket {
  cid?: number;
  socketIO?: any;
  reconnecting?: boolean;
}

const activeSockets = new Map<number, ITelnetSocket>();

const handleSocketIO = (socket: ITelnetSocket, sock: any) => {
  socket.socketIO = sock;

  sock.on("message", (data: any) => {
    if (data.data?.cid) {
      socket.cid = data.data.cid;
      activeSockets.set(data.data.cid, socket);
    }
    socket.write(data.msg + "\r\n");

    if (data.data?.quit) {
      activeSockets.delete(socket.cid!);
      return socket.end();
    }
  });

  sock.io.on("reconnect", () => {
    if (socket.cid) {
      socket.write("\x1b[1mGame>\x1b[0m Reconnected to game server.\r\n");
      sock.emit("message", {
        msg: "",
        data: {
          cid: socket.cid,
        },
      });
    }
  });
};

const handleTelnetSocket = (socket: ITelnetSocket) => {
  socket.on("data", (data) => {
    if (socket.socketIO) {
      socket.socketIO.emit("message", {
        msg: data.toString(),
        data: { cid: socket.cid },
      });
    }
  });

  socket.on("end", () => {
    if (socket.cid) {
      activeSockets.delete(socket.cid);
    }
    if (socket.socketIO) {
      socket.socketIO.disconnect();
    }
  });

  socket.on("error", (err) => {
    console.error("Telnet socket error:", err);
    if (socket.cid) {
      activeSockets.delete(socket.cid);
    }
    if (socket.socketIO) {
      socket.socketIO.disconnect();
    }
  });
};

const server = createServer(async (socket: ITelnetSocket) => {
  try {
    socket.write((await readFile(connectTextPath, "utf-8")) + "\r\n");

    const sock = io(`http://localhost:${cfg.config.server?.ws}`, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    handleSocketIO(socket, sock);
    handleTelnetSocket(socket);
  } catch (error) {
    console.error("Error in telnet server:", error);
    socket.end();
  }
});

server.on("error", (err) => {
  console.error("Telnet server error:", err);
});

server.listen(
  cfg.config.server?.telnet,
  () =>
    console.log(`Telnet server listening on port ${cfg.config.server?.telnet}`),
);

export { activeSockets };
