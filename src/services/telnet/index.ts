import { createServer, Server, Socket } from "net";
import { io, Socket as SocketIOClient } from "socket.io-client";
import { readFile } from "fs/promises";
import { join } from "path";
import cfg from "../../ursamu.config";

export interface ITelnetSocket extends Socket {
  socketIO?: SocketIOClient;
  cid?: number;
}

export class TelnetService {
  private server: Server | null = null;
  private activeSockets = new Map<number, ITelnetSocket>();
  private connectTextPath = join(
    __dirname,
    "../../../text/default_connect.txt",
  );
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;

  private async createSocketIOConnection(
    telnetSocket: ITelnetSocket,
  ): Promise<SocketIOClient> {
    const sock = io(`http://localhost:${cfg.config.server?.ws}`, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    // Handle server disconnection
    sock.on("disconnect", () => {
      telnetSocket.write(
        "\x1b[1mGame>\x1b[0m Server connection lost. Attempting to reconnect...\r\n",
      );
    });

    // Handle reconnection
    sock.io.on("reconnect", () => {
      if (telnetSocket.cid) {
        telnetSocket.write(
          "\x1b[1mGame>\x1b[0m Reconnected to game server.\r\n",
        );
        sock.emit("message", {
          msg: "",
          data: {
            cid: telnetSocket.cid,
          },
        });
      }
    });

    // Handle reconnect failure
    sock.io.on("reconnect_failed", () => {
      telnetSocket.write(
        "\x1b[1mGame>\x1b[0m Failed to reconnect to server. Please try again later.\r\n",
      );
      telnetSocket.end();
    });

    return sock;
  }

  private handleSocketIO(socket: ITelnetSocket, sock: SocketIOClient) {
    socket.socketIO = sock;

    sock.on("message", (data: any) => {
      if (data.data?.cid) {
        socket.cid = data.data.cid;
        this.activeSockets.set(data.data.cid, socket);
      }
      socket.write(data.msg + "\r\n");

      if (data.data?.quit) {
        this.activeSockets.delete(socket.cid!);
        return socket.end();
      }
    });
  }

  private handleTelnetSocket(socket: ITelnetSocket) {
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
        this.activeSockets.delete(socket.cid);
      }
      if (socket.socketIO) {
        socket.socketIO.disconnect();
      }
    });

    socket.on("error", (err) => {
      console.error("Telnet socket error:", err);
      if (socket.cid) {
        this.activeSockets.delete(socket.cid);
      }
      if (socket.socketIO) {
        socket.socketIO.disconnect();
      }
    });
  }

  public async start() {
    try {
      this.server = createServer(async (socket: ITelnetSocket) => {
        try {
          socket.write(
            (await readFile(this.connectTextPath, "utf-8")) + "\r\n",
          );

          const sock = await this.createSocketIOConnection(socket);
          this.handleSocketIO(socket, sock);
          this.handleTelnetSocket(socket);
        } catch (error) {
          console.error("Error in telnet server:", error);
          socket.end();
        }
      });

      this.server.on("error", (err) => {
        console.error("Telnet server error:", err);
      });

      this.server.listen(
        cfg.config.server?.telnet,
        () =>
          console.log(
            `Telnet server listening on port ${cfg.config.server?.telnet}`,
          ),
      );
    } catch (error) {
      console.error("Failed to start telnet server:", error);
      throw error;
    }
  }

  public stop() {
    if (this.server) {
      // Close all active sockets
      for (const [_, socket] of this.activeSockets) {
        if (socket.socketIO) {
          socket.socketIO.disconnect();
        }
        socket.write(
          "\x1b[1mGame>\x1b[0m Server is shutting down. Goodbye!\r\n",
        );
        socket.end();
      }
      this.activeSockets.clear();

      // Close the server
      this.server.close(() => {
        console.log("Telnet server stopped");
      });
      this.server = null;
    }
  }
}

export const telnetService = new TelnetService();
