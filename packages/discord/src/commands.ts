import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import {
  getDiscordConfig,
  getBotCredentials,
  setWebhook,
  clearWebhook,
  setPublicUrl,
  setChannelLink,
  clearChannelLink,
} from "./config.ts";
import { postWebhook } from "./webhook.ts";
import { registerSlashCommands } from "./register-commands.ts";

export default () => {
  // ── @discord/set <topic>=<url|""> ─────────────────────────────────────────
  addCmd({
    name: "@discord/set",
    pattern: /^[@+]?discord\/set\s+(.*?)=(.*)/i,
    lock: "connected admin+",
    category: "Admin",
    help: `@discord/set <topic>=<webhook-url>  — Map webhook URL to a topic.
  Set url to empty to clear the webhook.

  Built-in topics: jobs, presence (login/logout), staff (chargen events).
  Any channel name also works as a topic (e.g. ooc, pub).

Examples:
  @discord/set jobs=https://discord.com/api/webhooks/...
  @discord/set ooc=https://discord.com/api/webhooks/...
  @discord/set jobs=    (clears the jobs webhook)`,
    exec: async (u: IUrsamuSDK) => {
      const topic = u.util.stripSubs(u.cmd.args[0] || "").trim().toLowerCase();
      const url   = u.util.stripSubs(u.cmd.args[1] || "").trim();

      if (!topic) {
        u.send("Usage: @discord/set <topic>=<webhook-url>");
        return;
      }

      if (!url) {
        await clearWebhook(topic);
        u.send(`Discord webhook for "${topic}" cleared.`);
        return;
      }

      try {
        const parsed = new URL(url);
        if (!parsed.hostname.endsWith("discord.com")) {
          u.send("That doesn't look like a Discord webhook URL.");
          return;
        }
      } catch {
        u.send("Invalid URL.");
        return;
      }

      await setWebhook(topic, url);
      u.send(`Discord webhook for "${topic}" set.`);
    },
  });

  // ── @discord/publicurl <url> ──────────────────────────────────────────────
  addCmd({
    name: "@discord/publicurl",
    pattern: /^[@+]?discord\/publicurl\s+(.*)/i,
    lock: "connected admin+",
    category: "Admin",
    help: `@discord/publicurl <url>  — Set public base URL for avatar links.
  Must be https. Used to construct avatar URLs when players have uploaded
  images.

Examples:
  @discord/publicurl https://mygame.com`,
    exec: async (u: IUrsamuSDK) => {
      const url = u.util.stripSubs(u.cmd.args[0] || "").trim();
      if (!url) {
        u.send("Usage: @discord/publicurl <https://your-game-host>");
        return;
      }
      try {
        new URL(url);
      } catch {
        u.send("Invalid URL.");
        return;
      }
      await setPublicUrl(url);
      u.send(`Discord public URL set to ${url}`);
    },
  });

  // ── @discord/list ─────────────────────────────────────────────────────────
  addCmd({
    name: "@discord/list",
    pattern: /^[@+]?discord\/list$/i,
    lock: "connected admin+",
    category: "Admin",
    help: `@discord/list  — Show configured Discord webhooks and public URL.

Examples:
  @discord/list    Show configured webhooks.`,
    exec: async (u: IUrsamuSDK) => {
      const cfg = await getDiscordConfig();
      const topics = Object.keys(cfg.webhooks);
      const links = Object.keys(cfg.links ?? {});
      const bot = getBotCredentials();

      const lines: string[] = [
        `Public URL: ${cfg.publicUrl || "(not set)"}`,
        `Bot env: ${bot ? "configured" : "missing DISCORD_*"}`,
      ];
      if (topics.length === 0) {
        lines.push("No webhooks configured.");
      } else {
        lines.push("Webhooks (game → Discord):");
        for (const t of topics) {
          const raw = cfg.webhooks[t];
          const truncated = raw.length > 52
            ? raw.slice(0, 49) + "..."
            : raw;
          lines.push(`  ${t}: ${truncated}`);
        }
      }
      if (links.length === 0) {
        lines.push("No channel links (Discord → game).");
      } else {
        lines.push("Links (Discord → game):");
        for (const g of links) {
          lines.push(`  ${g}: ${cfg.links[g]}`);
        }
      }
      u.send(lines.join("\r\n"));
    },
  });

  // ── @discord/test <topic> ─────────────────────────────────────────────────
  addCmd({
    name: "@discord/test",
    pattern: /^[@+]?discord\/test\s+(.*)/i,
    lock: "connected admin+",
    category: "Admin",
    help: `@discord/test <topic>  — Send a test message to a webhook topic.

Examples:
  @discord/test jobs
  @discord/test ooc`,
    exec: async (u: IUrsamuSDK) => {
      const topic = u.util.stripSubs(u.cmd.args[0] || "").trim().toLowerCase();
      const cfg = await getDiscordConfig();
      const url = cfg.webhooks[topic];

      if (!url) {
        u.send(`No webhook configured for topic "${topic}".`);
        return;
      }

      postWebhook(url, {
        username: "UrsaMU",
        content:
          `**Test** from topic \`${topic}\` — webhook is working!`,
      });
      u.send(`Test message sent to "${topic}".`);
    },
  });

  // ── @discord/link <gameChannel>=<discordChannelId> ────────────────────────
  addCmd({
    name: "@discord/link",
    pattern: /^[@+]?discord\/link\s+(.*?)=(.*)/i,
    lock: "connected admin+",
    category: "Admin",
    help: `@discord/link <gameChannel>=<discordChannelId>
  Map a game channel to a Discord channel for two-way chat.
  Empty id clears the link. Pair with @discord/set for outbound.

Examples:
  @discord/link ooc=123456789012345678
  @discord/link ooc=`,
    exec: async (u: IUrsamuSDK) => {
      const game = u.util.stripSubs(u.cmd.args[0] || "")
        .trim().toLowerCase();
      const disc = u.util.stripSubs(u.cmd.args[1] || "").trim();
      if (!game) {
        u.send("Usage: @discord/link <gameChannel>=<discordId>");
        return;
      }
      if (!disc) {
        await clearChannelLink(game);
        u.send(`Discord link for "${game}" cleared.`);
        return;
      }
      if (!/^\d{5,25}$/.test(disc)) {
        u.send("Discord channel id must be a numeric snowflake.");
        return;
      }
      await setChannelLink(game, disc);
      u.send(
        `Linked game channel "${game}" ↔ Discord #${disc}.`,
      );
    },
  });

  // ── @discord/register-commands ────────────────────────────────────────────
  addCmd({
    name: "@discord/register-commands",
    pattern: /^[@+]?discord\/register-commands$/i,
    lock: "connected admin+",
    category: "Admin",
    help: `@discord/register-commands
  Re-register Discord slash commands (/help) using env credentials.

Examples:
  @discord/register-commands`,
    exec: async (u: IUrsamuSDK) => {
      const creds = getBotCredentials();
      if (!creds) {
        u.send(
          "Missing DISCORD_APPLICATION_ID / BOT_TOKEN / PUBLIC_KEY.",
        );
        return;
      }
      const result = await registerSlashCommands(creds);
      u.send(
        result.ok
          ? `Slash commands registered (${result.scope}).`
          : `Register failed: ${result.detail}`,
      );
    },
  });

  // ── @discord/register ─────────────────────────────────────────────────────
  addCmd({
    name: "@discord/register",
    pattern: /^[@+]?discord\/register$/i,
    lock: "connected",
    category: "General",
    help: `@discord/register  — Link your in-game character to your Discord account.
  Generates a one-time PIN to verify your Discord ID.

Examples:
  @discord/register    Generates a link PIN.`,
    exec: async (u: IUrsamuSDK) => {
      const pin = Math.floor(100000 + Math.random() * 900000).toString();
      const expires = Date.now() + 15 * 60 * 1000; // 15 minutes

      // Spread player state to preserve other fields
      const ps = u.me.state || {};
      await u.db.modify(u.me.id, "$set", {
        "state": {
          ...ps,
          discordTempPin: pin,
          discordPinExpires: expires,
        },
      });

      u.send(
        `%cgDiscord Registration PIN:%cn %ch${pin}%cn\r\n` +
        `This PIN is valid for 15 minutes.\r\n` +
        `Send a DM to the Discord bot saying: %ch+register ${pin}%cn`,
      );
    },
  });
};
