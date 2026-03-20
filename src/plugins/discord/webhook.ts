// ─── Discord webhook poster ───────────────────────────────────────────────────
// Queues outgoing messages per URL so burst traffic respects Discord rate limits.

export interface DiscordEmbed {
  color?:       number;
  title?:       string;
  description?: string;
  footer?:      { text: string };
  fields?:      { name: string; value: string; inline?: boolean }[];
}

export interface WebhookPayload {
  content?:    string;
  username?:   string;
  avatar_url?: string;
  embeds?:     DiscordEmbed[];
}

// Per-URL promise chain — ensures one message at a time per webhook URL.
const queues = new Map<string, Promise<void>>();

async function postDirect(url: string, payload: WebhookPayload): Promise<void> {
  const body = JSON.stringify(payload);
  const headers = { "Content-Type": "application/json" };

  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers, body });
  } catch (e) {
    console.error("[discord] Webhook fetch error:", e);
    return;
  }

  if (res.status === 429) {
    // Rate-limited — wait and retry once
    try {
      const data = await res.json().catch(() => ({}));
      const wait = ((data as Record<string, unknown>).retry_after as number ?? 1) * 1000;
      await new Promise((r) => setTimeout(r, wait));
      const retry = await fetch(url, { method: "POST", headers, body });
      if (!retry.ok && retry.status !== 204) {
        console.error(`[discord] Webhook retry failed: ${retry.status}`);
      }
    } catch (e) {
      console.error("[discord] Rate-limit retry error:", e);
    }
    return;
  }

  if (!res.ok && res.status !== 204) {
    console.error(`[discord] Webhook post failed: ${res.status}`);
  }
}

/** Enqueue a webhook POST. Returns immediately — fires-and-forgets in order. */
export function postWebhook(url: string, payload: WebhookPayload): void {
  const prev = queues.get(url) ?? Promise.resolve();
  const next = prev
    .then(() => postDirect(url, payload))
    .catch(() => {/* already logged inside postDirect */})
    .finally(() => { if (queues.get(url) === next) queues.delete(url); });
  queues.set(url, next);
}
