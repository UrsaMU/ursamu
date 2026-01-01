import { dpath } from "../../../deps.ts";
import { getConfig } from "../Config/mod.ts";

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
  const port = options?.port || getConfig<number>("server.telnet");
  const wsPort = options?.wsPort || getConfig<number>("server.http") || 4203;
  const welcomeFile = options?.welcomeFile || getConfig<string>("game.text.connect") || "text/default_connect.txt";

  const __dirname = dpath.dirname(dpath.fromFileUrl(import.meta.url));
  const projectRoot = dpath.dirname(dpath.dirname(dpath.dirname(__dirname)));

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

    const listener = Deno.listen({ port });
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

async function handleTelnetConnection(conn: Deno.Conn, wsPort: number, welcome: string) {
  const wsUrl = `ws://localhost:${wsPort}`;
  const sock = new WebSocket(wsUrl);
  let cid: string | undefined;

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

  await write(welcome + "\r\n");

  sock.onopen = () => {
    // Telnet just connected to WS
  };

  sock.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.data?.cid) cid = payload.data.cid;

      // If message is meant for Telnet, it should be in 'msg' (formatted ANSI)
      if (payload.msg) {
        write(payload.msg + "\r\n");
      }

      if (payload.data?.quit) {
        conn.close();
        sock.close();
      }
    } catch (e) {
      console.error("Telnet WS Parse Error", e);
    }
  };

  sock.onclose = () => {
    try { conn.close(); } catch { /* ignore */ }
  };

  sock.onerror = (_e) => {
    try { conn.close(); } catch { /* ignore */ }
  };

  // Read from Telnet
  const buffer = new Uint8Array(1024);
  try {
    while (true) {
      const n = await conn.read(buffer);
      if (n === null) break; // EOF

      if (sock.readyState === WebSocket.OPEN) {
        const raw = new TextDecoder().decode(buffer.subarray(0, n));
        
        // Filter Telnet IAC sequences and non-printable chars
        // IAC sequences start with 0xFF (\xff)
        const msg = raw
          .replace(/\xff[\xfb-\xfe]./g, "") // IAC DO/DONT/WILL/WONT <opt>
          .replace(/\xff[\xf0-\xfa]/g, "") // IAC SB/SE/etc
          .replace(/\xff\xff/g, "\xff")    // Escaped IAC
          .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "") // Non-printable ASCII
          .trim();

        if (msg) {
          sock.send(JSON.stringify({
            msg,
            data: { cid }
          }));
        }
      }
    }
  } catch (_err) {
    // console.log("Connection Error:", err);
  } finally {
    try { conn.close(); } catch { /* ignore */ }
    if (sock.readyState === WebSocket.OPEN) sock.close();
  }
} 