import { join, resolve } from "@std/path";
import { WIKI_DIR } from "./fs.ts";
import { isWebhookUrlSafe } from "./url-safety.ts";
import type { WikiPageRef } from "./hooks.ts";

const WEBHOOKS_FILE = join(WIKI_DIR, ".webhooks.json");

// ─── storage ─────────────────────────────────────────────────────────────────

/** Load the webhook config map { "<dir>": "<url>" } from disk. Returns {} on failure. */
export async function loadWebhooks(): Promise<Record<string, string>> {
  try {
    const raw = await Deno.readTextFile(resolve(WEBHOOKS_FILE));
    const data = JSON.parse(raw);
    if (typeof data === "object" && data !== null && !Array.isArray(data)) {
      return data as Record<string, string>;
    }
  } catch { /* file may not exist */ }
  return {};
}

/** Persist the webhook config map to disk. */
export async function saveWebhooks(map: Record<string, string>): Promise<void> {
  await Deno.writeTextFile(resolve(WEBHOOKS_FILE), JSON.stringify(map, null, 2) + "\n");
}

/**
 * Find the most specific webhook URL configured for a wiki path.
 * Walks up the directory tree: "news/battle" → checks "news/battle", "news", "" (root).
 */
export async function getWebhookForPath(wikiPath: string): Promise<string | null> {
  const map = await loadWebhooks();
  const parts = wikiPath.split("/");
  for (let i = parts.length; i >= 0; i--) {
    const dir = parts.slice(0, i).join("/");
    if (map[dir]) return map[dir];
  }
  return null;
}

// ─── dispatch ────────────────────────────────────────────────────────────────

/** Discord embed colour per event type. */
const EVENT_COLORS: Record<string, number> = {
  "wiki:created": 0x57f287, // green
  "wiki:edited":  0xfee75c, // yellow
  "wiki:deleted": 0xed4245, // red
  "wiki:renamed": 0x5865f2, // blurple
};

/**
 * Fire a Discord-compatible webhook for a wiki event. Fire-and-forget.
 * SSRF-guarded: only https:// URLs with non-private hosts are allowed.
 */
export function fireWebhook(
  url: string,
  event: string,
  page: WikiPageRef
): void {
  if (!isWebhookUrlSafe(url)) return;

  const title  = (page.meta.title as string) || page.path;
  const colour = EVENT_COLORS[event] ?? 0x99aab5;
  const label  = event.replace("wiki:", "");

  const payload = {
    embeds: [{
      title:       `Wiki ${label}: ${title}`,
      description: `**Path:** \`${page.path}\``,
      color:       colour,
      timestamp:   new Date().toISOString(),
    }],
  };

  // Fire-and-forget — log failures so admins can diagnose dead webhooks
  fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
    signal:  AbortSignal.timeout(8_000),
  }).catch((e: unknown) => {
    console.warn(`[wiki] Webhook delivery failed for ${page.path} (${event}):`, e instanceof Error ? e.message : String(e));
  });
}

/**
 * Check the webhook config for the affected path and fire if one is set.
 * Called from wikiHooks event handlers in index.ts.
 */
export async function maybeFireWebhook(
  event: string,
  page: WikiPageRef
): Promise<void> {
  const url = await getWebhookForPath(page.path);
  if (url) fireWebhook(url, event, page);
}
