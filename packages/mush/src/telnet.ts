import { dpath } from "../../../deps.ts";
import { getConfig, initConfig } from "@ursamu/core";
import { parser } from "@ursamu/mush";
import {
  IAC, WILL, DO, DONT, WONT, NAWS_OPTION,
  parseNawsBytes, stripIacBytes, accumulateNaws,
} from "@ursamu/core";

const MXP_OPTION = 91; // MUD eXtension Protocol (option 91)

// Suppress unused-variable warnings — kept for readability/completeness
const _WILL = WILL;
const _DONT = DONT;
const _WONT = WONT;

// parseNawsBytes, stripIacBytes, accumulateNaws are imported from @ursamu/core above.
// Re-export them so callers of this file get them without a separate import.
export { parseNawsBytes, stripIacBytes, accumulateNaws } from "@ursamu/core";

interface ITelnetSocket {
  cid?: string;
  write(data: string | Uint8Array): void;
  end(): void;
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
export const startTelnetServer = async (options?: {
  port?: number;
  welcomeFile?: string;
  wsPort?: number;
}): Promise<Deno.Listener> => {
  // Ensure config is loaded so custom ports in config.json are respected
  await initConfig();
  const port = options?.port ?? getConfig<number>("server.telnet") ?? 4201;
  const wsPort = options?.wsPort ?? getConfig<number>("server.http") ?? 4203;
  const welcomeFile = options?.welcomeFile || getConfig<string>("game.text.connect") || "text/default_connect.txt";

  let __dirname;
  try {
    if (import.meta.url.startsWith("file://")) {
      __dirname = dpath.dirname(dpath.fromFileUrl(import.meta.url));
    } else {
      __dirname = Deno.cwd();
    }
  } catch {
    __dirname = Deno.cwd();
  }
  
  const projectRoot = import.meta.url.startsWith("file://") ? 
    dpath.dirname(dpath.dirname(dpath.dirname(__dirname))) : Deno.cwd();

  try {
    // Try multiple possible locations for the welcome file
    const possiblePaths = [
      // Absolute path
      welcomeFile.startsWith('/') ? welcomeFile : null,
      // Relative to CWD (where the game process is launched from — highest priority)
      dpath.join(Deno.cwd(), welcomeFile),
      // Relative to project root (engine monorepo root)
      dpath.join(projectRoot, welcomeFile),
      // Relative to text directory in project root
      dpath.join(projectRoot, 'text', welcomeFile.split('/').pop() || ''),
      // Default fallback
      dpath.join(projectRoot, 'text/default_connect.txt'),
      // Another fallback
      dpath.join(__dirname, '../../../text/default_connect.txt')
    ].filter(Boolean) as string[];

    let welcomePath: string | null = null;
    let welcome = '';

    // Try each path until we find one that exists
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

    const listener = Deno.listen({ port, reusePort: true } as Deno.ListenOptions);
    console.log(`Telnet server listening on port ${port}`);

    // Handle connections
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

/** Maximum number of commands buffered during a WS reconnect (prevents heap exhaustion). */
export const MAX_MSG_BUFFER_SIZE = 200;

async function handleTelnetConnection(conn: Deno.Conn, wsPort: number, _welcome: string) {
  let sock: WebSocket | null = null;
  let cid: string | undefined;
  // Session token issued by the engine on successful login. Persisted across
  // WS reconnects so the player doesn't have to log in again after @restart.
  let sessionToken: string | undefined;
  const msgBuffer: string[] = [];
  let isReconnecting = false;
  let manuallyClosed = false;

  const encoder = new TextEncoder();

  // Helper to write to connection
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

  // Send IAC DO NAWS to request window size from the client
  await write(new Uint8Array([IAC, DO, NAWS_OPTION]));

  // Offer MXP support; client responds IAC DO 91 to accept or IAC DONT 91 to decline
  let mxpEnabled = false;
  await write(new Uint8Array([IAC, WILL, MXP_OPTION]));

  const connect = () => {
      const wsUrl = `ws://localhost:${wsPort}?clientType=telnet${isReconnecting ? "&reconnect=true" : ""}`;
      sock = new WebSocket(wsUrl);

      sock.onopen = () => {
        if (isReconnecting) {
            // Re-authenticate first so the engine restores the player's cid
            // before any buffered commands are dispatched.
            if (sessionToken) {
              sock?.send(JSON.stringify({ type: "auth", token: sessionToken }));
              write(parser.substitute("telnet", "%chGame>%cn Server is back! Reconnected.\r\n"));
              if (cid) sock?.send(JSON.stringify({ msg: "look", data: { cid } }));
            } else {
              write(parser.substitute("telnet", "%chGame>%cn Server is back. Please reconnect.\r\n"));
            }
            isReconnecting = false;
        }

        // Flush buffer
        while(msgBuffer.length > 0) {
          const msg = msgBuffer.shift();
          if(msg) sock?.send(msg);
        }
      };

      sock.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.data?.cid) cid = payload.data.cid;
          if (typeof payload.data?.token === "string") sessionToken = payload.data.token;

          // If message is meant for Telnet, it should be in 'msg' (formatted ANSI)
          if (payload.msg) {
            let out: string = payload.msg;
            // Expand or strip MXP markers produced by the %mxp[] parser substitution
            // deno-lint-ignore no-control-regex
            const mxpPattern = /\x03MXP\[([^\|]+)\|([^\]]+)\]\x03/g;
            if (mxpEnabled) {
              // ESC [ 4 z activates MXP open mode; wrap text in <send> tag
              out = out.replace(mxpPattern, '\x1b[4z<send href="$1">$2</send>');
            } else {
              // Non-MXP clients get the plain-text portion only
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
                 write(parser.substitute("telnet", "%chGame>%cn Server is restarting...\r\n"));
                 isReconnecting = true;
             }
             
             // Retry connection in 1 second
             setTimeout(() => {
                 connect();
             }, 1000);
        }
      };

      sock.onerror = (_e) => {
          // Error often precedes close, so we handle logic in onclose or just let it close
      };
  };

