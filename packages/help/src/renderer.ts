/**
 * renderer.ts — converts HelpEntry content to output formats.
 *
 * Formats:
 *   "ansi"     MUSH color codes for in-game terminal display
 *   "json"     Plain object (for REST responses)
 *   "markdown" Raw markdown string (REST ?format=md)
 *
 * Chrome priority:
 *   1. game.layout.header / .divider / .footer mushcode (engine)
 *   2. TinyMUX plushelp style — plain 78-col dash rules
 *      (https://github.com/brazilofmux/tinymux/.../plushelp.txt)
 */

import type { HelpEntry } from "./registry.ts";
import {
  header as engHeader,
  footer as engFooter,
  hasLayoutTemplate,
  markdownToAnsi,
} from "@ursamu/mush";

const WIDTH = 78;
/** TinyMUX plushelp rule — plain dashes, no color. */
const TMUX_RULE = "-".repeat(WIDTH);

// ── Layout chrome ───────────────────────────────────────────────────────────

/**
 * Topic / section header.
 * Config template when set; else TinyMUX: rule + title line.
 */
function helpHeader(title: string): string {
  if (hasLayoutTemplate("header")) {
    return engHeader(title, "=", WIDTH);
  }
  if (!title) return TMUX_RULE;
  return `${TMUX_RULE}\n${title}`;
}

/**
 * Closing rule.
 * Config template when set; else TinyMUX plain dash rule.
 */
function helpFooter(title = ""): string {
  if (hasLayoutTemplate("footer")) {
    return engFooter(title, "=", WIDTH);
  }
  return TMUX_RULE;
}

function topicColumns(labels: string[]): string {
  const colWidth = Math.floor(WIDTH / 4);
  let cols = "";
  for (let i = 0; i < labels.length; i += 4) {
    const row = labels.slice(i, i + 4);
    cols += row
      .map((label) => {
        const up = label.toUpperCase();
        return up + " ".repeat(Math.max(1, colWidth - up.length));
      })
      .join("") + "\n";
  }
  return cols;
}

// ── Public render functions ─────────────────────────────────────────────────

/** Render a single topic entry for in-game display. */
export function renderEntry(entry: HelpEntry): string {
  const title = entry.name.toUpperCase();
  const body = entry.content
    ? markdownToAnsi(entry.content) + "\n"
    : `%cy(No detailed help available for this topic.)%cn\n`;

  return (
    `${helpHeader(title)}\n` +
    `${body}` +
    `${helpFooter()}`
  );
}

/**
 * Top-level help index — header, section columns, footer.
 * No mid-page "SECTIONS / topics" divider (keeps the list short).
 */
export function renderIndex(
  sections: string[],
  totalCount: number,
): string {
  const top = helpHeader("HELP SYSTEM");
  const cols = topicColumns(sections);
  const foot = helpFooter();
  const count = totalCount > 0 ? ` (${totalCount} topics)` : "";

  return (
    `${top}\n` +
    `${cols}` +
    `${foot}\n` +
    "Type '%chhelp <topic>%cn' or " +
    "'%chhelp/section <name>%cn' to browse." +
    count
  );
}

/** Render a section listing. */
export function renderSection(
  section: string,
  entries: HelpEntry[],
): string {
  const top = helpHeader(section.toUpperCase());
  const foot = helpFooter();

  if (!entries.length) {
    return (
      `${top}\n` +
      `%cy(No topics in this section.)%cn\n` +
      `${foot}`
    );
  }

  const cols = topicColumns(entries.map((e) => e.name));
  return `${top}\n${cols}${foot}`;
}
