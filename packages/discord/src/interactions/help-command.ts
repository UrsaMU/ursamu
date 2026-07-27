/**
 * Discord /help slash command + autocomplete.
 *
 * Payload builders are shared by:
 *   - HTTP interactions endpoint (public HTTPS)
 *   - Gateway INTERACTION_CREATE (no inbound HTTP required)
 */

import { helpRegistry, slugify } from "@ursamu/help";
import {
  embedForEntry,
  embedForIndex,
  embedForSection,
  embedNotFound,
} from "../help-embed.ts";
import type { DiscordEmbed } from "../webhook.ts";

const EPHEMERAL = 1 << 6; // 64

/** Interaction callback body for an ephemeral embed reply. */
export function helpCommandPayload(
  embeds: DiscordEmbed[],
): Record<string, unknown> {
  return {
    type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
    data: {
      flags: EPHEMERAL,
      embeds,
    },
  };
}

export function ephemeralEmbeds(embeds: DiscordEmbed[]): Response {
  return Response.json(helpCommandPayload(embeds));
}

/** Build embeds for /help [topic]. */
export async function buildHelpEmbeds(
  options: Array<{ name: string; value?: string }>,
): Promise<DiscordEmbed[]> {
  const topicOpt = options.find((o) => o.name === "topic");
  const topic = typeof topicOpt?.value === "string"
    ? slugify(topicOpt.value)
    : "";

  if (topic) {
    const entry = await helpRegistry.lookup(topic);
    if (!entry) {
      // Section name fallback (same as +help gateway path)
      const sectionEntries = await helpRegistry.inSection(topic);
      if (sectionEntries.length > 0) {
        return [embedForSection(topic, sectionEntries)];
      }
      return [embedNotFound(topic)];
    }
    return [embedForEntry(entry)];
  }

  const sections = await helpRegistry.sections();
  const all = await helpRegistry.all();
  const visible = all.filter((e) => !e.hidden);
  return [embedForIndex(sections, visible.length)];
}

export async function handleHelpCommand(
  options: Array<{ name: string; value?: string }>,
): Promise<Response> {
  try {
    const embeds = await buildHelpEmbeds(options);
    return ephemeralEmbeds(embeds);
  } catch (e: unknown) {
    console.error("[discord] /help failed:", e);
    return ephemeralEmbeds([{
      color: 0xe74c3c,
      title: "Help error",
      description:
        "Something went wrong loading help. Try again in a moment.",
    }]);
  }
}

/** Topic-name cache for autocomplete (must stay under 3s). */
let _nameCache: { at: number; names: string[] } | null = null;
const NAME_CACHE_MS = 60_000;

async function cachedTopicNames(): Promise<string[]> {
  const now = Date.now();
  if (_nameCache && now - _nameCache.at < NAME_CACHE_MS) {
    return _nameCache.names;
  }
  const all = await helpRegistry.all();
  const names = all
    .filter((e) => !e.hidden)
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
  _nameCache = { at: now, names };
  return names;
}

/** Autocomplete choices payload (type 8). */
export async function buildHelpAutocomplete(
  focused: { name: string; value: string } | undefined,
): Promise<Record<string, unknown>> {
  const prefix = (focused?.value ?? "").toLowerCase().trim();
  let names = await cachedTopicNames();

  if (prefix) {
    names = names.filter((n) => n.includes(prefix));
  }

  const choices = names.slice(0, 25).map((n) => ({
    name: n.slice(0, 100),
    value: n.slice(0, 100),
  }));

  return {
    type: 8, // APPLICATION_COMMAND_AUTOCOMPLETE_RESULT
    data: { choices },
  };
}

export async function handleHelpAutocomplete(
  focused: { name: string; value: string } | undefined,
): Promise<Response> {
  try {
    return Response.json(await buildHelpAutocomplete(focused));
  } catch (e: unknown) {
    console.error("[discord] /help autocomplete failed:", e);
    return Response.json({ type: 8, data: { choices: [] } });
  }
}

/** Slash command JSON body for Discord API registration. */
export const HELP_COMMAND_JSON = {
  name: "help",
  description: "Browse in-game help (private reply)",
  options: [
    {
      name: "topic",
      description: "Help topic slug (e.g. bbpost, bbs/reading)",
      type: 3, // STRING
      required: false,
      autocomplete: true,
    },
  ],
};
