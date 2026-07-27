import type { IPlugin } from "@ursamu/mush";
import { registerPluginRoute } from "@ursamu/mush";
import { registerHelpDir } from "@ursamu/help-plugin";
import { channelEvents } from "@ursamu/channels";
import { getBotCredentials } from "./config.ts";
import { onGameChannelMessage } from "./channel-bridge.ts";
import { subscribeJobHooks, unsubscribeJobHooks } from "./job-hooks.ts";
import {
  subscribePresenceHooks,
  unsubscribePresenceHooks,
} from "./presence.ts";
import { discordRouteHandler } from "./router.ts";
import { handleInteraction } from "./interactions/handler.ts";
import { registerSlashCommands } from "./register-commands.ts";
import { startGateway, stopGateway } from "./gateway.ts";
import setupCommands from "./commands.ts";
import { subscribeSceneDiscordHooks, unsubscribeSceneDiscordHooks } from "./scene-bridge.ts";

// ─── channel event handler (game → Discord webhooks) ─────────────────────────

const onChannelMessage = (ev: {
  channelName: string;
  senderId: string;
  senderName: string;
  message: string;
  source?: "game" | "discord";
}): void | Promise<void> => onGameChannelMessage(ev);

// ─── interactions route (unauthenticated; signature = auth) ──────────────────

async function interactionsRoute(
  req: Request,
  _userId: string | null,
): Promise<Response> {
  const url = new URL(req.url);
  if (
    url.pathname === "/api/v1/discord/interactions" ||
    url.pathname.endsWith("/interactions")
  ) {
    return await handleInteraction(req);
  }
  // Fall through to staff REST routes for other /api/v1/discord/*
  return await discordRouteHandler(req, _userId);
}

// ─── plugin ───────────────────────────────────────────────────────────────────

const discordPlugin: IPlugin = {
  name: "discord",
  version: "0.2.3",
  description:
    "Discord bridge — webhooks, two-way channel chat, /help slash command",
  dependencies: [
    { name: "help", version: ">=0.1.0" },
  ],

  init: () => {
    setupCommands();
    registerHelpDir(
      new URL("../help", import.meta.url),
      "discord",
    );
    // Single prefix handler: interactions first, then staff REST
    registerPluginRoute("/api/v1/discord", interactionsRoute);

    subscribeJobHooks();
    subscribePresenceHooks();
    subscribeSceneDiscordHooks();
    channelEvents.on("channel:message", onChannelMessage);

    const creds = getBotCredentials();
    if (creds) {
      void registerSlashCommands(creds);
      void startGateway();
      console.log(
        "[discord] Bot credentials found — " +
          "Interactions + Gateway enabled.",
      );
    } else {
      console.log(
        "[discord] No DISCORD_* env — webhooks only " +
          "(/help and Gateway disabled).",
      );
    }

    console.log("[discord] Plugin initialized");
    return true;
  },

  remove: () => {
    unsubscribeJobHooks();
    unsubscribePresenceHooks();
    unsubscribeSceneDiscordHooks();
    channelEvents.off("channel:message", onChannelMessage);
    stopGateway();
    console.log("[discord] Plugin removed");
  },
};

export default discordPlugin;
