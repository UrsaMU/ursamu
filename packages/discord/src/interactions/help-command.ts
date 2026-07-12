/**
 * Discord /help slash command + autocomplete.
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

export function ephemeralEmbeds(embeds: DiscordEmbed[]): Response {
  return Response.json({
    type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
    data: {
      flags: EPHEMERAL,
      embeds,
    },
  });
}

export async function handleHelpCommand(
  options: Array<{ name: string; value?: string }>,
): Promise<Response> {
  const topicOpt = options.find((o) => o.name === "topic");
  const sectionOpt = options.find((o) => o.name === "section");

  const topic = typeof topicOpt?.value === "string"
    ? slugify(topicOpt.value)
    : "";
  const section = typeof sectionOpt?.value === "string"
    ? sectionOpt.value.trim().toLowerCase()
    : "";

  if (topic) {
    const entry = await helpRegistry.lookup(topic);
    if (!entry) return ephemeralEmbeds([embedNotFound(topic)]);
    return ephemeralEmbeds([embedForEntry(entry)]);
  }

  if (section) {
    const entries = await helpRegistry.inSection(section);
    if (!entries.length) {
      return ephemeralEmbeds([embedNotFound(`section:${section}`)]);
    }
    return ephemeralEmbeds([embedForSection(section, entries)]);
  }

  const sections = await helpRegistry.sections();
  const all = await helpRegistry.all();
  const visible = all.filter((e) => !e.hidden);
  return ephemeralEmbeds([embedForIndex(sections, visible.length)]);
}

export async function handleHelpAutocomplete(
  focused: { name: string; value: string } | undefined,
): Promise<Response> {
  const prefix = (focused?.value ?? "").toLowerCase().trim();
  const all = await helpRegistry.all();
  let names = all
    .filter((e) => !e.hidden)
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));

  if (prefix) {
    names = names.filter((n) => n.includes(prefix));
  }

  const choices = names.slice(0, 25).map((n) => ({
    name: n.slice(0, 100),
    value: n.slice(0, 100),
  }));

  return Response.json({
    type: 8, // APPLICATION_COMMAND_AUTOCOMPLETE_RESULT
    data: { choices },
  });
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
    {
      name: "section",
      description: "List topics in a help section",
      type: 3,
      required: false,
    },
  ],
};
