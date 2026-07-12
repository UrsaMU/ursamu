/**
 * @module @ursamu/discord
 *
 * Discord bridge for UrsaMU — webhooks, two-way channel chat, /help.
 */

export { default as discordPlugin, default } from "./src/index.ts";
export type {
  IDiscordConfig,
  IDiscordBotCredentials,
} from "./src/config.ts";
export {
  getDiscordConfig,
  getWebhookUrl,
  setWebhook,
  clearWebhook,
  setChannelLink,
  clearChannelLink,
  gameChannelForDiscord,
  setPublicUrl,
  getBotCredentials,
} from "./src/config.ts";
export { postWebhook } from "./src/webhook.ts";
export type { WebhookPayload, DiscordEmbed } from "./src/webhook.ts";
export { clean, resolveAvatar, COLORS } from "./src/helpers.ts";
export {
  formatDiscordChannelBody,
  injectChannelMessage,
  onGameChannelMessage,
} from "./src/channel-bridge.ts";
export type { IChannelMessageEvent } from "./src/channel-bridge.ts";
export {
  markdownToDiscord,
  truncateDiscord,
  embedForEntry,
  embedForIndex,
  embedForSection,
} from "./src/help-embed.ts";
