import type { IBoard, IPost } from "./db.ts";
import { isWebhookUrlSafe } from "./url-safety.ts";

/**
 * Fire a Discord-compatible webhook for a new post.
 * Failures are swallowed — this is fire-and-forget.
 */
export async function fireWebhook(
  webhookUrl: string,
  board: IBoard,
  post: IPost,
): Promise<void> {
  // Defence-in-depth: validate again at fire time, even if the command already validated
  if (!isWebhookUrlSafe(webhookUrl)) return;
  try {
    const payload = {
      embeds: [
        {
          title: post.subject.slice(0, 256),
          description: post.body.slice(0, 2000),
          color: 0x4a90d9,
          author: { name: board.anonymous ? "Anonymous" : post.authorName },
          footer: { text: `Board ${board.num}: ${board.title}` },
          timestamp: new Date(post.createdAt).toISOString(),
          fields: post.tags?.length
            ? [{ name: "Tags", value: post.tags.join(", "), inline: true }]
            : [],
        },
      ],
    };
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Webhook failures never surface to users
  }
}