  // Initial connection
  connect();

  // Read from Telnet
  const buffer = new Uint8Array(16384);
  let nawsCarry: Uint8Array<ArrayBuffer> = new Uint8Array(0); // carry-over for NAWS sequences that span chunk boundaries
  try {
    while (true) {
      const n = await conn.read(buffer);
      if (n === null) break; // EOF

      const chunk = buffer.subarray(0, n);

      // --- NAWS subnegotiation detection (handles split TCP frames) ---
      const { naws: nawsSeq, carry } = accumulateNaws(nawsCarry, chunk as Uint8Array<ArrayBuffer>);
      nawsCarry = carry as Uint8Array<ArrayBuffer>;
      if (nawsSeq !== null) {
        const parsed = parseNawsBytes(nawsSeq);
        if (parsed && cid) {
          // Forward termWidth to the WS hub so the player's DB record can be updated
          if (sock && (sock as WebSocket).readyState === WebSocket.OPEN) {
            (sock as WebSocket).send(JSON.stringify({
              msg: "",
              data: { cid, termWidth: parsed.width }
            }));
          }
        }
      }

      // --- MXP negotiation detection ---
      for (let i = 0; i < chunk.length - 2; i++) {
        if (chunk[i] === IAC && chunk[i + 1] === DO   && chunk[i + 2] === MXP_OPTION) {
          mxpEnabled = true;
          // ESC [ 7 z — activate MXP open/secure mode
          await write(new Uint8Array([0x1b, 0x5b, 0x37, 0x7a]));
        }
        if (chunk[i] === IAC && chunk[i + 1] === DONT && chunk[i + 2] === MXP_OPTION) {
          mxpEnabled = false;
        }
      }

      // Strip Telnet IAC sequences at the byte level. We can't do this after
      // UTF-8 decoding because lone 0xFF bytes become U+FFFD replacement chars
      // and the byte-level patterns no longer match.
      const cleaned = stripIacBytes(chunk);
      const raw = new TextDecoder().decode(cleaned);

      const msg = raw
        // deno-lint-ignore no-control-regex
        .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "") // non-printable ASCII
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
          // Cap buffer to prevent heap exhaustion during long disconnects
          if (msgBuffer.length >= MAX_MSG_BUFFER_SIZE) msgBuffer.shift();
          msgBuffer.push(JSON.stringify({
            msg,
            data: { cid }
          }));
        }
      }
    }
  } catch (_err) {
    // console.log("Connection Error:", err);
  } finally {
    manuallyClosed = true;
    try { conn.close(); } catch { /* ignore */ }
    if (sock && (sock as WebSocket).readyState === WebSocket.OPEN) (sock as WebSocket).close();
  }
} 