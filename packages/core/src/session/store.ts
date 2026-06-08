import type { ISession } from "./types.ts";

const _store = new Map<string, ISession>();
const _bySession = new Map<string, Set<string>>(); // sessionId/actorId -> Set<socketId>

function makeSession(socketId: string, sessionId: string): ISession {
  const now = Date.now();
  return { socketId, sessionId, connectedAt: now, lastInputAt: now, meta: {} };
}

function _index(key: string | undefined, socketId: string) {
  if (!key) return;
  if (!_bySession.has(key)) _bySession.set(key, new Set());
  _bySession.get(key)!.add(socketId);
}

function _unindex(key: string | undefined, socketId: string) {
  if (!key) return;
  const set = _bySession.get(key);
  if (set) {
    set.delete(socketId);
    if (set.size === 0) _bySession.delete(key);
  }
}

export const sessions = {
  open(socketId: string, sessionId: string): ISession {
    const s = makeSession(socketId, sessionId);
    _store.set(socketId, s);
    _index(sessionId, socketId);
    return s;
  },

  close(socketId: string): void {
    const s = _store.get(socketId);
    if (s) {
      _unindex(s.sessionId, socketId);
      _unindex(s.actorId, socketId);
    }
    _store.delete(socketId);
  },

  get(socketId: string): ISession | undefined {
    return _store.get(socketId);
  },

  getBySession(sessionId: string): ISession | undefined {
    const socketIds = _bySession.get(sessionId);
    if (!socketIds || socketIds.size === 0) return undefined;
    // Return the first available session for this ID
    const socketId = socketIds.values().next().value;
    return socketId ? _store.get(socketId) : undefined;
  },

  authenticate(socketId: string, sessionId: string, meta?: Record<string, unknown>): void {
    const existing = _store.get(socketId);
    if (existing) {
      _unindex(existing.sessionId, socketId);
      _unindex(existing.actorId, socketId);
      existing.sessionId = sessionId;
      _index(sessionId, socketId);
      if (meta) Object.assign(existing.meta, meta);
    } else {
      const s = makeSession(socketId, sessionId);
      if (meta) Object.assign(s.meta, meta);
      _store.set(socketId, s);
      _index(sessionId, socketId);
    }
  },

  setActorId(socketId: string, actorId: string): void {
    const s = _store.get(socketId);
    if (s) {
      _unindex(s.actorId, socketId);
      s.actorId = actorId;
      _index(actorId, socketId);
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
