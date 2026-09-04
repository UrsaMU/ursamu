import { sessions } from "../session/store.ts";

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

/**
 * Telnet keeps column wrap. Web clients size their own column in the
 * browser — hard-wrapping makes ASCII/look output look broken.
 */
export function shouldWordWrap(socketId: string): boolean {
  const ct = sessions.get(socketId)?.meta?.clientType;
  if (ct === "web") return false;
  return true;
}

/** Effective wrap width: session NAWS termWidth, else 78. */
export function resolveWrapWidth(socketId?: string): number {
  if (!socketId) return 78;
  const w = sessions.get(socketId)?.meta?.termWidth;
  if (typeof w === "number" && Number.isFinite(w)) {
    const n = Math.trunc(w);
    if (n >= 40 && n <= 250) return n;
  }
  return 78;
}

function prepareOutbound(socketId: string, msg: string): string {
  const body = shouldWordWrap(socketId)
    ? wordWrap(msg, resolveWrapWidth(socketId))
    : msg;
  return _formatter(socketId, body);
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
      // Wrap on source (MUSH %c / plain) for telnet only, then format.
      const formatted = prepareOutbound(id, msg);
      _senders.forEach((fn) => fn(id, formatted));
    }
  }
}

export function notify(socketId: string, msg: string): boolean {
  if (!_sockets.has(socketId)) return false;
  const formatted = prepareOutbound(socketId, msg);
  _senders.forEach((fn) => fn(socketId, formatted));
  return true;
}

export function broadcastAll(msg: string, exclude?: string[]): void {
  const excludeSet = new Set(exclude ?? []);
  for (const id of _sockets) {
    if (!excludeSet.has(id)) {
      const formatted = prepareOutbound(id, msg);
      _senders.forEach((fn) => fn(id, formatted));
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
  // Already-formatted HTML must not be re-wrapped (spaces in tags).
  if (/<\/?span\b/i.test(text) || /<br\s*\/?>/i.test(text)) {
    return text;
  }
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
