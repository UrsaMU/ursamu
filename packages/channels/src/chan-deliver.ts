/**
 * Deliver a channel line to listeners — telnet text + web chat UI.
 */
import { rooms, sessions, send, sendPayload } from "@ursamu/core";

export type ChanSpeechKind = "say" | "pose" | "semi";

export type ChanChatOpts = {
  kind: ChanSpeechKind;
  /** Display name (moniker ok). */
  name: string;
  /**
   * Bubble body only:
   *  say  → spoken words (no quotes / "says")
   *  pose → action after name
   *  semi → action glued to name
   */
  text: string;
  /** Channel badge, e.g. PUBLIC */
  tag: string;
  /** Full channel name */
  channel: string;
  actorId: string;
  avatar?: string | null;
};

function socketIdsForChannel(chanName: string): string[] {
  const keys = new Set<string>([
    chanName,
    chanName.toLowerCase(),
  ]);
  const seen = new Set<string>();
  for (const key of keys) {
    try {
      for (const sid of rooms.members(key)) seen.add(sid);
    } catch {
      /* ignore */
    }
  }
  return [...seen];
}

/**
 * Channel badge text for web UI.
 * Preserves MUSH color codes so the client can render them
 * (do not uppercase / truncate — that mangles %c sequences).
 */
export function channelTagFromHeader(
  header: string,
  fallback: string,
): string {
  const h = String(header || "").trim();
  if (h) return h;
  return String(fallback || "CHAN").trim() || "CHAN";
}

/** Plain badge label for aria / logs (codes stripped). */
export function plainChannelTag(
  header: string,
  fallback: string,
): string {
  const raw = channelTagFromHeader(header, fallback);
  const plain = raw
    .replace(/%c[nNrRgGyYbBmMcCwWxXhHuUiI]/gi, "")
    .replace(/%c?<#([0-9a-fA-F]{6})>/gi, "")
    .replace(/<#([0-9a-fA-F]{6})>/g, "")
    .replace(/%x[nNrRgGyYbBmMcCwWxXhHuUiI]/gi, "")
    .replace(/%[nrtbR]/g, "")
    // deno-lint-ignore no-control-regex
    .replace(/\u001b\[[0-9;]*m/g, "")
    .trim();
  return plain || String(fallback || "CHAN");
}

/**
 * Telnet: classic "HEADER body" line.
 * Web: structured chat bubble (same family as say/pose/OOC).
 */
export function deliverChannelSpeech(opts: {
  chanName: string;
  telnetLine: string;
  chat: ChanChatOpts;
}): void {
  const members = socketIdsForChannel(opts.chanName);
  if (!members.length) {
    // Still try broadcast by name (legacy)
    try {
      rooms.broadcast(opts.chanName, opts.telnetLine);
    } catch {
      /* ignore */
    }
    return;
  }

  const ui = {
    type: "chat",
    kind: "channel",
    channelMode: opts.chat.kind,
    tag: opts.chat.tag,
    channel: opts.chat.channel,
    actorId: opts.chat.actorId,
    name: opts.chat.name,
    avatar: opts.chat.avatar ?? null,
    text: opts.chat.text,
    at: Date.now(),
  };

  for (const sid of members) {
    const ct = sessions.get(sid)?.meta?.clientType;
    if (ct === "web") {
      sendPayload(sid, "", { ui });
    } else {
      send([sid], opts.telnetLine);
    }
  }
}

/** Plain system line (join/leave) — text for all, no bubble. */
export function deliverChannelPlain(
  chanName: string,
  line: string,
): void {
  const members = socketIdsForChannel(chanName);
  if (!members.length) {
    try {
      rooms.broadcast(chanName, line);
    } catch {
      /* ignore */
    }
    return;
  }
  send(members, line);
}
