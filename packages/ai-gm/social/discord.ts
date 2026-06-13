// ─── Discord Bridge ───────────────────────────────────────────────────────────
//
// Posts GM narrations, session events, and spotlight moments to a Discord
// webhook channel. Opt-in: does nothing when DISCORD_WEBHOOK_URL is not set.
//
// All messages are plain text — no embeds — to keep formatting simple and
// compatible with the ASCII-only output rule for in-game strings.

const WEBHOOK_URL = Deno.env.get("DISCORD_WEBHOOK_URL") ?? "";

export interface IDiscordMessage {
  content: string;
  username?: string;
  avatarUrl?: string;
}

// ─── Core send ────────────────────────────────────────────────────────────────

export async function sendToDiscord(msg: IDiscordMessage): Promise<void> {
  if (!WEBHOOK_URL) return; // silently skip if not configured

  const payload = {
    content: msg.content.slice(0, 2000), // Discord max
    username: msg.username ?? "AI-GM",
    avatar_url: msg.avatarUrl,
  };

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.warn(`[GM Discord] Webhook POST failed: ${res.status}`);
    }
  } catch (err) {
    console.warn("[GM Discord] Webhook error:", err);
  }
}

// ─── Convenience helpers ──────────────────────────────────────────────────────

/** Post a GM narration to Discord. */
export function postNarration(text: string): Promise<void> {
  return sendToDiscord({ content: `[GM] ${text}`, username: "AI-GM" });
}

/** Post a session lifecycle event (open/close). */
export function postSessionEvent(
  label: string,
  event: "opened" | "closed",
): Promise<void> {
  return sendToDiscord({
    content: `[AI-GM] Session "${label}" ${event}.`,
    username: "AI-GM",
  });
}

/** Post a spotlight moment. */
export function postSpotlight(
  playerName: string,
  description: string,
): Promise<void> {
  return sendToDiscord({
    content: `[SPOTLIGHT] ${playerName} — ${description}`,
    username: "AI-GM",
  });
}

/** Post a campaign journal entry. */
export function postJournalEntry(title: string, body: string): Promise<void> {
  const content = `[JOURNAL] ${title}\n${body}`;
  return sendToDiscord({ content, username: "AI-GM" });
}

export const discordEnabled = (): boolean => WEBHOOK_URL !== "";
