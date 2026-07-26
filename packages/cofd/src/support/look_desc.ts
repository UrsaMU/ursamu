// DESCFORMAT: wrap + fae dual desc.

import type { IUrsamuSDK, IDBObj } from "@ursamu/ursamu";
import { resolveLookDesc } from "./perception.ts";

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

/** DESCFORMAT: fae sight prefers FAEDESC; wrap + %r. */
export const cofdDescformatHandler = (
  u: IUrsamuSDK,
  target: IDBObj,
  desc: string,
): Promise<string | null> => {
  const body = resolveLookDesc(u.me, target, desc ?? "");
  if (!body) return Promise.resolve(null);
  const wrapped = wordWrap(body, 77);
  const indented = wrapped
    .split("\n")
    .map((line) => (line.trim() ? " " + line : ""))
    .join("\n");
  // Real newlines only — trailing %r re-breaks after wrap.
  return Promise.resolve(indented);
};
