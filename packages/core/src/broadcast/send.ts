type SenderFn = (socketId: string, msg: string) => void;

const _senders: SenderFn[] = [];
const _sockets = new Set<string>();

/** Register a transport sender. Multiple transports may register; all are tried. */
export function registerSender(fn: SenderFn): void {
  _senders.push(fn);
}

export function trackSocket(socketId: string): void {
  _sockets.add(socketId);
}

export function untrackSocket(socketId: string): void {
  _sockets.delete(socketId);
}

export function trackedSockets(): ReadonlySet<string> {
  return _sockets;
}

// deno-lint-ignore no-explicit-any
export function send(targets: string[], msg: string, dataOrExclude?: string[] | Record<string, any>, legacyExclude?: string[]): void {
  // Backwards compat: old engine called send(targets, msg, data, exclude)
  // where data was an optional metadata object.  Strip it and use legacyExclude.
  const exclude: string[] = Array.isArray(dataOrExclude)
    ? dataOrExclude
    : (legacyExclude ?? []);
  const excludeSet = new Set(exclude);
  if (targets.length === 0) {
    broadcastAll(msg, [...excludeSet]);
    return;
  }
  for (const id of targets) {
    if (!excludeSet.has(id)) _senders.forEach((fn) => fn(id, msg));
  }
}

export function notify(socketId: string, msg: string): boolean {
  if (!_sockets.has(socketId)) return false;
  _senders.forEach((fn) => fn(socketId, msg));
  return true;
}

export function broadcastAll(msg: string, exclude?: string[]): void {
  const excludeSet = new Set(exclude ?? []);
  for (const id of _sockets) {
    if (!excludeSet.has(id)) _senders.forEach((fn) => fn(id, msg));
  }
}
