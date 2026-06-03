import { broadcastAll, send } from "./send.ts";

const _rooms = new Map<string, Set<string>>();
const _membership = new Map<string, Set<string>>();

export const rooms = {
  join(socketId: string, room: string): void {
    if (!_rooms.has(room)) _rooms.set(room, new Set());
    _rooms.get(room)!.add(socketId);
    if (!_membership.has(socketId)) _membership.set(socketId, new Set());
    _membership.get(socketId)!.add(room);
  },

  leave(socketId: string, room: string): void {
    _rooms.get(room)?.delete(socketId);
    if (_rooms.get(room)?.size === 0) _rooms.delete(room);
    _membership.get(socketId)?.delete(room);
    if (_membership.get(socketId)?.size === 0) _membership.delete(socketId);
  },

  leaveAll(socketId: string): void {
    const joined = _membership.get(socketId);
    if (!joined) return;
    for (const room of joined) {
      _rooms.get(room)?.delete(socketId);
      if (_rooms.get(room)?.size === 0) _rooms.delete(room);
    }
    _membership.delete(socketId);
  },

  broadcast(room: string, msg: string, exclude?: string[]): void {
    const members = _rooms.get(room);
    if (!members) return;
    send([...members], msg, exclude);
  },

  members(room: string): string[] {
    return [...(_rooms.get(room) ?? [])];
  },

  roomsOf(socketId: string): string[] {
    return [...(_membership.get(socketId) ?? [])];
  },

  broadcastAll(msg: string, exclude?: string[]): void {
    broadcastAll(msg, exclude);
  },
};
