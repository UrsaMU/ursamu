/**
 * Discord interaction ack helpers.
 *
 * Slash commands must be acknowledged within 3 seconds. For anything
 * that may load data (help registry, DB), DEFER immediately then
 * PATCH the original message when ready.
 *
 * https://discord.com/developers/docs/interactions/receiving-and-responding
 */

const API = "https://discord.com/api/v10";
const EPHEMERAL = 1 << 6; // 64

/** type 5 — show "thinking…" then edit @original. */
export function deferredEphemeralPayload(): Record<string, unknown> {
  return {
    type: 5, // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
    data: { flags: EPHEMERAL },
  };
}

export function deferredEphemeralResponse(): Response {
  return Response.json(deferredEphemeralPayload());
}

/** PATCH the deferred interaction's original message. */
export async function editOriginalInteraction(
  applicationId: string,
  interactionToken: string,
  data: {
    content?: string;
    embeds?: unknown[];
    flags?: number;
  },
): Promise<void> {
  if (!applicationId || !interactionToken) return;
  const url =
    `${API}/webhooks/${applicationId}/${interactionToken}/messages/@original`;
  const body: Record<string, unknown> = {
    flags: data.flags ?? EPHEMERAL,
  };
  if (data.content !== undefined) body.content = data.content;
  if (data.embeds !== undefined) body.embeds = data.embeds;

  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(
      `[discord] edit @original ${res.status}: ${text.slice(0, 200)}`,
    );
  }
}

/**
 * Run work after a deferred ack; always try to fill @original.
 * Never throws to the caller.
 */
export function followUpEphemeral(
  applicationId: string,
  interactionToken: string,
  work: () => Promise<{ embeds?: unknown[]; content?: string }>,
): void {
  void (async () => {
    try {
      const result = await work();
      await editOriginalInteraction(applicationId, interactionToken, {
        embeds: result.embeds,
        content: result.content,
        flags: EPHEMERAL,
      });
    } catch (e: unknown) {
      console.error("[discord] deferred follow-up failed:", e);
      try {
        await editOriginalInteraction(applicationId, interactionToken, {
          content:
            "Something went wrong. Try again, or use `+help` in-game.",
          flags: EPHEMERAL,
        });
      } catch {
        /* ignore */
      }
    }
  })();
}
