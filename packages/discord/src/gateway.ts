/**
 * Minimal Discord Gateway client for MESSAGE_CREATE (inbound chat).
 * Intents: GUILDS | GUILD_MESSAGES | MESSAGE_CONTENT
 */

import { getBotCredentials, gameChannelForDiscord } from "./config.ts";
import { injectChannelMessage } from "./channel-bridge.ts";
import { channelEvents } from "@ursamu/channels";

const INTENTS = (1 << 0) | (1 << 9) | (1 << 12) | (1 << 15); // GUILDS, GUILD_MESSAGES, DIRECT_MESSAGES, MESSAGE_CONTENT
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

    ws.onclose = (ev) => {
      if (_heartbeat !== undefined) {
        clearInterval(_heartbeat);
        _heartbeat = undefined;
      }
      _ws = null;
      if (!_stopping) {
        console.warn(
          `[discord] Gateway closed (${ev.code}) — reconnecting…`,
        );
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
        console.log(`[discord] Received MESSAGE_CREATE from ${payload.d?.author?.username}: "${payload.d?.content}"`);
        await onMessageCreate(token, payload.d);
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
async function onMessageCreate(token: string, msg: any): Promise<void> {
  if (!msg || msg.webhook_id) return; // loop: ignore webhook posts
  if (msg.author?.bot) return;
  if (_botUserId && msg.author?.id === _botUserId) return;

  const channelId = String(msg.channel_id ?? "");
  if (!channelId) return;

  let content = String(msg.content ?? "").trim();

  // Handle +help trigger directly in Discord chat (works in any channel)
  if (content.toLowerCase().startsWith("+help")) {
    const topicArg = content.slice(5).trim();
    const { helpRegistry, slugify } = await import("@ursamu/help");
    const { embedForEntry, embedForIndex, embedNotFound } = await import("./help-embed.ts");
    
    let embed;
    if (topicArg) {
      const slug = slugify(topicArg);
      const entry = await helpRegistry.lookup(slug);
      if (entry) {
        embed = embedForEntry(entry);
      } else {
        // Fall back to checking if the argument is a section name
        const { embedForSection } = await import("./help-embed.ts");
        const sectionEntries = await helpRegistry.inSection(slug);
        if (sectionEntries.length > 0) {
          embed = embedForSection(topicArg, sectionEntries);
        } else {
          embed = embedNotFound(topicArg);
        }
      }
    } else {
      const sections = await helpRegistry.sections();
      const all = await helpRegistry.all();
      const visible = all.filter((e) => !e.hidden);
      embed = embedForIndex(sections, visible.length);
    }

    // Post the reply to the same channel via Discord REST API
    try {
      await fetch(`${API}/channels/${channelId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bot ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          embeds: [embed],
          message_reference: { message_id: msg.id }, // Reply to the user's message
        }),
      });
    } catch (e: unknown) {
      console.error("[discord] Failed to reply with help embed:", e);
    }
    return;
  }

  // Handle +register <PIN> trigger in direct DMs or text channels
  if (content.toLowerCase().startsWith("+register")) {
    const pin = content.slice(9).trim();
    let replyText = "Invalid PIN format. Use: `+register <6-digit-pin>`";
    
    if (/^\d{6}$/.test(pin)) {
      const { dbojs } = await import("@ursamu/mush");
      // Find the player with matching unexpired PIN
      const player = await dbojs.queryOne({
        "state.discordTempPin": pin,
      });

      const state = player?.state as any;
      if (player && state?.discordPinExpires && state.discordPinExpires > Date.now()) {
        const ps = { ...(player.state as any) || {} };
        delete ps.discordTempPin;
        delete ps.discordPinExpires;
        ps.discordId = msg.author.id;
        ps.discordUsername = msg.author.username;

        await dbojs.modify({ id: player.id }, "$set", { "state": ps });
        
        const charName = player.data?.name || player.name || "Unknown";
        replyText = `✅ **Account Linked!**\nYour Discord account has been successfully linked to character: **${charName}** (${player.id}).`;
      } else {
        replyText = "❌ **Registration Failed:** PIN not found or expired. Generate a new PIN using `@discord/register` inside the game.";
      }
    }

    try {
      await fetch(`${API}/channels/${channelId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bot ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: replyText,
          message_reference: { message_id: msg.id },
        }),
      });
    } catch (e: unknown) {
      console.error("[discord] Failed to reply to +register:", e);
    }
    return;
  }

  // Handle in-game command execution (+jobs, +job, +request) directly from Discord
  const cmdLower = content.toLowerCase();
  if (cmdLower.startsWith("+jobs") || cmdLower.startsWith("+job") || cmdLower.startsWith("+request")) {
    const { dbojs, cmds, evaluateLock, hydrate } = await import("@ursamu/mush");
    
    // Resolve the linked character
    const player = await dbojs.queryOne({
      "state.discordId": msg.author.id,
    });

    if (!player) {
      try {
        await fetch(`${API}/channels/${channelId}/messages`, {
          method: "POST",
          headers: {
            Authorization: `Bot ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: "❌ **Access Denied:** Your Discord account is not linked to any character. Use `@discord/register` inside the game first.",
            message_reference: { message_id: msg.id },
          }),
        });
      } catch (e: unknown) {
        console.error("[discord] Failed to reply unlink error:", e);
      }
      return;
    }

    // Capture output that would normally go to telnet
    const outputLines: string[] = [];
    const hydratedPlayer = hydrate(player);
    const charName = player.data?.name || player.name || "Unknown";

    // Parse the command switches and arguments
    const parts = content.split(" ");
    const cmdRootAndSw = parts[0];
    const cmdArg = parts.slice(1).join(" ").trim();
    
    const swMatch = cmdRootAndSw.match(/^\+(\w+)(?:\/(\S+))?/i);
    const cmdName = swMatch ? `+${swMatch[1]}` : cmdRootAndSw;
    const cmdSwitches = swMatch && swMatch[2] ? swMatch[2].split("/") : [];

    const cmd = cmds.find((c) => c.name.toLowerCase() === cmdName.toLowerCase());
    if (!cmd) {
      outputLines.push(`❌ Command ${cmdName} not found.`);
    } else if (!(await evaluateLock(cmd.lock || "", hydratedPlayer, hydratedPlayer))) {
      outputLines.push("❌ Permission denied.");
    } else {
      let finalArgs = [cmdSwitches.join("/") || undefined, cmdArg];
      const match = content.match(cmd.pattern) ?? 
                    (content.replace(/^[@+]/, "").match(cmd.pattern));
      if (match) {
        finalArgs = match.slice(1);
      }

      const mockSDK = {
        me: hydratedPlayer,
        cmd: {
          name: cmdName,
          original: content,
          args: finalArgs,
          switches: cmdSwitches,
        },
        send: (text: string) => {
          outputLines.push(text);
        },
        db: dbojs,
        util: {
          stripSubs: (s: string) => s.replace(/%c[a-zA-Z0-9]/gi, "").replace(/%[rnth]/g, ""),
        },
      };

      // Execute the command in the MUSH engine
      try {
        await (cmd.exec(mockSDK as any) as any);
      } catch (e: unknown) {
        console.error(`[discord] Exec proxy failed for ${content}:`, e);
        outputLines.push("Error executing command.");
      }
    }

    // Clean up MUSH color tags for Discord presentation
    const { markdownToDiscord } = await import("./help-embed.ts");
    const { COLORS } = await import("./helpers.ts");
    const cleanOutput = markdownToDiscord(outputLines.join("\n"));

    // Send the response privately via Direct Message (DM)
    try {
      // 1. Create a DM channel with the user
      const dmChannelRes = await fetch(`${API}/users/@me/channels`, {
        method: "POST",
        headers: {
          Authorization: `Bot ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient_id: msg.author.id,
        }),
      });

      if (dmChannelRes.ok) {
        const dmChannel = await dmChannelRes.json() as { id: string };
        
        // 2. Post the help/command output embed to the DM channel
        await fetch(`${API}/channels/${dmChannel.id}/messages`, {
          method: "POST",
          headers: {
            Authorization: `Bot ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            embeds: [{
              color: COLORS.teal,
              title: `Command: ${content}`,
              description: cleanOutput.slice(0, 4000) || "❌ *Permission denied or invalid command switch.*",
              footer: { text: `Executed as ${charName}` },
            }],
          }),
        });

        // 3. React or post a small confirmation in the public channel to say "DM sent"
        await fetch(`${API}/channels/${channelId}/messages`, {
          method: "POST",
          headers: {
            Authorization: `Bot ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: "📬 *Sent command output to your DMs.*",
            message_reference: { message_id: msg.id },
          }),
        });
      }
    } catch (e: unknown) {
      console.error("[discord] Failed to DM reply command output:", e);
    }
    return;
  }

  // Check if this channel is bridged to an active scene
  const { handleDiscordSceneMessage } = await import("./scene-bridge.ts");
  const isSceneMsg = await handleDiscordSceneMessage(token, msg);
  if (isSceneMsg) return;

  const gameChan = await gameChannelForDiscord(channelId);
  console.log(`[discord] Resolved Discord channel ${channelId} -> Game channel "${gameChan || "(none)"}"`);
  if (!gameChan) return;
  
  // Append URLs of any attachments (images, videos, files)
  if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
    const urls = msg.attachments
      .map((att: any) => String(att.url ?? "").trim())
      .filter(Boolean);
    if (urls.length > 0) {
      content = content 
        ? `${content} ${urls.join(" ")}`
        : urls.join(" ");
    }
  }

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
