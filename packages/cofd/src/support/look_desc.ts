// DESCFORMAT: wrap + fae dual desc + optional +views banner.

import type { IUrsamuSDK, IDBObj } from "@ursamu/ursamu";
import { resolveLookDesc } from "./perception.ts";
import { visibleViews } from "../commands/views_lib.ts";

const WIDTH = 78;

const visualLen = (s: string): number =>
  s.replace(/<#[0-9a-fA-F]{6}>/g, "")
    .replace(/%c[a-zA-Z]/g, "")
    .replace(/%[nrtbR]/g, "").length;

/** Turn MUSH %r / %t into real whitespace before wrap. */
function normalizeDescNewlines(text: string): string {
  return text
    .replace(/%r/gi, "\n")
    .replace(/%t/gi, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function wordWrap(text: string, width: number): string {
  const out: string[] = [];
  for (
    const paragraph of normalizeDescNewlines(text).split("\n")
  ) {
    if (paragraph.trim() === "") {
      out.push("");
      continue;
    }
    let i = 0;
    while (
      i < paragraph.length &&
      (paragraph[i] === " " || paragraph[i] === "\t")
    ) {
      i++;
    }
    const indent = paragraph.slice(0, i);
    const indentW = visualLen(indent);
    if (visualLen(paragraph) <= width) {
      out.push(paragraph);
      continue;
    }
    const words = paragraph.slice(i).split(" ");
    let line = indent + words[0];
    let lineLen = indentW + visualLen(words[0]);
    for (let w = 1; w < words.length; w++) {
      const wl = visualLen(words[w]);
      if (lineLen + 1 + wl > width) {
        out.push(line);
        line = words[w];
        lineLen = wl;
      } else {
        line += " " + words[w];
        lineLen += 1 + wl;
      }
    }
    if (line.length > 0) out.push(line);
  }
  return out.join("\n");
}

// Centered under desc when any view is visible to the looker.
const VIEWS_BANNER =
  "%cg<%cn %ch%cy+views%cn Available %cg>%cn";

/** DESCFORMAT: fae sight prefers FAEDESC; wrap; trailing blank; views. */
export const cofdDescformatHandler = async (
  u: IUrsamuSDK,
  target: IDBObj,
  desc: string,
): Promise<string | null> => {
  const body = resolveLookDesc(u.me, target, desc ?? "");
  if (!body) return null;
  const wrapped = wordWrap(body, 77);
  let out = wrapped
    .split("\n")
    .map((line) => (line.trim() ? " " + line : ""))
    .join("\n");

  // Blank line after description before contents / views banner.
  out += "\n";

  try {
    const seen = await visibleViews(u, target as never);
    if (seen.length > 0) {
      const line = u.util.center
        ? u.util.center(VIEWS_BANNER, WIDTH)
        : VIEWS_BANNER;
      out += "\n" + line + "\n";
    }
  } catch {
    /* views optional; never break look */
  }

  return out;
};
