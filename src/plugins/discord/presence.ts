// Named handlers for player presence and chargen events.
// All handlers are module-level consts so hooks.off() can de-register them
// by reference when the plugin is removed.

import type { SessionEvent } from "../../services/Hooks/GameHooks.ts";
import { gameHooks } from "../../services/Hooks/GameHooks.ts";
import { chargenHooks } from "../chargen/hooks.ts";
import type { IChargenApp } from "../chargen/db.ts";
import { dbojs } from "../../services/Database/index.ts";
import { getWebhookUrl } from "./config.ts";
import { postWebhook, type DiscordEmbed } from "./webhook.ts";
import { clean, COLORS } from "./helpers.ts";

// ─── helpers ──────────────────────────────────────────────────────────────────

async function playerName(id: string): Promise<string> {
  const obj = await dbojs.queryOne({ id });
  return (obj?.data?.name as string | undefined) ?? id;
}

// ─── presence handlers ────────────────────────────────────────────────────────

const onPlayerLogin = async ({ actorName }: SessionEvent): Promise<void> => {
  const url = await getWebhookUrl("presence");
  if (!url) return;
  postWebhook(url, {
    username: "Presence",
    embeds: [{ color: COLORS.green, description: `**${clean(actorName)}** has connected.` }],
  });
};

const onPlayerLogout = async ({ actorName }: SessionEvent): Promise<void> => {
  const url = await getWebhookUrl("presence");
  if (!url) return;
  postWebhook(url, {
    username: "Presence",
    embeds: [{ color: COLORS.gray, description: `**${clean(actorName)}** has disconnected.` }],
  });
};

// ─── chargen handlers ─────────────────────────────────────────────────────────

const onChargenSubmitted = async (app: IChargenApp): Promise<void> => {
  const url = await getWebhookUrl("staff");
  if (!url) return;
  const name = await playerName(app.data.playerId);
  postWebhook(url, {
    username: "Chargen",
    embeds: [{
      color:       COLORS.blue,
      title:       "Application Submitted",
      description: `**${clean(name)}** submitted a character application.`,
    }],
  });
};

const onChargenApproved = async (app: IChargenApp): Promise<void> => {
  const url = await getWebhookUrl("staff");
  if (!url) return;
  const name     = await playerName(app.data.playerId);
  const reviewer = app.data.reviewedBy
    ? await playerName(app.data.reviewedBy)
    : "Staff";
  postWebhook(url, {
    username: "Chargen",
    embeds: [{
      color:       COLORS.green,
      title:       "Application Approved",
      description: `**${clean(name)}** approved by **${clean(reviewer)}**.`,
    }],
  });
};

const onChargenRejected = async (app: IChargenApp): Promise<void> => {
  const url = await getWebhookUrl("staff");
  if (!url) return;
  const name = await playerName(app.data.playerId);
  const embed: DiscordEmbed = {
    color:       COLORS.red,
    title:       "Application Rejected",
    description: `**${clean(name)}**'s application was not approved.`,
  };
  // Include reviewer notes when present — clamped to Discord's footer limit
  if (app.data.notes) embed.footer = { text: app.data.notes.slice(0, 200) };
  postWebhook(url, { username: "Chargen", embeds: [embed] });
};

// ─── subscribe / unsubscribe ──────────────────────────────────────────────────

export function subscribePresenceHooks(): void {
  gameHooks.on("player:login",         onPlayerLogin);
  gameHooks.on("player:logout",        onPlayerLogout);
  chargenHooks.on("chargen:submitted", onChargenSubmitted);
  chargenHooks.on("chargen:approved",  onChargenApproved);
  chargenHooks.on("chargen:rejected",  onChargenRejected);
}

export function unsubscribePresenceHooks(): void {
  gameHooks.off("player:login",         onPlayerLogin);
  gameHooks.off("player:logout",        onPlayerLogout);
  chargenHooks.off("chargen:submitted", onChargenSubmitted);
  chargenHooks.off("chargen:approved",  onChargenApproved);
  chargenHooks.off("chargen:rejected",  onChargenRejected);
}
