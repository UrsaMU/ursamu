import type { IPlugin } from "@ursamu/mush";
import { registerPluginRoute } from "@ursamu/mush";
import { channelEvents } from "@ursamu/ursamu/channels";
import { getDiscordConfig, getWebhookUrl } from "./config.ts";
import { postWebhook } from "./webhook.ts";
import { clean, resolveAvatar } from "./helpers.ts";
import { subscribeJobHooks, unsubscribeJobHooks } from "./job-hooks.ts";
import { subscribePresenceHooks, unsubscribePresenceHooks } from "./presence.ts";
import { discordRouteHandler } from "./router.ts";
import setupCommands from "./commands.ts";

// ─── channel event handler ────────────────────────────────────────────────────

const onChannelMessage = async ({
  channelName,
  senderId,
  senderName,
  message,
}: {
  channelName: string;
  senderId:    string;
  senderName:  string;
  message:     string;
}): Promise<void> => {
  // Topic name matches the channel name; admin sets URL with @discord/set <channel>=<url>
  const url = await getWebhookUrl(channelName.toLowerCase());
  if (!url) return;
  const cfg    = await getDiscordConfig();
  const avatar = await resolveAvatar(senderId, senderName, cfg.publicUrl);
  postWebhook(url, {
    username:   clean(senderName),
    avatar_url: avatar,
    content:    message.slice(0, 2000),
  });
};

// ─── plugin ───────────────────────────────────────────────────────────────────

const discordPlugin: IPlugin = {
  name:        "discord",
  version:     "0.1.0",
  description: "Webhook-based Discord integration — jobs, channels, presence, and chargen events",

  init: () => {
    setupCommands();
    registerPluginRoute("/api/v1/discord", discordRouteHandler);
    subscribeJobHooks();
    subscribePresenceHooks();
    channelEvents.on("channel:message", onChannelMessage);
    console.log("[discord] Plugin initialized");
    return true;
  },

  remove: () => {
    unsubscribeJobHooks();
    unsubscribePresenceHooks();
    channelEvents.off("channel:message", onChannelMessage);
    console.log("[discord] Plugin removed");
  },
};

export default discordPlugin;
