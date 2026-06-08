/**
 * Bridge: WebSocket utilities → @ursamu/core.
 *
 * The real WS transport lives in packages/core/src/server/websocket.ts.
 * This module provides a legacy wsService shim whose methods are referenced
 * throughout the Sandbox handlers and SDK. It maintains a local socket registry
 * so send/broadcast work even when the full server transport is not started.
 */
import {
  sessions,
  closeSocket as coreCloseSocket,
  listSocketIds,
  registerSender,
  gameHooks,
  verifyToken,
} from "@ursamu/core";
export { clampTermWidth, websocketTransport } from "@ursamu/core";
import { handleWebSocketConnection } from "@ursamu/core";
import type { UserSocket } from "../../@types/IMSocket.ts";

// Decode JWT on auth and set actorId on the session so cid resolves correctly.
gameHooks.on("session:auth", async (e: { socketId: string; sessionId: string }) => {
  try {
    const payload = await verifyToken(e.sessionId);
    const userId = payload.id as string;
    if (!userId) return;
    sessions.setActorId(e.socketId, userId);
  } catch { /* invalid JWT — ignore */ }
});

// Size guard: core enforces MAX_MSG_BYTES = 65536 before JSON.parse in handleMessage.
// See packages/core/src/server/websocket.ts for the event.data.length check.
const MAX_MSG_BYTES = 65536; // mirrors core constant — do not raise without updating core

// Local registry: socketId → actual WebSocket object (for direct send)
const _localSockets = new Map<string, WebSocket>();

// Register our sender so core's send() dispatches to our local map.
registerSender((socketId: string, msg: string) => {
  const ws = _localSockets.get(socketId);
  if (ws?.readyState === 1 /* OPEN */) {
    try { ws.send(msg); } catch { /* closing */ }
  }
});

function makeSocketProxy(socketId: string): UserSocket {
  const proxy: UserSocket = {
    id:         socketId,
    clientType: "web",
    channels:   new Set<string>(),
    join(_room: string) {},
    leave(_room: string) {},
    disconnect(_close?: boolean) { closeSocketById(socketId); },
    on(_event: string, _listener: (...args: unknown[]) => void) {},
  };
  // Live getter so cid reflects session.actorId after auth
  Object.defineProperty(proxy, "cid", {
    get() {
      const s = sessions.get(socketId);
      return s?.actorId ?? "";
    },
    set(v: string | undefined) {
      if (v) sessions.setActorId(socketId, v);
    },
    enumerable: true, configurable: true,
  });
  return proxy;
}

function closeSocketById(socketId: string): void {
  const ws = _localSockets.get(socketId);
  ws?.close();
  _localSockets.delete(socketId);
  coreCloseSocket(socketId);
}

// ── wsService shim ────────────────────────────────────────────────────────────

class WsServiceShim {
  getConnectedSockets(): UserSocket[] {
    return listSocketIds().map(makeSocketProxy);
  }

  send(targets: string[], message: { payload?: { msg?: string; data?: unknown } }): void {
    const text = message?.payload?.msg ?? "";
    if (!text || targets.length === 0) return;
    const payload = JSON.stringify({ msg: text });
    for (const id of targets) {
      const ws = _localSockets.get(id);
      if (ws?.readyState === 1) { try { ws.send(payload); } catch { /* closing */ } }
      // Also try cid-based lookup
      else {
        const sess = sessions.getBySession(id);
        if (sess) {
          const ws2 = _localSockets.get(sess.socketId);
          if (ws2?.readyState === 1) {
            try { ws2.send(payload); } catch { /* closing */ }
          }
        }
      }
    }
  }

  broadcast(message: { payload?: { msg?: string } }): void {
    const text = message?.payload?.msg ?? "";
    if (!text) return;
    const payload = JSON.stringify({ msg: text });
    for (const ws of _localSockets.values()) {
      if (ws.readyState === 1) { try { ws.send(payload); } catch { /* closing */ } }
    }
  }

  disconnect(cid: string): void {
    const sess = sessions.getBySession(cid);
    if (sess) {
      const ws = _localSockets.get(sess.socketId);
      if (ws) {
        ws.close();
        _localSockets.delete(sess.socketId);
        coreCloseSocket(sess.socketId);
      }
    }
  }

  joinSocketToRoom(_socketId: string, _room: string): void {}

  getIdleSecs(playerId: string): number {
    const session = sessions.getBySession(playerId);
    if (!session) return -1;
    return Math.floor((Date.now() - session.lastInputAt) / 1000);
  }

  handleConnection(socket: WebSocket, _clientType?: string, _preAuthUserId?: string, remoteIp = ""): string | null {
    const socketId = handleWebSocketConnection(socket, remoteIp);
    if (socketId) {
      _localSockets.set(socketId, socket);
      socket.addEventListener("close", () => { _localSockets.delete(socketId); });
    }
    return socketId;
  }

  static getInstance(): WsServiceShim { return wsService; }
}

export const wsService = new WsServiceShim();
export const WebSocketService = WsServiceShim;
