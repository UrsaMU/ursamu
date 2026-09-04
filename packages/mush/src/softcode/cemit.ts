/**
 * Softcode / @cemit channel delivery via core rooms.
 */
import { rooms } from "@ursamu/core";
import { chans } from "../world/dbobjs.ts";

const CEMIT_PREFIX = "\x00cemit\x00";

/** True if message is a softcode cemit sentinel. */
export function isCemitSentinel(msg: string): boolean {
  return typeof msg === "string" && msg.startsWith(CEMIT_PREFIX);
}

/**
 * Parse `\x00cemit\x00channel\x00message` → parts.
 * Returns null if not a cemit sentinel.
 */
export function parseCemitSentinel(
  msg: string,
): { channel: string; text: string } | null {
  if (!isCemitSentinel(msg)) return null;
  const rest = msg.slice(CEMIT_PREFIX.length);
  const i = rest.indexOf("\x00");
  if (i < 0) {
    return { channel: rest.trim(), text: "" };
  }
  return {
    channel: rest.slice(0, i).trim(),
    text: rest.slice(i + 1),
  };
}

/**
 * Broadcast to a named channel room. Looks up header from chans DB
 * when available; otherwise sends the body alone.
 */
export async function deliverCemit(
  channel: string,
  text: string,
  opts?: { noHeader?: boolean },
): Promise<boolean> {
  const name = channel.trim();
  if (!name) return false;
  let line = text;
  if (!opts?.noHeader) {
    try {
      const all = await chans.query({});
      const chan = all.find(
        (c) =>
          String(c.name ?? "").toLowerCase() === name.toLowerCase() ||
          String(c.id ?? "").toLowerCase() === name.toLowerCase(),
      );
      if (chan) {
        const header = String(
          (chan as { header?: string }).header ?? `[${chan.name}]`,
        );
        line = `${header} ${text}`.trim();
        // Prefer canonical room key = channel name
        rooms.broadcast(String(chan.name), line);
        rooms.broadcast(String(chan.name).toLowerCase(), line);
        return true;
      }
    } catch {
      /* chans unavailable */
    }
  }
  rooms.broadcast(name, line);
  rooms.broadcast(name.toLowerCase(), line);
  return true;
}

/** Handle sentinel from softcode output.broadcast / send. */
export async function handleCemitSentinel(msg: string): Promise<boolean> {
  const parsed = parseCemitSentinel(msg);
  if (!parsed) return false;
  await deliverCemit(parsed.channel, parsed.text);
  return true;
}
