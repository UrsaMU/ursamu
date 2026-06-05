/**
 * @module @ursamu/discord
 *
 * Webhook-based Discord integration for UrsaMU — mirrors job events, channel talk,
 * player presence, and chargen activity.
 */

export { default as discordPlugin, default } from "./src/index.ts";
export type { IDiscordConfig } from "./src/config.ts";
export { getDiscordConfig, getWebhookUrl, setWebhook, clearWebhook, setPublicUrl } from "./src/config.ts";
export { postWebhook } from "./src/webhook.ts";
export type { WebhookPayload, DiscordEmbed } from "./src/webhook.ts";
export { clean, resolveAvatar, COLORS } from "./src/helpers.ts";
