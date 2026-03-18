import { dbojs } from "../../services/Database/index.ts";
import {
  getDiscordConfig,
  setWebhook,
  clearWebhook,
  setPublicUrl,
} from "./config.ts";
import { postWebhook } from "./webhook.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

async function isStaff(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const player = await dbojs.queryOne({ id: userId });
  if (!player) return false;
  const flags = player.flags || "";
  return (
    flags.includes("admin") ||
    flags.includes("wizard") ||
    flags.includes("superuser")
  );
}

export async function discordRouteHandler(
  req: Request,
  userId: string | null,
): Promise<Response> {
  const url    = new URL(req.url);
  const path   = url.pathname;
  const method = req.method;

  if (!userId) return json({ error: "Unauthorized" }, 401);
  if (!await isStaff(userId)) return json({ error: "Forbidden" }, 403);

  // ── GET /api/v1/discord/webhooks ─────────────────────────────────────────
  if (path === "/api/v1/discord/webhooks" && method === "GET") {
    const cfg     = await getDiscordConfig();
    const redacted = Object.fromEntries(
      Object.entries(cfg.webhooks).map(([k, v]) => [k, v.slice(0, 40) + "…"]),
    );
    return json({ webhooks: redacted, publicUrl: cfg.publicUrl });
  }

  // ── POST /api/v1/discord/webhooks ─────────────────────────────────────────
  if (path === "/api/v1/discord/webhooks" && method === "POST") {
    let body: Record<string, unknown>;
    try { body = await req.json(); }
    catch { return json({ error: "Invalid JSON" }, 400); }

    const topic = typeof body.topic === "string" ? body.topic.trim().toLowerCase() : "";
    const webhookUrl = typeof body.url === "string" ? body.url.trim() : "";
    const publicUrl  = typeof body.publicUrl === "string" ? body.publicUrl.trim() : "";

    if (publicUrl) {
      try { new URL(publicUrl); await setPublicUrl(publicUrl); }
      catch { return json({ error: "Invalid publicUrl" }, 400); }
    }

    if (topic) {
      if (!webhookUrl) {
        await clearWebhook(topic);
        return json({ cleared: topic });
      }
      try {
        const parsed = new URL(webhookUrl);
        if (!parsed.hostname.endsWith("discord.com")) {
          return json({ error: "URL must be a discord.com webhook" }, 400);
        }
      } catch { return json({ error: "Invalid URL" }, 400); }
      await setWebhook(topic, webhookUrl);
      return json({ set: topic });
    }

    return json({ error: "topic is required" }, 400);
  }

  // ── DELETE /api/v1/discord/webhooks/:topic ────────────────────────────────
  const delMatch = path.match(/^\/api\/v1\/discord\/webhooks\/([^/]+)$/);
  if (delMatch && method === "DELETE") {
    const topic = delMatch[1].toLowerCase();
    const cfg   = await getDiscordConfig();
    if (!cfg.webhooks[topic]) return json({ error: "Topic not found" }, 404);
    await clearWebhook(topic);
    return json({ deleted: topic });
  }

  // ── POST /api/v1/discord/webhooks/:topic/test ─────────────────────────────
  const testMatch = path.match(/^\/api\/v1\/discord\/webhooks\/([^/]+)\/test$/);
  if (testMatch && method === "POST") {
    const topic = testMatch[1].toLowerCase();
    const cfg   = await getDiscordConfig();
    const webhookUrl = cfg.webhooks[topic];
    if (!webhookUrl) return json({ error: "Topic not found" }, 404);
    postWebhook(webhookUrl, {
      username: "UrsaMU",
      content:  `**Test** from topic \`${topic}\` — webhook is working!`,
    });
    return json({ sent: true });
  }

  return json({ error: "Not Found" }, 404);
}
