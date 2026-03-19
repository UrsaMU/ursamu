import { DBO } from "../../services/Database/database.ts";

export interface IDiscordConfig {
  id:        string;              // always "discord"
  webhooks:  Record<string, string>;  // topic → webhook URL
  publicUrl: string;              // base URL for avatar links, e.g. "https://mygame.com"
}

const db = new DBO<IDiscordConfig>("discord.config");

async function load(): Promise<IDiscordConfig> {
  const cfg = await db.queryOne({ id: "discord" });
  return cfg || { id: "discord", webhooks: {}, publicUrl: "" };
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

export async function getWebhookUrl(topic: string): Promise<string | undefined> {
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

export async function setPublicUrl(url: string): Promise<void> {
  const cfg = await load();
  cfg.publicUrl = url;
  await save(cfg);
}
