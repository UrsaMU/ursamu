/**
 * Minimal Discord Gateway client for MESSAGE_CREATE (inbound chat).
 * Intents: GUILDS | GUILD_MESSAGES | MESSAGE_CONTENT
 */

import { getBotCredentials, gameChannelForDiscord } from "./config.ts";
import { injectChannelMessage } from "./channel-bridge.ts";
import { channelEvents } from "@ursamu/channels";

const INTENTS = (1 << 0) | (1 << 9) | (1 << 15); // GUILDS, GUILD_MESSAGES, MESSAGE_CONTENT
const API = "https://discord.com/api/v10";

let _ws: WebSocket | null = null;
let _heartbeat: number | undefined;
let _seq: number | null = null;
let _sessionId: string | null = null;
let _botUserId: string | null = null;
let _stopping = false;
let _reconnectTimer: number | undefined;

export function stopGateway(): void {
  _stopping = true;
  if (_heartbeat !== undefined) {
    clearInterval(_heartbeat);
    _heartbeat = undefined;
  }
  if (_reconnectTimer !== undefined) {
    clearTimeout(_reconnectTimer);
    _reconnectTimer = undefined;
  }
  try {
    _ws?.close();
  } catch (_e: unknown) {
    /* ignore */
  }
  _ws = null;
}

export async function startGateway(): Promise<boolean> {
  const creds = getBotCredentials();
  if (!creds) {
    console.log(
      "[discord] Gateway skipped — DISCORD_BOT_TOKEN not set.",
    );
    return false;
  }
  _stopping = false;
  return await connect(creds.botToken);
}

async function connect(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${API}/gateway/bot`, {
      headers: { Authorization: `Bot ${token}` },
    });
    if (!res.ok) {
      console.error(
        `[discord] Gateway bot URL failed: ${res.status}`,
      );
      scheduleReconnect(token);
      return false;
    }
    const data = await res.json() as { url: string };
    const url = `${data.url}/?v=10&encoding=json`;
    const ws = new WebSocket(url);
    _ws = ws;

    ws.onopen = () => {
      console.log("[discord] Gateway connecting…");
    };

    ws.onmessage = (ev) => {
      void onMessage(token, String(ev.data));
    };

    ws.onclose = () => {
      if (_heartbeat !== undefined) {
        clearInterval(_heartbeat);
        _heartbeat = undefined;
      }
      _ws = null;
      if (!_stopping) {
        console.warn("[discord] Gateway closed — reconnecting…");
        scheduleReconnect(token);
      }
    };

    ws.onerror = () => {
      console.error("[discord] Gateway socket error");
    };
    return true;
  } catch (e: unknown) {
    console.error("[discord] Gateway connect error:", e);
    scheduleReconnect(token);
    return false;
  }
}

function scheduleReconnect(token: string): void {
  if (_stopping) return;
  if (_reconnectTimer !== undefined) return;
  _reconnectTimer = setTimeout(() => {
    _reconnectTimer = undefined;
    void connect(token);
  }, 5000) as unknown as number;
}

// deno-lint-ignore no-explicit-any
async function onMessage(token: string, raw: string): Promise<void> {
  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch (_e: unknown) {
    return;
  }

  if (payload.s != null) _seq = payload.s;

  switch (payload.op) {
    case 10: { // Hello
      const interval = payload.d?.heartbeat_interval as number ?? 41250;
      if (_heartbeat !== undefined) clearInterval(_heartbeat);
      _heartbeat = setInterval(() => {
        _ws?.send(JSON.stringify({ op: 1, d: _seq }));
      }, interval) as unknown as number;

      if (_sessionId) {
        _ws?.send(JSON.stringify({
          op: 6,
          d: {
            token,
            session_id: _sessionId,
            seq: _seq,
          },
        }));
      } else {
        _ws?.send(JSON.stringify({
          op: 2,
          d: {
            token,
            intents: INTENTS,
            properties: {
              os: "linux",
              browser: "ursamu",
              device: "ursamu",
            },
          },
        }));
      }
      break;
    }
    case 0: { // Dispatch
      const t = payload.t as string;
      if (t === "READY") {
        _sessionId = payload.d?.session_id ?? null;
        _botUserId = payload.d?.user?.id ?? null;
        console.log("[discord] Gateway READY.");
      } else if (t === "MESSAGE_CREATE") {
        await onMessageCreate(payload.d);
      }
      break;
    }
    case 7: // Reconnect
      _ws?.close();
      break;
    case 9: // Invalid session
      _sessionId = null;
      _ws?.close();
      break;
    default:
      break;
  }
}

// deno-lint-ignore no-explicit-any
async function onMessageCreate(msg: any): Promise<void> {
  if (!msg || msg.webhook_id) return; // loop: ignore webhook posts
  if (msg.author?.bot) return;
  if (_botUserId && msg.author?.id === _botUserId) return;

  const channelId = String(msg.channel_id ?? "");
  if (!channelId) return;

  const gameChan = await gameChannelForDiscord(channelId);
  if (!gameChan) return;

  const content = String(msg.content ?? "").trim();
  if (!content) return;

  const displayName = String(
    msg.member?.nick || msg.author?.global_name || msg.author?.username ||
      "Discord",
  );

  const ok = await injectChannelMessage({
    channelName: gameChan,
    displayName,
    text: content,
  });
  if (!ok) return;

  // Emit with source so outbound webhook skips
  await channelEvents.emit("channel:message", {
    channelName: gameChan,
    senderId: `discord:${msg.author?.id ?? "unknown"}`,
    senderName: displayName,
    message: content,
    source: "discord",
  });
}
