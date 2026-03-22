import { addCmd } from "../../services/commands/index.ts";
import type { IUrsamuSDK } from "../../@types/UrsamuSDK.ts";
import {
  getDiscordConfig,
  setWebhook,
  clearWebhook,
  setPublicUrl,
} from "./config.ts";
import { postWebhook } from "./webhook.ts";

export default () => {
  // ── @discord/set <topic>=<url|""> ─────────────────────────────────────────
  addCmd({
    name: "@discord/set",
    pattern: /^[@+]?discord\/set\s+(.*?)=(.*)/i,
    lock: "connected admin+",
    help: `@discord/set <topic>=<webhook-url>  — Map a Discord webhook URL to a topic.
  Set url to empty to clear the webhook.

  Built-in topics: jobs, presence (login/logout), staff (chargen events).
  Any channel name also works as a topic (e.g. ooc, pub).

Examples:
  @discord/set jobs=https://discord.com/api/webhooks/...
  @discord/set ooc=https://discord.com/api/webhooks/...
  @discord/set jobs=    (clears the jobs webhook)`,
    exec: async (u: IUrsamuSDK) => {
      const topic = (u.cmd.args[0] || "").trim().toLowerCase();
      const url   = (u.cmd.args[1] || "").trim();

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
    help: `@discord/publicurl <url>  — Set the public base URL used for player avatar links.
  Must be https. Used to construct avatar URLs when players have uploaded images.

Examples:
  @discord/publicurl https://mygame.com`,
    exec: async (u: IUrsamuSDK) => {
      const url = (u.cmd.args[0] || "").trim();
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
    help: `@discord/list  — Show all configured Discord webhook topics and the public URL.`,
    exec: async (u: IUrsamuSDK) => {
      const cfg    = await getDiscordConfig();
      const topics = Object.keys(cfg.webhooks);

      const lines: string[] = [`Public URL: ${cfg.publicUrl || "(not set)"}`];
      if (topics.length === 0) {
        lines.push("No webhooks configured.");
      } else {
        lines.push("Webhooks:");
        for (const t of topics) {
          const raw       = cfg.webhooks[t];
          const truncated = raw.length > 52 ? raw.slice(0, 49) + "..." : raw;
          lines.push(`  ${t}: ${truncated}`);
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
    help: `@discord/test <topic>  — Send a test message to a configured webhook topic.

Examples:
  @discord/test jobs
  @discord/test ooc`,
    exec: async (u: IUrsamuSDK) => {
      const topic = (u.cmd.args[0] || "").trim().toLowerCase();
      const cfg   = await getDiscordConfig();
      const url   = cfg.webhooks[topic];

      if (!url) {
        u.send(`No webhook configured for topic "${topic}".`);
        return;
      }

      postWebhook(url, {
        username: "UrsaMU",
        content:  `**Test** from topic \`${topic}\` — webhook is working!`,
      });
      u.send(`Test message sent to "${topic}".`);
    },
  });
};
