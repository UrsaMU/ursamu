import { readFileSync, existsSync } from "node:fs";
import { Socket, createServer } from "node:net";
import { join } from "node:path";
import { Buffer } from "node:buffer";
import { dpath, io } from "../../../deps.ts";
import { getConfig } from "../Config/mod.ts";
import parser from "../parser/parser.ts";

interface ITelnetSocket extends Socket {
  cid?: string;
}

// Define a specific interface for the message data
interface ISocketMessage {
  msg: string;
  data?: {
    cid?: string;
    quit?: boolean;
    reconnect?: boolean;
    [key: string]: unknown;
  };
}

/**
 * Start a telnet server for the UrsaMU game
 * @param options Configuration options for the telnet server
 * @returns The telnet server instance
 */
export const startTelnetServer = (options?: {
  port?: number;
  welcomeFile?: string;
  wsPort?: number;
}) => {
  const port = options?.port || getConfig<number>("server.telnet");
  const wsPort = options?.wsPort || getConfig<number>("server.ws");
  const welcomeFile = options?.welcomeFile || getConfig<string>("game.text.connect") || "text/default_connect.txt";
  
  const __dirname = dpath.dirname(dpath.fromFileUrl(import.meta.url));
  const projectRoot = dpath.dirname(dpath.dirname(dpath.dirname(__dirname)));
  
  try {
    // Try multiple possible locations for the welcome file
    const possiblePaths = [
      // Absolute path
      welcomeFile.startsWith('/') ? welcomeFile : null,
      // Relative to project root
      join(projectRoot, welcomeFile),
      // Relative to text directory in project root
      join(projectRoot, 'text', welcomeFile.split('/').pop() || ''),
      // Default fallback
      join(projectRoot, 'text/default_connect.txt'),
      // Another fallback
      join(__dirname, '../../../text/default_connect.txt')
    ].filter(Boolean) as string[];
    
    let welcomePath: string | null = null;
    let welcome = '';
    
    // Try each path until we find one that exists
    for (const path of possiblePaths) {
      if (path && existsSync(path)) {
        welcomePath = path;
        break;
      }
    }
    
    if (welcomePath) {
      console.log(`Loading welcome file from: ${welcomePath}`);
      welcome = readFileSync(welcomePath, "utf8");
    } else {
      // If no file is found, use a default welcome message
      console.log("No welcome file found, using default welcome message");
      welcome = `
%ch%cc==================================%cn
%ch%cw Welcome to %cyUrsaMU%cn
%ch%cc==================================%cn

A modern MUSH-like engine written in TypeScript.

%ch%cwType %cy'connect <n> <password>'%cw to connect.%cn
%ch%cwType %cy'create <n> <password>'%cw to create a new character.%cn
%ch%cwType %cy'quit'%cw to disconnect.%cn
`;
    }

    const server = createServer((socket: ITelnetSocket) => {
      const sock = io(`http://localhost:${wsPort}`);
      socket.write(welcome + "\r\n");

      sock.on("message", (data: ISocketMessage) => {
        if (data.data?.cid) socket.cid = data.data.cid;
        socket.write(data.msg + "\r\n");

        if (data.data?.quit) return socket.end();
      });

      socket.on("disconnect", () => sock.close());
      socket.on("error", () => sock.close());

      sock.io.on("reconnect", () => {
        socket.write(
          parser.substitute("telnet", "%ch%cg-%cn @reboot Complete.\r\n")
        );
        if (socket.cid) {
          sock.emit("message", {
            msg: "",
            data: {
              cid: socket.cid,
              reconnect: true,
            },
          });
        }
      });

      sock.io.on("reconnect_attempt", () => {
        if (socket.cid) {
          sock.emit("message", {
            msg: "",
            data: {
              cid: socket.cid,
              reconnect: true,
            },
          });
        }
      });

      sock.on("error", () => socket.end());

      socket.on("data", (data: Buffer) => {
        if (socket.cid) {
          sock.emit("message", { msg: data.toString(), data: { cid: socket.cid } });
        } else {
          sock.emit("message", { msg: data.toString() });
        }
      });

      socket.on("end", () => {
        sock.disconnect();
      });

      socket.on("error", (err) => {
        console.log(err);
      });
    });

    server.listen(port, () =>
      console.log(`Telnet server listening on port ${port}`)
    );

    return server;
  } catch (error) {
    console.error("Error starting telnet server:", error);
    throw error;
  }
}; 