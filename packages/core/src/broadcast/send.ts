type SenderFn = (socketId: string, msg: string) => void;
export type FormatterFn = (socketId: string, msg: string) => string;

const _senders: SenderFn[] = [];
const _sockets = new Set<string>();
let _formatter: FormatterFn = (_socketId, msg) => msg;

/** Register a transport sender. Multiple transports may register; all are tried. */
export function registerSender(fn: SenderFn): void {
  _senders.push(fn);
}

export function setFormatter(fn: FormatterFn): void {
  _formatter = fn;
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
    if (!excludeSet.has(id)) {
      const formatted = _formatter(id, msg);
      _senders.forEach((fn) => fn(id, formatted));
    }
  }
}

export function notify(socketId: string, msg: string): boolean {
  if (!_sockets.has(socketId)) return false;
  const formatted = _formatter(socketId, msg);
  _senders.forEach((fn) => fn(socketId, formatted));
  return true;
}

export function broadcastAll(msg: string, exclude?: string[]): void {
  const excludeSet = new Set(exclude ?? []);
  for (const id of _sockets) {
    if (!excludeSet.has(id)) {
      const formatted = _formatter(id, msg);
      _senders.forEach((fn) => fn(id, formatted));
    }
  }
}
