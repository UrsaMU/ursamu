import { dbojs, hydrate, gameHooks } from "@ursamu/mush";
import { getBotCredentials } from "./config.ts";
import { clean, stripMushMarkup } from "./helpers.ts";

const API = "https://discord.com/api/v10";

// Helper to query the scenes collection safely
async function getActiveSceneForDiscord(channelId: string) {
  const { DBO } = await import("@ursamu/mush");
  const scenes = new DBO<any>("server.scenes");
  const active = await scenes.query({ status: "active", discordChannelId: channelId });
  return active[0] || null;
}

export function subscribeSceneDiscordHooks() {
  gameHooks.on("scene:pose", onGameScenePose);
}

export function unsubscribeSceneDiscordHooks() {
  gameHooks.off("scene:pose", onGameScenePose);
}

/**
 * Outbound: Game/Web scene pose -> Discord.
 * Routes to the public thread/channel, AND DMs all active private bridge players.
 */
async function onGameScenePose(e: {
  sceneId: string;
  sceneName: string;
  roomId: string;
  actorId: string;
  actorName: string;
  msg: string;
  type: string;
  source?: string;
}) {
  if (e.source === "discord") return;

  const { DBO } = await import("@ursamu/mush");
  const scenes = new DBO<any>("server.scenes");
  const scene = await scenes.queryOne({ id: e.sceneId });
  if (!scene) return;

  const creds = getBotCredentials();
  if (!creds?.botToken) return;

  const speaker = clean(e.actorName);
  const msg = stripMushMarkup(e.msg);
  let text = "";

  if (e.type === "ooc") {
    text = `*OOC: ${speaker}: ${msg}*`;
  } else if (e.type === "set") {
    text = `*[Scene Set] ${msg}*`;
  } else {
    text = `**${speaker}** ${msg}`;
  }

  // 1. Post to public bridged channel/thread if linked
  if (scene.discordChannelId) {
    try {
      await fetch(`${API}/channels/${scene.discordChannelId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bot ${creds.botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: text.slice(0, 2000),
        }),
      });
    } catch (err) {
      console.error(`[discord:scene] Failed to send pose to Discord channel ${scene.discordChannelId}:`, err);
    }
  }

  // 2. DM all bridged players in the scene
  try {
    const bridged = await dbojs.query({ "state.activeSceneBridgeId": scene.id });
    for (const player of bridged) {
      const dId = (player.data?.state as any)?.discordId || (player.state as any)?.discordId;
      // Skip sending DM to the author themselves if they were the one who posed
      const charId = player.id;
      if (dId && charId !== e.actorId) {
        // Open DM
        const dmRes = await fetch(`${API}/users/@me/channels`, {
          method: "POST",
          headers: {
            Authorization: `Bot ${creds.botToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ recipient_id: String(dId) }),
        });

        if (dmRes.ok) {
          const dmChannel = await dmRes.json();
          await fetch(`${API}/channels/${dmChannel.id}/messages`, {
            method: "POST",
            headers: {
              Authorization: `Bot ${creds.botToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ content: text.slice(0, 2000) }),
          });
        }
      }
    }
  } catch (err) {
    console.error("[discord:scene] Failed to DM pose to bridged users:", err);
  }
}

/**
 * Inbound: Discord message -> Game scene.
 * Returns true if the message was handled as a scene message.
 */
// deno-lint-ignore no-explicit-any
export async function handleDiscordSceneMessage(token: string, msg: any): Promise<boolean> {
  const channelId = String(msg.channel_id ?? "");
  let scene = await getActiveSceneForDiscord(channelId);

  // Check if it is a Direct Message (no guild_id)
  const isDM = !msg.guild_id;
  let player: any = null;

  if (!scene && isDM) {
    // Check if the DM sender has an active private scene bridge
    player = await dbojs.queryOne({ "state.discordId": msg.author.id });
    const bridgeId = player?.data?.state?.activeSceneBridgeId || player?.state?.activeSceneBridgeId;
    if (bridgeId) {
      const { DBO } = await import("@ursamu/mush");
      const scenes = new DBO<any>("server.scenes");
      scene = await scenes.queryOne({ id: String(bridgeId) });
    }
  }

  if (!scene) return false;

  let content = String(msg.content ?? "").trim();
  if (!content) return true; // Consume empty messages (e.g. only embeds)

  // Resolve player if not resolved already
  if (!player) {
    player = await dbojs.queryOne({ "state.discordId": msg.author.id });
  }

  // Reject unlinked users
  if (!player) {
    try {
      await fetch(`${API}/channels/${channelId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bot ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: `❌ **Access Denied:** Your Discord account is not linked to any character. Use \`+register\` first.`,
          message_reference: { message_id: msg.id },
        }),
      });
    } catch (err) {
      console.error("[discord:scene] Failed to send link warning:", err);
    }
    return true; // Consume message
  }

  // Handle "leave" in DMs
  if (isDM && content.toLowerCase() === "leave") {
    if (player) {
      const ps = { ...(player.state || {}) };
      delete ps.activeSceneBridgeId;
      await dbojs.modify({ id: player.id }, "$set", { "state": ps });

      // DM response
      try {
        await fetch(`${API}/channels/${channelId}/messages`, {
          method: "POST",
          headers: {
            Authorization: `Bot ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: `🔒 **Disconnected from Scene bridge.** You left Scene #${scene.id}.`,
          }),
        });
      } catch (err) {
        console.error(err);
      }
    }
    return true;
  }

  // Append attachments URLs if any
  if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
    const urls = msg.attachments
      .map((att: any) => String(att.url ?? "").trim())
      .filter(Boolean);
    if (urls.length > 0) {
      content = content ? `${content} ${urls.join(" ")}` : urls.join(" ");
    }
  }

  const displayName = String(msg.member?.nick || msg.author?.global_name || msg.author?.username || "Discord User");
  const charId = player?.id || `discord:${msg.author.id}`;
  const charName = player ? (player.data?.name || player.name || displayName) : displayName;

  let poseMsg = content;
  let poseType: "pose" | "ooc" | "set" = "pose";

  if (content.startsWith("[OOC]") || content.startsWith("ooc ")) {
    poseType = "ooc";
    poseMsg = content.replace(/^\[OOC\]\s*/i, "").replace(/^ooc\s+/i, "");
  } else if (content.startsWith("[Set]") || content.startsWith("set ")) {
    poseType = "set";
    poseMsg = content.replace(/^\[Set\]\s*/i, "").replace(/^set\s+/i, "");
  } else if (content.startsWith(":") || content.startsWith(";")) {
    poseType = "pose";
    const prefix = content[0];
    poseMsg = content.slice(1).trim();
    if (prefix === ";") {
      poseMsg = `${charName}${poseMsg}`;
    } else {
      poseMsg = `${charName} ${poseMsg}`;
    }
  } else {
    poseMsg = `says, "${content}"`;
  }

  // Save to scene log
  const newPose = {
    id: crypto.randomUUID(),
    charId,
    charName,
    msg: poseMsg,
    type: poseType,
    timestamp: Date.now(),
    source: "discord",
  };

  const { DBO } = await import("@ursamu/mush");
  const scenes = new DBO<any>("server.scenes");
  const poses = [...(scene.poses || [])];
  poses.push(newPose);

  const participants = [...(scene.participants || [])];
  if (!participants.includes(charId)) {
    participants.push(charId);
  }

  await scenes.modify({ id: scene.id }, "$set", { poses, participants });

  // Broadcast to instanced room in-game
  const instancedRoomId = scene.instancedRoomId;
  if (instancedRoomId) {
    let broadcastMsg = "";
    if (poseType === "ooc") {
      broadcastMsg = `%ch[OOC] ${charName}:%cn ${poseMsg}`;
    } else if (poseType === "set") {
      broadcastMsg = `%ch%cy[Scene Set]%cn ${poseMsg}`;
    } else if (content.startsWith(":") || content.startsWith(";")) {
      broadcastMsg = `%ch${poseMsg}%cn`;
    } else {
      broadcastMsg = `%ch${charName}%cn says, "${content}"`;
    }

    const { send: coreSend } = await import("@ursamu/mush");
    const inside = await dbojs.query({ location: instancedRoomId });
    const targetIds = inside.map((p) => p.id);
    if (targetIds.length > 0) {
      coreSend(targetIds, broadcastMsg);
    }
  }

  // Emit scene:pose event for web client or other plugins
  gameHooks.emit("scene:pose", {
    sceneId: scene.id,
    sceneName: scene.name,
    roomId: instancedRoomId || "",
    actorId: charId,
    actorName: charName,
    msg: poseMsg,
    type: poseType,
    source: "discord",
  }).catch((err) => console.error("[discord:scene] Hook emit failed:", err));

  return true;
}
