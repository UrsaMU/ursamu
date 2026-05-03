/**
 * Local dev client — connect to a running UrsaMU server via TCP.
 *
 * Usage:
 *   deno run -A src/cli/client.ts [--port 4201] [--host localhost]
 *   deno task client
 *
 * Handles IAC telnet negotiation (WILL/DO → WONT/DONT), strips control
 * bytes from server output, and forwards stdin lines to the server.
 */

import { parse } from "jsr:@std/flags@^0.224.0";

const args = parse(Deno.args, {
  default: { port: 4201, host: "localhost" },
  string: ["host"],
});

const host = args.host as string;
const port = Number(args.port) || 4201;

// ── IAC telnet constants ──────────────────────────────────────────────────────
const IAC  = 255;
const WILL = 251;
const WONT = 252;
const DO   = 253;
const DONT = 254;
const SB   = 250;
const SE   = 240;

/**
 * Walk through raw bytes from the server.
 * - Respond to WILL/DO with WONT/DONT (dumb client — no feature negotiation).
 * - Skip SB...SE subnegotiation blocks.
 * - Return printable bytes.
 */
function processIAC(raw: Uint8Array, conn: Deno.Conn): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < raw.length) {
    if (raw[i] !== IAC) { out.push(raw[i++]); continue; }
    i++;
    if (i >= raw.length) break;
    const cmd = raw[i++];
    if (cmd === SB) {
      // Skip subnegotiation block: IAC SB ... IAC SE
      while (i < raw.length) {
        if (raw[i] === IAC && i + 1 < raw.length && raw[i + 1] === SE) { i += 2; break; }
        i++;
      }
      continue;
    }
    if (cmd === WILL || cmd === DO) {
      const option = raw[i++] ?? 0;
      // WILL → DONT, DO → WONT
      conn.write(new Uint8Array([IAC, cmd === WILL ? DONT : WONT, option])).catch(() => {});
      continue;
    }
    if (cmd === WONT || cmd === DONT) { i++; continue; }
    if (cmd === IAC) { out.push(IAC); }
  }
  return new Uint8Array(out);
}

async function* readLines(): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  const buf = new Uint8Array(1024);
  let partial = "";
  while (true) {
    const n = await Deno.stdin.read(buf);
    if (n === null) break;
    partial += decoder.decode(buf.slice(0, n));
    const lines = partial.split("\n");
    partial = lines.pop() ?? "";
    for (const line of lines) yield line.replace(/\r$/, "");
  }
}

// ── Connect ───────────────────────────────────────────────────────────────────

console.log(`Connecting to ${host}:${port} ...`);
let conn: Deno.Conn;
try {
  conn = await Deno.connect({ hostname: host, port });
} catch (e) {
  console.error(`Could not connect: ${(e as Error).message}`);
  console.error("Is the server running? Try: deno task dev");
  Deno.exit(1);
}
console.log("Connected. Type 'QUIT' to disconnect.\n");

// ── Server → stdout (background) ─────────────────────────────────────────────
(async () => {
  const buf = new Uint8Array(4096);
  try {
    while (true) {
      const n = await conn.read(buf);
      if (n === null) { console.log("\n[Server closed the connection]"); Deno.exit(0); }
      await Deno.stdout.write(processIAC(buf.slice(0, n), conn));
    }
  } catch { console.log("\n[Disconnected]"); Deno.exit(0); }
})();

// ── stdin → server ────────────────────────────────────────────────────────────
const encoder = new TextEncoder();
for await (const line of readLines()) {
  if (line.trim().toUpperCase() === "QUIT") { conn.close(); Deno.exit(0); }
  try {
    await conn.write(encoder.encode(line + "\r\n"));
  } catch {
    console.log("[Write failed — server may have disconnected]");
    Deno.exit(1);
  }
}
