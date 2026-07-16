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
} from "@ursamu/mush";

const WIDTH = 78;
/** TinyMUX plushelp rule — plain dashes, no color. */
const TMUX_RULE = "-".repeat(WIDTH);

// ── MUSH color helpers ──────────────────────────────────────────────────────

function stripColors(text: string): string {
  return text.replace(
    /%(ch|cn|c[rgbcmyw]|b[rgbcmyw]|[rnthiub])/gi,
    "",
  );
}

function wordWrap(text: string, width: number): string {
  return text
    .split("\n")
    .map((line) => {
      if (stripColors(line).length <= width) return line;
      const words = line.split(" ");
      let current = "";
      const result: string[] = [];
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (stripColors(candidate).length <= width) {
          current = candidate;
        } else {
          if (current) result.push(current);
          current = word;
        }
      }
      if (current) result.push(current);
      return result.join("\n");
    })
    .join("\n");
}

/** Convert markdown to MUSH ANSI color codes. */
function markdownToAnsi(md: string): string {
  let out = md;
  out = out.replace(/^# (.+)$/gm, "%ch%cc$1%cn");
  out = out.replace(/^## (.+)$/gm, "%ch%cy$1%cn");
  out = out.replace(/^### (.+)$/gm, "%ch%cw$1%cn");
  out = out.replace(/\*\*([^*]+)\*\*/g, "%ch$1%cn");
  out = out.replace(/\*([^*]+)\*/g, "%ci$1%cn");
  out = out.replace(/`([^`]+)`/g, "%ch%cg$1%cn");
  out = out.replace(/^\s*-\s+(.+)$/gm, "  • $1");
  out = wordWrap(out, WIDTH);
  return out;
}

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
