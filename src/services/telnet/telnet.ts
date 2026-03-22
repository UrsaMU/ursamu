import { dpath } from "../../../deps.ts";
import { getConfig, initConfig } from "../Config/mod.ts";
import parser from "../parser/parser.ts";

// Telnet protocol constants (RFC 854 / RFC 1073)
const IAC = 255;
const WILL = 251;
const DO = 253;
const DONT = 254;
const SB = 250;
const SE = 240;
const WONT = 252;
const NAWS_OPTION = 31;
const MXP_OPTION = 91;  // MUD eXtension Protocol (RFC pending)

// Suppress unused-variable warnings — kept for readability/completeness
const _WILL = WILL;
const _DONT = DONT;
const _WONT = WONT;

/**
 * Parse a NAWS subnegotiation byte sequence.
 *
 * Expects the full IAC SB 31 ... IAC SE sequence.
 * Returns { width, height } or null if the sequence is malformed or out of range.
 */
export function parseNawsBytes(bytes: Uint8Array): { width: number; height: number } | null {
  // Minimum valid sequence: IAC SB NAWS_OPTION w-hi w-lo h-hi h-lo IAC SE = 9 bytes
  if (bytes.length < 9) return null;
  if (bytes[0] !== IAC || bytes[1] !== SB || bytes[2] !== NAWS_OPTION) return null;
  if (bytes[bytes.length - 2] !== IAC || bytes[bytes.length - 1] !== SE) return null;

  const widthHi = bytes[3];
  const widthLo = bytes[4];
  const heightHi = bytes[5];
  const heightLo = bytes[6];

  const width = (widthHi << 8) | widthLo;
  const height = (heightHi << 8) | heightLo;

  if (width < 40 || width > 250) return null;
  if (height < 1 || height > 255) return null;

  return { width, height };
}

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
      // Relative to project root
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

/**
 * Accumulate bytes across TCP reads to detect NAWS sequences that span chunk boundaries.
 *
 * @param carry - leftover bytes from the previous read (may be empty)
 * @param chunk - the new bytes just read
 * @returns { naws: complete NAWS sequence bytes | null, carry: bytes to carry into next call }
 */
export function accumulateNaws(
  carry: Uint8Array,
  chunk: Uint8Array,
): { naws: Uint8Array | null; carry: Uint8Array } {
  const merged = new Uint8Array(carry.length + chunk.length);
  merged.set(carry);
  merged.set(chunk, carry.length);

  for (let i = 0; i < merged.length; i++) {
    if (merged[i] === 255 && merged[i + 1] === 250 && merged[i + 2] === 31) {
      // Found IAC SB NAWS — look for the closing IAC SE
      for (let j = i + 3; j < merged.length - 1; j++) {
        if (merged[j] === 255 && merged[j + 1] === 240) {
          return { naws: merged.subarray(i, j + 2), carry: new Uint8Array(0) };
        }
      }
      // Closing IAC SE not yet arrived — carry the partial sequence forward
      return { naws: null, carry: merged.subarray(i) };
    }
  }
  return { naws: null, carry: new Uint8Array(0) };
}

async function handleTelnetConnection(conn: Deno.Conn, wsPort: number, welcome: string) {
  let sock: WebSocket | null = null;
  let cid: string | undefined;
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

  // Send IAC WILL MXP to offer MXP support
  let mxpEnabled = false;
  await write(new Uint8Array([IAC, WILL, MXP_OPTION]));

  await write(parser.substitute("telnet", welcome) + "\r\n");

  const connect = () => {
      const wsUrl = `ws://localhost:${wsPort}`;
      sock = new WebSocket(wsUrl);

      sock.onopen = () => {
        if (isReconnecting) {
            write(parser.substitute("telnet", "%chGame>%cn Server is back! Reconnected.\r\n"));

            if (cid) {
               sock?.send(JSON.stringify({
                   msg: "look",
                   data: { cid }
               }));
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

          // If message is meant for Telnet, it should be in 'msg' (formatted ANSI)
          if (payload.msg) {
            let out = payload.msg;
            // Process MXP send tags: \x03MXP[command|text]\x03
            if (mxpEnabled) {
              out = out.replace(/\x03MXP\[([^\|]+)\|([^\]]+)\]\x03/g,
                '\x1b[4z<send href="$1">$2</send>');
            } else {
              // Strip MXP markers, show plain text
              out = out.replace(/\x03MXP\[([^\|]+)\|([^\]]+)\]\x03/g, '$2');
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
  let nawsCarry: Uint8Array = new Uint8Array(0); // carry-over for NAWS sequences that span chunk boundaries
  try {
    while (true) {
      const n = await conn.read(buffer);
      if (n === null) break; // EOF

      const chunk = buffer.subarray(0, n);

      // --- NAWS subnegotiation detection (handles split TCP frames) ---
      const { naws: nawsSeq, carry } = accumulateNaws(nawsCarry, chunk);
      nawsCarry = carry;
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
        if (chunk[i] === IAC && chunk[i + 1] === DO && chunk[i + 2] === MXP_OPTION) {
          mxpEnabled = true;
          // Send MXP mode line to activate default MXP
          await write(new Uint8Array([0x1b, 0x5b, 0x37, 0x7a])); // ESC [ 7 z — MXP open/secure mode
        }
        if (chunk[i] === IAC && chunk[i + 1] === DONT && chunk[i + 2] === MXP_OPTION) {
          mxpEnabled = false;
        }
      }

      const raw = new TextDecoder().decode(chunk);

         // Filter Telnet IAC sequences and non-printable chars
        // IAC sequences start with 0xFF (\xff)
        const msg = raw
          .replace(/\xff[\xfb-\xfe]./g, "") // IAC DO/DONT/WILL/WONT <opt>
          .replace(/\xff[\xf0-\xfa].*/g, "") // IAC SB/SE/etc (strip remainder of subneg)
          .replace(/\xff\xff/g, "\xff")    // Escaped IAC
          // deno-lint-ignore no-control-regex
          .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "") // Non-printable ASCII
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