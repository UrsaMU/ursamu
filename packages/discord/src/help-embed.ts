/**
 * Convert in-game help markdown into Discord embeds.
 * Discord supports a markdown subset only — normalize headers/lists.
 */

import type { HelpEntry } from "@ursamu/help";
import { COLORS } from "./helpers.ts";
import type { DiscordEmbed } from "./webhook.ts";

const DESC_MAX = 4096;

/** Strip MUSH codes and normalize markdown for Discord embeds. */
export function markdownToDiscord(md: string): string {
  let out = md;
  out = out.replace(/%(ch|cn|c[rgbcmyw]|b[rgbcmyw]|[rnthiub])/gi, "");
  // deno-lint-ignore no-control-regex
  out = out.replace(/\x1b\[[0-9;]*m/g, "");
  // YAML frontmatter
  out = out.replace(/^---[\s\S]*?---\n?/m, "");
  // ATX headers → bold lines
  out = out.replace(/^#{1,6}\s+(.+)$/gm, "**$1**");
  // Collapse 3+ blank lines
  out = out.replace(/\n{3,}/g, "\n\n");
  return out.trim();
}

export function truncateDiscord(text: string, max = DESC_MAX): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 20) + "\n\n… *(truncated)*";
}

export function embedForEntry(entry: HelpEntry): DiscordEmbed {
  const body = truncateDiscord(markdownToDiscord(entry.content ||
    "_(No detailed help available for this topic.)_"));
  return {
    color: COLORS.blurple,
    title: entry.name,
    description: body,
    footer: {
      text: `${entry.section} · ${entry.source}`,
    },
  };
}

export function embedForIndex(
  sections: string[],
  totalCount: number,
): DiscordEmbed {
  const list = sections.length
    ? sections.map((s) => `• \`${s}\``).join("\n")
    : "_(no sections)_";
  return {
    color: COLORS.teal,
    title: "In-game Help",
    description: truncateDiscord(
      `**${totalCount}** topics in **${sections.length}** sections.\n\n` +
        `${list}\n\n` +
        "Use `/help <topic>` to view a specific topic.\n" +
        "Example: `/help bbpost` or `/help bbs/reading`",
    ),
    footer: { text: "Use +help <topic> to browse topics." },
  };
}

export function embedForSection(
  section: string,
  entries: HelpEntry[],
): DiscordEmbed {
  const names = entries
    .filter((e) => !e.hidden)
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
  const list = names.length
    ? names.map((n) => `• \`${n}\``).join("\n")
    : "_(no topics)_";
  return {
    color: COLORS.blue,
    title: `Section: ${section}`,
    description: truncateDiscord(list),
    footer: { text: `${names.length} topic(s)` },
  };
}

export function embedNotFound(topic: string): DiscordEmbed {
  return {
    color: COLORS.orange,
    title: "Topic not found",
    description:
      `No help entry for \`${topic}\`.\n` +
      "Try `/help` to browse all available topics.",
  };
}
