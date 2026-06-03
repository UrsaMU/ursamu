import type { ISession } from "./types.ts";

const _store = new Map<string, ISession>();

function makeSession(socketId: string, sessionId: string): ISession {
  const now = Date.now();
  return { socketId, sessionId, connectedAt: now, lastInputAt: now, meta: {} };
}

export const sessions = {
  open(socketId: string, sessionId: string): ISession {
    const s = makeSession(socketId, sessionId);
    _store.set(socketId, s);
    return s;
  },

  close(socketId: string): void {
    _store.delete(socketId);
  },

  get(socketId: string): ISession | undefined {
    return _store.get(socketId);
  },

  getBySession(sessionId: string): ISession | undefined {
    for (const s of _store.values()) {
      if (s.sessionId === sessionId) return s;
    }
    return undefined;
  },

  authenticate(socketId: string, sessionId: string, meta?: Record<string, unknown>): void {
    const existing = _store.get(socketId);
    if (existing) {
      existing.sessionId = sessionId;
      if (meta) Object.assign(existing.meta, meta);
    } else {
      const s = makeSession(socketId, sessionId);
      if (meta) Object.assign(s.meta, meta);
      _store.set(socketId, s);
    }
  },

  touch(socketId: string): void {
    const s = _store.get(socketId);
    if (s) s.lastInputAt = Date.now();
  },

  list(): ISession[] {
    return [..._store.values()];
  },

  count(): number {
    return _store.size;
  },
};
