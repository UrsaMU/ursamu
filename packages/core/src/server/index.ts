import type { ICoreServer, ITransport } from "./types.ts";
import { log } from "../logging/index.ts";

function makeServer(): ICoreServer {
  const _transports: ITransport[] = [];

  return {
    addTransport(t: ITransport): void {
      _transports.push(t);
    },

    async start(): Promise<void> {
      for (const t of _transports) {
        try {
          await t.start();
          log("info", "server:transport-started", { name: t.name });
        } catch (e: unknown) {
          if (t.optional) {
            log("warn", "server:transport-start-skipped", { name: t.name, error: String(e) });
          } else {
            log("error", "server:transport-start-failed", { name: t.name, error: String(e) });
            throw e;
          }
        }
      }
    },

    async stop(): Promise<void> {
      for (let i = _transports.length - 1; i >= 0; i--) {
        try {
          await _transports[i].stop();
          log("info", "server:transport-stopped", { name: _transports[i].name });
        } catch (e: unknown) {
          log("error", "server:transport-stop-failed", { name: _transports[i].name, error: String(e) });
        }
      }
    },
  };
}

export function createServer(): ICoreServer {
  return makeServer();
}

export type { ICoreServer, ITransport } from "./types.ts";
export { websocketTransport, handleWebSocketConnection, clampTermWidth } from "./websocket.ts";
export { telnetTransport, parseNawsBytes, stripIacBytes, accumulateNaws } from "./telnet.ts";
export { httpTransport, registerRoute } from "./http.ts";
