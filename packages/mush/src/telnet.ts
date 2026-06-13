import * as dpath from "@std/path";
import { getConfig, initConfig } from "@ursamu/core";
import parser from "./render/parser.ts";
import {
  IAC, WILL, DO, DONT, WONT, NAWS_OPTION,
  parseNawsBytes, stripIacBytes, accumulateNaws,
} from "@ursamu/core";

const MXP_OPTION = 91; // MUD eXtension Protocol (option 91)

export { parseNawsBytes, stripIacBytes, accumulateNaws } from "@ursamu/core";

interface ITelnetSocket {
  cid?: string;
  write(data: string | Uint8Array): void;
  end(): void;
}

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
 */
export const startTelnetServer = async (options?: {
  port?: number;
  welcomeFile?: string;
  wsPort?: number;
}): Promise<Deno.Listener> => {
  await initConfig();
  const port = options?.port ?? getConfig<number>("server.telnet") ?? 4201;
  const wsPort = options?.wsPort ?? getConfig<number>("server.wsPort") ?? getConfig<number>("server.http") ?? 4203;
  const welcomeFile = options?.welcomeFile || getConfig<string>("game.text.connect") || "text/default_connect.txt";

  const __dirname = import.meta.url.startsWith("file://")
    ? dpath.dirname(dpath.fromFileUrl(import.meta.url))
    : Deno.cwd();
  
  const projectRoot = Deno.cwd();

  try {
    const possiblePaths = [
      welcomeFile.startsWith('/') ? welcomeFile : null,
      dpath.join(projectRoot, welcomeFile),
      dpath.join(projectRoot, 'text', welcomeFile.split('/').pop() || ''),
      dpath.join(projectRoot, 'text/default_connect.txt'),
      dpath.join(__dirname, 'text/default_connect.txt')
    ].filter(Boolean) as string[];

    let welcomePath: string | null = null;
    let welcome = '';

    for (const path of possiblePaths) {
      if (path) {
        try {
          await Deno.stat(path);
          welcomePath = path;
          break;
        } catch {
          continue;
        }
      }
    }

    if (welcomePath) {
      console.log(`Loading welcome file from: ${welcomePath}`);
      welcome = await Deno.readTextFile(welcomePath);
    } else {
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

    const listener = Deno.listen({ port, reusePort: true } as Deno.ListenOptions);
    console.log(`Telnet server listening on port ${port}`);

    (async () => {
      for await (const conn of listener) {
        handleTelnetConnection(conn, wsPort, welcome);
      }
    })();

    return listener;
  } catch (error) {
    console.error("Error starting telnet server:", error);
    throw error;
  }
};

export const MAX_MSG_BUFFER_SIZE = 200;

async function handleTelnetConnection(conn: Deno.Conn, wsPort: number, welcome: string) {
  let sock: WebSocket | null = null;
  let cid: string | undefined;
  let sessionToken: string | undefined;
  const msgBuffer: string[] = [];
  let isReconnecting = false;
  let manuallyClosed = false;
  let hasConnectedOnce = false;

  const encoder = new TextEncoder();

  const write = async (data: string | Uint8Array) => {
    try {
      if (typeof data === "string") {
        await conn.write(encoder.encode(data));
      } else {
        await conn.write(data);
      }
    } catch {
      // Connection likely closed
    }
  };

  await write(new Uint8Array([IAC, DO, NAWS_OPTION]));

  let mxpEnabled = false;
  await write(new Uint8Array([IAC, WILL, MXP_OPTION]));

  await write(parser.substitute("telnet", welcome) + "\r\n");

  const connect = () => {
      const wsUrl = `ws://localhost:${wsPort}`;
      sock = new WebSocket(wsUrl);

      sock.onopen = () => {
        if (isReconnecting) {
            if (sessionToken) {
              sock?.send(JSON.stringify({ type: "auth", token: sessionToken }));
              write(parser.substitute("telnet", "%chGame>%cn Server is back! Reconnected.\r\n"));
              if (cid) sock?.send(JSON.stringify({ msg: "look", data: { cid } }));
            } else {
              write(parser.substitute("telnet", "%chGame>%cn Server is back. Please reconnect.\r\n"));
            }
            isReconnecting = false;
        }
        hasConnectedOnce = true;

        while(msgBuffer.length > 0) {
          const msg = msgBuffer.shift();
          if(msg) sock?.send(msg);
        }
      };

      sock.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.data?.cid) cid = payload.data.cid;
          if (typeof payload.data?.token === "string") {
            sessionToken = payload.data.token;
            sock?.send(JSON.stringify({ type: "auth", token: sessionToken }));
          }

          if (payload.msg) {
            let out: string = parser.substitute("telnet", payload.msg);
            const mxpPattern = /\x03MXP\[([^\|]+)\|([^\]]+)\]\x03/g;
            if (mxpEnabled) {
              out = out.replace(mxpPattern, '\x1b[4z<send href="$1">$2</send>');
            } else {
              out = out.replace(mxpPattern, "$2");
            }
            write(out.replace(/[\r\n]+$/, "") + "\r\n");
          }

          if (payload.data?.quit) {
            manuallyClosed = true;
            conn.close();
            sock?.close();
          }

          if (payload.data?.shutdown) {
              manuallyClosed = true;
              conn.close();
              sock?.close();
              Deno.exit(0);
          }
        } catch (e) {
          console.error("Telnet WS Parse Error", e);
        }
      };

      sock.onclose = () => {
        if (!manuallyClosed) {
             if (!isReconnecting) {
                 if (hasConnectedOnce) {
                   write(parser.substitute("telnet", "%chGame>%cn Server is restarting...\r\n"));
                 }
                 isReconnecting = true;
             }
             
             setTimeout(() => {
                 connect();
             }, 1000);
        }
      };

      sock.onerror = (_e) => {
      };
  };

  connect();

  const buffer = new Uint8Array(16384);
  let nawsCarry: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  try {
    while (true) {
      const n = await conn.read(buffer);
      if (n === null) break;

      const chunk = buffer.subarray(0, n);

      const { naws: nawsSeq, carry } = accumulateNaws(nawsCarry, chunk as Uint8Array<ArrayBuffer>);
      nawsCarry = carry as Uint8Array<ArrayBuffer>;
      if (nawsSeq !== null) {
        const parsed = parseNawsBytes(nawsSeq);
        if (parsed && cid) {
          if (sock && (sock as WebSocket).readyState === WebSocket.OPEN) {
            (sock as WebSocket).send(JSON.stringify({
              msg: "",
              data: { cid, termWidth: parsed.width }
            }));
          }
        }
      }

      for (let i = 0; i < chunk.length - 2; i++) {
        if (chunk[i] === IAC && chunk[i + 1] === DO   && chunk[i + 2] === MXP_OPTION) {
          mxpEnabled = true;
          await write(new Uint8Array([0x1b, 0x5b, 0x37, 0x7a]));
        }
        if (chunk[i] === IAC && chunk[i + 1] === DONT && chunk[i + 2] === MXP_OPTION) {
          mxpEnabled = false;
        }
      }

      const cleaned = stripIacBytes(chunk);
      const raw = new TextDecoder().decode(cleaned);

      const msg = raw
        .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")
        .trim();

      if (sock && (sock as WebSocket).readyState === WebSocket.OPEN) {
        if (msg) {
          (sock as WebSocket).send(JSON.stringify({
            msg,
            data: { cid }
          }));
        }
      } else {
        if(msg) {
          if (msgBuffer.length >= MAX_MSG_BUFFER_SIZE) msgBuffer.shift();
          msgBuffer.push(JSON.stringify({
            msg,
            data: { cid }
          }));
        }
      }
    }
  } catch (_err) {
  } finally {
    manuallyClosed = true;
    try { conn.close(); } catch { /* ignore */ }
    if (sock && (sock as WebSocket).readyState === WebSocket.OPEN) (sock as WebSocket).close();
  }
}

if (import.meta.main) {
  try {
    await startTelnetServer({
      welcomeFile: "text/default_connect.txt"
    });
    console.log("Telnet server is running!");
  } catch (err) {
    console.error("Failed to start telnet server:", err instanceof Error ? err.message : String(err));
    Deno.exit(1);
  }
}
