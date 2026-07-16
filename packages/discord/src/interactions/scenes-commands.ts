import { dbojs, cmds, evaluateLock, hydrate } from "@ursamu/mush";
import { clean, COLORS } from "../helpers.ts";
import { markdownToDiscord } from "../help-embed.ts";

const EPHEMERAL = 1 << 6;
const API = "https://discord.com/api/v10";

function ephemeralResponse(embeds: any[]): Response {
  return Response.json({
    type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
    data: {
      flags: EPHEMERAL,
      embeds,
    },
  });
}

function errorResponse(text: string): Response {
  return ephemeralResponse([{
    color: COLORS.orange,
    title: "Error",
    description: text,
  }]);
}

async function getLinkedPlayer(discordUserId: string): Promise<any | null> {
  return await dbojs.queryOne({ "state.discordId": discordUserId });
}

export async function handleScenesSlash(
  discordUserId: string,
  options: any[],
  channelId: string,
  token: string
): Promise<Response> {
  const player = await getLinkedPlayer(discordUserId);
  if (!player) {
    return errorResponse("❌ Your Discord account is not linked to any character. Use `@discord/register` inside the game first.");
  }

  const subcommand = options[0];
  if (!subcommand) {
    return errorResponse("❌ Missing subcommand.");
  }

  const charName = player.data?.name || player.name || "Unknown";

  if (subcommand.name === "list") {
    // Execute +scene/list
    const outputLines: string[] = [];
    const hydratedPlayer = hydrate(player);
    const cmd = cmds.find((c) => c.name === "+scene");
    if (!cmd) return errorResponse("❌ Scene command not found.");

    const mockSDK = {
      me: hydratedPlayer,
      cmd: {
        name: "+scene",
        original: "+scene/list",
        args: ["list", ""],
        switches: ["list"],
      },
      send: (text: string) => outputLines.push(text),
      db: dbojs,
      util: {
        stripSubs: (s: string) => s.replace(/%c[a-zA-Z0-9]/gi, "").replace(/%[rnth]/g, ""),
        center: (s: string) => s,
        ljust: (s: string, w: number) => s.padEnd(w),
        rjust: (s: string, w: number) => s.padStart(w),
      },
    };

    try {
      await cmd.exec(mockSDK as any);
    } catch (err) {
      console.error(err);
      return errorResponse("Error running command.");
    }

    return ephemeralResponse([{
      color: COLORS.teal,
      title: "Active Scenes",
      description: markdownToDiscord(outputLines.join("\n")),
      footer: { text: `Executed as ${charName}` },
    }]);
  }

  if (subcommand.name === "join") {
    const sceneIdOpt = subcommand.options?.find((o: any) => o.name === "scene_id");
    const sceneId = sceneIdOpt?.value ? String(sceneIdOpt.value).trim() : "";
    if (!sceneId) return errorResponse("❌ Missing Scene ID.");

    const { DBO } = await import("@ursamu/mush");
    const scenes = new DBO<any>("server.scenes");
    const scene = await scenes.queryOne({ id: sceneId });

    if (!scene || scene.status !== "active") {
      return errorResponse(`❌ Scene #${sceneId} is not active or does not exist.`);
    }

    if (scene.private) {
      // Direct Message (DM) Bridging
      if (!scene.allowed.includes(player.id) && player.flags?.includes("wizard") === false) {
        return errorResponse("❌ You are not allowed to join this private scene.");
      }

      // 1. Open DM with user
      try {
        const dmRes = await fetch(`${API}/users/@me/channels`, {
          method: "POST",
          headers: {
            Authorization: `Bot ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ recipient_id: discordUserId }),
        });

        if (!dmRes.ok) {
          return errorResponse("❌ Failed to open Direct Messages with you. Please check your Discord privacy settings.");
        }

        const dmChannel = await dmRes.json();
        
        // Save scene bridge context on player state
        const ps = { ...(player.state || {}) };
        ps.activeSceneBridgeId = scene.id;
        await dbojs.modify({ id: player.id }, "$set", { "state": ps });

        // Add player to participants
        const participants = [...(scene.participants || [])];
        if (!participants.includes(player.id)) {
          participants.push(player.id);
          await scenes.modify({ id: scene.id }, "$set", { participants });
        }

        // Welcome DM
        await fetch(`${API}/channels/${dmChannel.id}/messages`, {
          method: "POST",
          headers: {
            Authorization: `Bot ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: `🔒 **Joined Private Scene #${scene.id}: ${scene.name}**\nDescription: *${scene.desc}*\nAny DMs you send to this bot will now be posted to the scene. Type \`leave\` or exit to disconnect the bridge.`,
          }),
        });

        return ephemeralResponse([{
          color: COLORS.green,
          title: "Private Scene Joined",
          description: "📬 Checked in! Check your Direct Messages to play.",
        }]);

      } catch (err) {
        console.error("[discord:scenes] DM join failed:", err);
        return errorResponse("❌ DM Join failed.");
      }
    } else {
      // Public Scene: Start / Join Server Thread
      let threadId = scene.discordChannelId;

      if (!threadId) {
        // Create thread in the current channel
        try {
          const threadRes = await fetch(`${API}/channels/${channelId}/threads`, {
            method: "POST",
            headers: {
              Authorization: `Bot ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name: `scene-${scene.id}-${scene.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`.slice(0, 99),
              type: 11, // GUILD_PUBLIC_THREAD
              auto_archive_duration: 1440,
            }),
          });

          if (!threadRes.ok) {
            const errText = await threadRes.text();
            console.error("[discord:scenes] Thread creation failed:", errText);
            return errorResponse("❌ Failed to create public thread. Bot might lack 'Create Public Threads' permission.");
          }

          const thread = await threadRes.json();
          threadId = thread.id;

          // Save thread ID to scene
          await scenes.modify({ id: scene.id }, "$set", { discordChannelId: threadId });

          // Send prompt/welcome message to the thread
          await fetch(`${API}/channels/${threadId}/messages`, {
            method: "POST",
            headers: {
              Authorization: `Bot ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              content: `🎬 **Scene #${scene.id}: ${scene.name}** has started!\nDescription: *${scene.desc}*\nType in this thread to play!`,
            }),
          });
        } catch (err) {
          console.error("[discord:scenes] Public join error:", err);
          return errorResponse("❌ Failed to start public scene thread.");
        }
      }

      // Add player to participants
      const participants = [...(scene.participants || [])];
      if (!participants.includes(player.id)) {
        participants.push(player.id);
        await scenes.modify({ id: scene.id }, "$set", { participants });
      }

      return Response.json({
        type: 4,
        data: {
          content: `🎬 Joined public scene thread: <#${threadId}>!`,
        },
      });
    }
  }

  return errorResponse("❌ Invalid command.");
}

export const SCENES_COMMAND_JSON = {
  name: "scenes",
  description: "View or join active roleplay scenes",
  options: [
    {
      name: "list",
      description: "List all active scenes",
      type: 1, // SUB_COMMAND
      options: [],
    },
    {
      name: "join",
      description: "Join an active scene",
      type: 1, // SUB_COMMAND
      options: [
        {
          name: "scene_id",
          description: "ID of the scene to join",
          type: 3, // STRING
          required: true,
        },
      ],
    },
  ],
};
