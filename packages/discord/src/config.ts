import { DBO } from "@ursamu/mush";

export interface IDiscordConfig {
  id: string;
  /** topic / game channel name → webhook URL (game → Discord). */
  webhooks: Record<string, string>;
  /** game channel name → Discord channel snowflake (Discord → game). */
  links: Record<string, string>;
  /** Base URL for avatar links, e.g. "https://mygame.com". */
  publicUrl: string;
}

/** Bot credentials from environment (never stored in DBO). */
export interface IDiscordBotCredentials {
  applicationId: string;
  botToken: string;
  publicKey: string;
  guildId: string;
}

const db = new DBO<IDiscordConfig>("discord.config");

function emptyCfg(): IDiscordConfig {
  return { id: "discord", webhooks: {}, links: {}, publicUrl: "" };
}

async function load(): Promise<IDiscordConfig> {
  const cfg = await db.queryOne({ id: "discord" });
  if (!cfg) {
    console.log("[discord] config: no config found in database, returning empty config.");
    return emptyCfg();
  }
  console.log("[discord] config loaded:", JSON.stringify({ webhooks: cfg.webhooks, links: cfg.links }));
  return {
    id: "discord",
    webhooks: cfg.webhooks ?? {},
    links: cfg.links ?? {},
    publicUrl: cfg.publicUrl ?? "",
  };
}

async function save(cfg: IDiscordConfig): Promise<void> {
  const existing = await db.queryOne({ id: "discord" });
  if (existing) {
    await db.update({ id: "discord" }, cfg);
  } else {
    await db.create(cfg);
  }
}

export function getDiscordConfig(): Promise<IDiscordConfig> {
  return load();
}

export async function getWebhookUrl(
  topic: string,
): Promise<string | undefined> {
  const cfg = await load();
  return cfg.webhooks[topic.toLowerCase()];
}

export async function setWebhook(topic: string, url: string): Promise<void> {
  const cfg = await load();
  cfg.webhooks[topic.toLowerCase()] = url;
  await save(cfg);
}

export async function clearWebhook(topic: string): Promise<void> {
  const cfg = await load();
  delete cfg.webhooks[topic.toLowerCase()];
  await save(cfg);
}

export async function setChannelLink(
  gameChannel: string,
  discordChannelId: string,
): Promise<void> {
  const cfg = await load();
  cfg.links[gameChannel.toLowerCase()] = discordChannelId.trim();
  await save(cfg);
}

export async function clearChannelLink(gameChannel: string): Promise<void> {
  const cfg = await load();
  delete cfg.links[gameChannel.toLowerCase()];
  await save(cfg);
}

/** Reverse lookup: Discord channel id → game channel name. */
export async function gameChannelForDiscord(
  discordChannelId: string,
): Promise<string | undefined> {
  const cfg = await load();
  const id = discordChannelId.trim();
  for (const [game, disc] of Object.entries(cfg.links)) {
    if (disc === id) return game;
  }
  return undefined;
}

export async function setPublicUrl(url: string): Promise<void> {
  const cfg = await load();
  cfg.publicUrl = url;
  await save(cfg);
}

/**
 * Read bot credentials from env. Returns null if incomplete.
 * DISCORD_APPLICATION_ID, DISCORD_BOT_TOKEN, DISCORD_PUBLIC_KEY required.
 * DISCORD_GUILD_ID optional (guild slash commands).
 */
export function getBotCredentials(): IDiscordBotCredentials | null {
  const applicationId = Deno.env.get("DISCORD_APPLICATION_ID")?.trim() ?? "";
  const botToken = Deno.env.get("DISCORD_BOT_TOKEN")?.trim() ?? "";
  const publicKey = Deno.env.get("DISCORD_PUBLIC_KEY")?.trim() ?? "";
  const guildId = Deno.env.get("DISCORD_GUILD_ID")?.trim() ?? "";
  if (!applicationId || !botToken || !publicKey) return null;
  return { applicationId, botToken, publicKey, guildId };
}
