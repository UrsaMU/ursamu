/**
 * commands.ts — in-game help commands.
 *
 * Registered commands:
 *   help [<topic>]             connected  — browse or look up a topic
 *   help/section [<name>]      connected  — list topics in a section
 *   +help/set <topic>=<text>   admin+     — create/update a DB help entry
 *   +help/del <topic>          admin+     — delete a DB help entry
 *   +help/reload               admin+     — bust file provider cache
 */

import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { emitHelp } from "./hooks.ts";
import { helpRegistry, slugify } from "./registry.ts";
import { upsertEntry, deleteEntry } from "./providers/database.ts";
import { bustCache } from "./providers/file.ts";
import {
  renderEntry,
  renderIndex,
  renderSection,
} from "./renderer.ts";

// ── help ────────────────────────────────────────────────────────────────────

addCmd({
  name: "help",
  pattern: /^help(?:\/(section))?\s*(.*)/i,
  lock: "connected",
  category: "General",
  help: `help [<topic>]           — Show help for a topic.
help/section [<name>]    — List all topics in a section.

Examples:
  help              Show the top-level section index.
  help mail         Show help for the "mail" topic or section.
  help mail/send    Show help for the sub-topic "mail/send".
  help/section mail List all topics in the "mail" section.`,
  exec: async (u: IUrsamuSDK) => {
    const sw    = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const raw   = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const topic = slugify(raw);

    if (sw === "section") {
      await showSection(u, topic);
      return;
    }

    if (!topic) {
      await showIndex(u);
      return;
    }

    await showTopic(u, topic);
  },
});

async function showIndex(u: IUrsamuSDK): Promise<void> {
  const all = await helpRegistry.all();
  const sections = await helpRegistry.sections();
  const filteredSections = sections.filter((s) => s !== "general");
  const generalTopics = all
    .filter((e) => e.section === "general")
    .map((e) => e.name);
  const combined = [...filteredSections, ...generalTopics].sort((a, b) =>
    a.localeCompare(b)
  );
  u.send(renderIndex(combined, all.length));
}

async function showSection(u: IUrsamuSDK, section: string): Promise<void> {
  if (!section) {
    await showIndex(u);
    return;
  }
  const entries = await helpRegistry.inSection(section);
  u.send(renderSection(section, entries));
}

async function showTopic(u: IUrsamuSDK, topic: string): Promise<void> {
  emitHelp("help:lookup", { topic });

  const entry = await helpRegistry.lookup(topic);

  if (!entry) {
    // Check if topic matches a section name
    const sections = await helpRegistry.sections();
    if (sections.includes(topic)) {
      await showSection(u, topic);
      return;
    }
    emitHelp("help:miss", { topic });
    u.send(`No help available for '%ch${topic}%cn'.`);
    return;
  }

  u.send(renderEntry(entry));
}

// ── +help/set ────────────────────────────────────────────────────────────────

addCmd({
  name: "+help/set",
  pattern: /^\+help\/set\s+(.+)=([\s\S]*)/i,
  lock: "connected admin+",
  category: "Admin",
  help: `+help/set <topic>=<text>  — Create or update a runtime help entry.

  <topic>  Lowercase slug. Use "/" for sub-topics, e.g. "mail/send".
  <text>   Markdown content. Supports headers, bold, lists, inline code.

Examples:
  +help/set house-rules=# House Rules\\nNo griefing.
  +help/set combat/dodge=Dodge reduces incoming damage by 50%.`,
  exec: async (u: IUrsamuSDK) => {
    const rawTopic = u.util.stripSubs(u.cmd.args[0]).trim();
    const content  = u.util.stripSubs(u.cmd.args[1]).trim();

    if (!rawTopic) {
      u.send("Usage: +help/set <topic>=<text>");
      return;
    }

    const topic   = slugify(rawTopic);
    const section = topic.includes("/") ? topic.split("/")[0] : "general";

    const entry = await upsertEntry({
      name:      topic,
      section,
      content,
      tags:      [],
      source:    "database",
      createdBy: u.me.id,
    });

    emitHelp("help:register", {
      entry: { name: entry.name, section: entry.section, content: entry.content, source: "database", tags: entry.tags },
    });

    u.send(`%chHelp entry '%cn${topic}%ch' saved.%cn`);
  },
});

// ── +help/del ────────────────────────────────────────────────────────────────

addCmd({
  name: "+help/del",
  pattern: /^\+help\/del\s+(.*)/i,
  lock: "connected admin+",
  category: "Admin",
  help: `+help/del <topic>  — Delete a runtime help entry (database entries only).

Examples:
  +help/del house-rules     Remove the "house-rules" DB entry.
  +help/del combat/dodge    Remove the "combat/dodge" DB entry.`,
  exec: async (u: IUrsamuSDK) => {
    const rawTopic = u.util.stripSubs(u.cmd.args[0]).trim();

    if (!rawTopic) {
      u.send("Usage: +help/del <topic>");
      return;
    }

    const deleted = await deleteEntry(rawTopic);
    if (!deleted) {
      u.send(`No database entry found for '%ch${slugify(rawTopic)}%cn'.`);
      return;
    }

    u.send(`%chHelp entry '%cn${slugify(rawTopic)}%ch' deleted.%cn`);
  },
});

// ── +help/reload ──────────────────────────────────────────────────────────────

addCmd({
  name: "+help/reload",
  pattern: /^\+help\/reload$/i,
  lock: "connected admin+",
  category: "Admin",
  help: `+help/reload  — Clear the file provider cache and rescan all help directories.

Use this after adding or editing .md files in ./help/ or any registered
plugin help directory without restarting the server.

Examples:
  +help/reload    Rescan all help directories.`,
  exec: (u: IUrsamuSDK) => {
    bustCache();
    u.send("%chHelp file cache cleared. Topics will be rescanned on next lookup.%cn");
  },
});
