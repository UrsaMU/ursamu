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
      const wrapped = wordWrap(formatted);
      _senders.forEach((fn) => fn(id, wrapped));
    }
  }
}

export function notify(socketId: string, msg: string): boolean {
  if (!_sockets.has(socketId)) return false;
  const formatted = _formatter(socketId, msg);
  const wrapped = wordWrap(formatted);
  _senders.forEach((fn) => fn(socketId, wrapped));
  return true;
}

export function broadcastAll(msg: string, exclude?: string[]): void {
  const excludeSet = new Set(exclude ?? []);
  for (const id of _sockets) {
    if (!excludeSet.has(id)) {
      const formatted = _formatter(id, msg);
      const wrapped = wordWrap(formatted);
      _senders.forEach((fn) => fn(id, wrapped));
    }
  }
}

const isDivider = (line: string): boolean => {
  const stripped = line
    .replace(/%c[a-zA-Z]/g, "")
    .replace(/%[nrtbR]/g, "")
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
    .replace(/<#[0-9a-fA-F]{6}>/g, "")
    .trim();
  if (stripped.length === 0) return false;
  return /^(.)\1{4,}$/.test(stripped);
};

export function wordWrap(text: string, width = 78): string {
  return text
    .split("\n")
    .map((line) => {
      const cleanLine = line
        .replace(/%c[a-zA-Z]/g, "")
        .replace(/%[nrtbR]/g, "")
        .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
        .replace(/<#[0-9a-fA-F]{6}>/g, "");
      if (cleanLine.length <= width || isDivider(line)) {
        return line;
      }

      const match = line.match(/^(\s+)/);
      const indent = match ? match[1] : "";
      const content = match ? line.slice(indent.length) : line;

      const words = content.split(" ");
      let current = "";
      const result: string[] = [];

      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        const cleanCandidate = (indent + candidate)
          .replace(/%c[a-zA-Z]/g, "")
          .replace(/%[nrtbR]/g, "")
          .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
          .replace(/<#[0-9a-fA-F]{6}>/g, "");
        if (cleanCandidate.length <= width) {
          current = candidate;
        } else {
          if (current) result.push(indent + current);
          current = word;
        }
      }
      if (current) result.push(indent + current);
      return result.join("\n");
    })
    .join("\n");
}
