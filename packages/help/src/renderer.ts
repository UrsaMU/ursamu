/**
 * renderer.ts — converts HelpEntry content to output formats.
 *
 * Formats:
 *   "ansi"     MUSH color codes for in-game terminal display
 *   "json"     Plain object (for REST responses)
 *   "markdown" Raw markdown string (REST ?format=md)
 */

import type { HelpEntry } from "./registry.ts";

// ── MUSH color helpers ──────────────────────────────────────────────────────

const R = "%cr=%cn"; // one colored = char

function repeat(str: string, n: number): string {
  return str.repeat(n);
}

function stripColors(text: string): string {
  return text.replace(/%(ch|cn|c[rgbcmyw]|b[rgbcmyw]|[rnthiub])/gi, "");
}

function center(text: string, width: number, pad: string): string {
  const len = stripColors(text).length;
  if (len >= width) return text;
  const left = Math.floor((width - len) / 2);
  const right = width - len - left;
  return pad.repeat(left) + text + pad.repeat(right);
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
  // Headers
  out = out.replace(/^# (.+)$/gm, "%ch%cc$1%cn");
  out = out.replace(/^## (.+)$/gm, "%ch%cy$1%cn");
  out = out.replace(/^### (.+)$/gm, "%ch%cw$1%cn");
  // Bold / italic
  out = out.replace(/\*\*([^*]+)\*\*/g, "%ch$1%cn");
  out = out.replace(/\*([^*]+)\*/g, "%ci$1%cn");
  // Inline code
  out = out.replace(/`([^`]+)`/g, "%ch%cg$1%cn");
  // Lists
  out = out.replace(/^\s*-\s+(.+)$/gm, "  • $1");
  // Word wrap
  out = wordWrap(out, 78);
  return out;
}

// ── Public render functions ─────────────────────────────────────────────────

/** Render a single topic entry for in-game display. */
export function renderEntry(entry: HelpEntry): string {
  const header = center(
    `%cy[%cn %ch${entry.name.toUpperCase()}%cn %cy]%cn`,
    78,
    "%cr-%cn",
  );
  const footer = repeat(R, 78);

  const body = entry.content
    ? markdownToAnsi(entry.content) + "\n"
    : `%cy(No detailed help available for this topic.)%cn\n`;

  return `${header}\n${body}${footer}`;
}

/** Render the top-level help index. */
export function renderIndex(
  sections: string[],
  totalCount: number,
): string {
  const header = center("%cy[%cn %chHELP SYSTEM%cn %cy]%cn", 78, "%cr=%cn");
  const subHeader = center(
    `%cy[%cn %chSECTIONS%cn %cy(%cn${totalCount} topics%cy)%cn %cy]%cn`,
    78,
    "%cr-%cn",
  );

  const colWidth = Math.floor(78 / 4);
  let cols = "";
  for (let i = 0; i < sections.length; i += 4) {
    const row = sections.slice(i, i + 4);
    cols += row
      .map((s) => {
        const label = s.toUpperCase();
        return label + " ".repeat(Math.max(1, colWidth - label.length));
      })
      .join("") + "\n";
  }

  const footer = repeat(R, 78);
  return `${header}\n${subHeader}\n${cols}${footer}\n` +
    "Type '%chhelp <topic>%cn' or '%chhelp/section <name>%cn' to browse.";
}

/** Render a section listing. */
export function renderSection(section: string, entries: HelpEntry[]): string {
  const header = center(
    `%cy[%cn %ch${section.toUpperCase()}%cn %cy]%cn`,
    78,
    "%cr-%cn",
  );
  const footer = repeat(R, 78);

  if (!entries.length) {
    return `${header}\n%cy(No topics in this section.)%cn\n${footer}`;
  }

  const colWidth = Math.floor(78 / 4);
  let cols = "";
  for (let i = 0; i < entries.length; i += 4) {
    const row = entries.slice(i, i + 4);
    cols += row
      .map((e) => {
        const label = e.name.toUpperCase();
        return label + " ".repeat(Math.max(1, colWidth - label.length));
      })
      .join("") + "\n";
  }

  return `${header}\n${cols}${footer}`;
}
