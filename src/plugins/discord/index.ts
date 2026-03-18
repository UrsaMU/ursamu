import type { IPlugin } from "../../@types/IPlugin.ts";
import { registerPluginRoute } from "../../app.ts";
import { jobHooks } from "../jobs/hooks.ts";
import { channelEvents } from "../../services/channel-events.ts";
import { dbojs } from "../../services/Database/index.ts";
import { getDiscordConfig, getWebhookUrl } from "./config.ts";
import { postWebhook, type DiscordEmbed } from "./webhook.ts";
import { discordRouteHandler } from "./router.ts";
import setupCommands from "./commands.ts";

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Strip MUSH/ANSI codes and clamp to Discord's 80-char username limit. */
function clean(str: string): string {
  return str
    .replace(/%c[a-zA-Z0-9]/gi, "")
    .replace(/%[nrtbR]/g, "")
    .replace(/\x1b\[[0-9;]*m/g, "")
    .trim()
    .slice(0, 80) || "Unknown";
}

/** Resolve avatar_url: player's saved image if present, else RoboHash fallback. */
async function resolveAvatar(
  playerId: string,
  playerName: string,
  publicUrl: string,
): Promise<string> {
  if (publicUrl) {
    try {
      for await (const entry of Deno.readDir("data/avatars")) {
        if (entry.name.startsWith(playerId + ".")) {
          return `${publicUrl}/avatars/${playerId}`;
        }
      }
    } catch {/* no avatars dir yet */}
  }
  return `https://robohash.org/${encodeURIComponent(playerName)}?set=set4&size=80x80`;
}

// Job embed colors
const COLORS = {
  green:   5763719,
  blue:    3447003,
  orange:  15105570,
  teal:    1752220,
  gray:    9807270,
  red:     15548997,
  blurple: 5793266,
};

// ─── job hook subscribers ─────────────────────────────────────────────────────

function subscribeJobHooks(): void {
  jobHooks.on("job:created", async (job) => {
    const url = await getWebhookUrl("jobs");
    if (!url) return;
    const cfg    = await getDiscordConfig();
    const avatar = await resolveAvatar(job.submittedBy, job.submitterName, cfg.publicUrl);
    const priorityNote = job.priority !== "normal"
      ? ` • Priority: **${job.priority}**` : "";
    const embed: DiscordEmbed = {
      color:       COLORS.green,
      title:       `New Job #${job.number} — ${job.title}`,
      description: job.description.slice(0, 1024),
      footer:      { text: `Category: ${job.category}${priorityNote}` },
    };
    postWebhook(url, {
      username:   clean(job.submitterName),
      avatar_url: avatar,
      embeds:     [embed],
    });
  });

  jobHooks.on("job:assigned", async (job) => {
    const url = await getWebhookUrl("jobs");
    if (!url) return;
    const assigneeObj  = job.assignedTo ? await dbojs.queryOne({ id: job.assignedTo }) : null;
    const assignedName = assigneeObj
      ? (assigneeObj.data?.name as string ?? job.assignedTo)
      : (job.assignedTo ?? "Unassigned");
    postWebhook(url, {
      username: "Jobs",
      embeds: [{
        color:       COLORS.blue,
        title:       `Job #${job.number} Assigned`,
        description: `**${job.title}** assigned to **${clean(assignedName)}**`,
      }],
    });
  });

  jobHooks.on("job:commented", async (job, comment) => {
    const url = await getWebhookUrl("jobs");
    if (!url || comment.staffOnly) return;
    const cfg    = await getDiscordConfig();
    const avatar = await resolveAvatar(comment.authorId, comment.authorName, cfg.publicUrl);
    postWebhook(url, {
      username:   clean(comment.authorName),
      avatar_url: avatar,
      embeds: [{
        color:       COLORS.blurple,
        title:       `Comment on Job #${job.number} — ${job.title}`,
        description: comment.text.slice(0, 1024),
      }],
    });
  });

  jobHooks.on("job:status-changed", async (job, oldStatus) => {
    const url = await getWebhookUrl("jobs");
    if (!url) return;
    postWebhook(url, {
      username: "Jobs",
      embeds: [{
        color:       COLORS.orange,
        title:       `Job #${job.number} Status Changed`,
        description: `**${job.title}**\n${oldStatus} → **${job.status}**`,
        footer:      { text: `Priority: ${job.priority}` },
      }],
    });
  });

  jobHooks.on("job:resolved", async (job) => {
    const url = await getWebhookUrl("jobs");
    if (!url) return;
    postWebhook(url, {
      username: "Jobs",
      embeds: [{
        color:       COLORS.teal,
        title:       `Job #${job.number} Resolved`,
        description: `**${job.title}**`,
        footer:      { text: `Category: ${job.category}` },
      }],
    });
  });

  jobHooks.on("job:closed", async (job) => {
    const url = await getWebhookUrl("jobs");
    if (!url) return;
    postWebhook(url, {
      username: "Jobs",
      embeds: [{
        color:       COLORS.gray,
        title:       `Job #${job.number} Closed`,
        description: `**${job.title}**`,
      }],
    });
  });

  jobHooks.on("job:deleted", async (job) => {
    const url = await getWebhookUrl("jobs");
    if (!url) return;
    postWebhook(url, {
      username: "Jobs",
      embeds: [{
        color:       COLORS.red,
        title:       `Job #${job.number} Deleted`,
        description: `**${job.title}**`,
      }],
    });
  });
}

// ─── channel event subscriber ─────────────────────────────────────────────────

function subscribeChannelEvents(): void {
  channelEvents.on("channel:message", async ({ channelName, senderId, senderName, message }) => {
    // Topic name = channel name (lowercase). Admin configures @discord/set ooc=<url>
    const url = await getWebhookUrl(channelName.toLowerCase());
    if (!url) return;
    const cfg    = await getDiscordConfig();
    const avatar = await resolveAvatar(senderId, senderName, cfg.publicUrl);
    postWebhook(url, {
      username:   clean(senderName),
      avatar_url: avatar,
      content:    message.slice(0, 2000),
    });
  });
}

// ─── plugin ───────────────────────────────────────────────────────────────────

const discordPlugin: IPlugin = {
  name:        "discord",
  version:     "1.0.0",
  description: "Webhook-based Discord integration — posts job events and channel talk to Discord",

  init: async () => {
    setupCommands();
    registerPluginRoute("/api/v1/discord", discordRouteHandler);
    subscribeJobHooks();
    subscribeChannelEvents();
    console.log("[discord] Plugin initialized — job hooks and channel events active");
    return true;
  },

  remove: async () => {
    console.log("[discord] Plugin removed");
  },
};

export default discordPlugin;
