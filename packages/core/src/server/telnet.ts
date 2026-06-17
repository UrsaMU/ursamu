import type { ITransport } from "./types.ts";
import type { ICoreContext } from "../dispatch/types.ts";
import { runPipeline } from "../dispatch/pipeline.ts";
import { sessions } from "../session/store.ts";
import { trackSocket, untrackSocket, registerSender } from "../broadcast/send.ts";
import { gameHooks } from "../events/hooks.ts";
import { getConfig } from "../config/mod.ts";
import { log } from "../logging/index.ts";

export const IAC = 255;
export const WILL = 251;
export const DO = 253;
export const DONT = 254;
export const WONT = 252;
export const SB = 250;
export const SE = 240;
export const NAWS_OPTION = 31;

const _senders = new Map<string, (msg: string) => void>();

const TELNET_RATE_LIMIT  = 10;
const TELNET_RATE_WINDOW = 1000;
interface TRateEntry { count: number; resetAt: number; }
const _rateLimits = new Map<string, TRateEntry>();

function isRateLimited(socketId: string): boolean {
  const now   = Date.now();
  const entry = _rateLimits.get(socketId);
  if (!entry || now >= entry.resetAt) {
    _rateLimits.set(socketId, { count: 1, resetAt: now + TELNET_RATE_WINDOW });
    return false;
  }
  entry.count++;
  return entry.count > TELNET_RATE_LIMIT;
}

export function parseNawsBytes(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 9) return null;
  if (bytes[0] !== IAC || bytes[1] !== SB || bytes[2] !== NAWS_OPTION) return null;
  if (bytes[bytes.length - 2] !== IAC || bytes[bytes.length - 1] !== SE) return null;
  const width = (bytes[3] << 8) | bytes[4];
  const height = (bytes[5] << 8) | bytes[6];
  if (width < 40 || width > 250) return null;
  if (height < 1 || height > 255) return null;
  return { width, height };
}

export function stripIacBytes(chunk: Uint8Array): Uint8Array {
  const out = new Uint8Array(chunk.length);
  let w = 0;
  for (let i = 0; i < chunk.length; i++) {
    const b = chunk[i];
    if (b !== IAC) { out[w++] = b; continue; }
    const next = chunk[i + 1];
    if (next === undefined) break;
    if (next === IAC) { out[w++] = IAC; i += 1; continue; }
    if (next === SB) {
      let j = i + 2;
      while (j < chunk.length - 1 && !(chunk[j] === IAC && chunk[j + 1] === SE)) j++;
      i = j + 1;
      continue;
    }
    if (next >= 0xFB && next <= 0xFE) { i += 2; continue; }
    i += 1;
  }
  return out.subarray(0, w);
}

export function accumulateNaws(
  carry: Uint8Array,
  chunk: Uint8Array,
): { naws: Uint8Array | null; carry: Uint8Array } {
  const merged = new Uint8Array(carry.length + chunk.length);
  merged.set(carry);
  merged.set(chunk, carry.length);
  for (let i = 0; i < merged.length; i++) {
    if (merged[i] === IAC && merged[i + 1] === SB && merged[i + 2] === NAWS_OPTION) {
      for (let j = i + 3; j < merged.length - 1; j++) {
        if (merged[j] === IAC && merged[j + 1] === SE) {
          return { naws: merged.slice(i, j + 2), carry: new Uint8Array(0) };
        }
      }
      return { naws: null, carry: merged.slice(i) };
    }
  }
  return { naws: null, carry: new Uint8Array(0) };
}

function makeSend(conn: Deno.TcpConn): (msg: string) => void {
  const enc = new TextEncoder();
  return (msg: string) => {
    conn.write(enc.encode(msg + "\r\n")).catch((e: unknown) => {
      log("warn", "telnet:write-failed", { error: String(e) });
    });
  };
}

async function handleTelnetConnection(conn: Deno.TcpConn): Promise<void> {
  const socketId = crypto.randomUUID();
  const send = makeSend(conn);
  _senders.set(socketId, send);
  trackSocket(socketId);
  const session = sessions.open(socketId, "");
  session.meta.clientType = "telnet";
  await gameHooks.emit("session:open", { socketId });
  log("info", "telnet:open", { socketId });

  await conn.write(new Uint8Array([IAC, DO, NAWS_OPTION]));

  const buf = new Uint8Array(16384);
  let nawsCarry: Uint8Array<ArrayBuffer> = new Uint8Array(0);

  const runInput = async (input: string) => {
    if (isRateLimited(socketId)) {
      log("warn", "telnet:rate-limited", { socketId });
      return;
    }
    sessions.touch(socketId);
    const session = sessions.get(socketId);
    const ctx: ICoreContext = {
      socketId,
      sessionId: session?.sessionId ?? null,
      input,
      args: [],
      send,
    };
    try {
      await runPipeline(ctx);
    } catch (e: unknown) {
      log("error", "telnet:pipeline-error", { socketId, error: String(e) });
    }
  };

  try {
    while (true) {
      const n = await conn.read(buf);
      if (n === null) break;
      const chunk = buf.subarray(0, n);

      const { naws: nawsSeq, carry } = accumulateNaws(nawsCarry, chunk as Uint8Array<ArrayBuffer>);
      nawsCarry = carry as Uint8Array<ArrayBuffer>;
      if (nawsSeq !== null) {
        const parsed = parseNawsBytes(nawsSeq);
        if (parsed) {
          const session = sessions.get(socketId);
          if (session) session.meta.termWidth = parsed.width;
        }
      }

      const cleaned = stripIacBytes(chunk);
      const raw = new TextDecoder().decode(cleaned);
      // deno-lint-ignore no-control-regex
      const input = raw.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "").trim();
      if (input) await runInput(input);
    }
  } catch (e: unknown) {
    log("debug", "telnet:read-error", { socketId, error: String(e) });
  } finally {
    _senders.delete(socketId);
    _rateLimits.delete(socketId);
    untrackSocket(socketId);
    const session = sessions.get(socketId);
    const sessionId = session?.sessionId ?? null;
    const actorId = (session as { actorId?: string | null })?.actorId ?? null;
    await gameHooks.emit("session:close", { socketId, sessionId, actorId });
    sessions.close(socketId);
    log("info", "telnet:close", { socketId });
    try { conn.close(); } catch { /* already closed */ }
  }
}

let _listener: Deno.TcpListener | null = null;

export const telnetTransport: ITransport = {
  name: "telnet",
  optional: true,

  start(): Promise<void> {
    const port = getConfig<number>("server.telnetPort", 4202);
    _listener = Deno.listen({ port } as Deno.ListenOptions) as Deno.TcpListener;
    log("info", "telnet:start", { port });
    registerSender((socketId, msg) => {
      const send = _senders.get(socketId);
      if (send) send(msg);
    });
    (async () => {
      if (!_listener) return;
      for await (const conn of _listener) {
        handleTelnetConnection(conn as Deno.TcpConn);
      }
    })();
    return Promise.resolve();
  },

  async stop(): Promise<void> {
    _listener?.close();
    _listener = null;
    log("info", "telnet:stop", {});
    await Promise.resolve();
  },
};
