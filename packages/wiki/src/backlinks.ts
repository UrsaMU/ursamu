import { resolve } from "@std/path";
import { WIKI_DIR, walkWiki, readPageFile } from "./fs.ts";
import type { WikiStub } from "./fs.ts";

// Wikilinks use [[path/to/page]] or [[Page Title]] syntax.
// Backlink scanning walks every .md file and looks for references to a target path.

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

/**
 * Normalise a wikilink target to a comparable path key.
 * Lowercases and replaces spaces with hyphens so [[My Page]] matches "my-page".
 */
export function normWikilinkTarget(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-");
}

/**
 * Scan the entire wiki and return all pages that contain a [[wikilink]] to
 * the given targetPath. O(n) over all pages — acceptable at game scale.
 *
 * @param targetPath  The wiki URL path being searched for (e.g. "news/battle")
 */
export async function scanBacklinks(targetPath: string): Promise<WikiStub[]> {
  const normTarget = normWikilinkTarget(targetPath);
  const results: WikiStub[] = [];

  for await (const { urlPath, absPath } of walkWiki(resolve(WIKI_DIR))) {
    if (urlPath === targetPath) continue; // skip self-links

    const page = await readPageFile(absPath);
    if (!page) continue;

    let found = false;
    for (const match of page.body.matchAll(WIKILINK_RE)) {
      if (normWikilinkTarget(match[1]) === normTarget) { found = true; break; }
    }

    if (found) {
      results.push({
        path:  urlPath,
        title: (page.meta.title as string) || urlPath,
        type:  "page",
        meta:  page.meta,
      });
    }
  }

  return results;
}

/**
 * Extract all wikilink targets from a page body.
 * Returns raw target strings as written (e.g. ["My Page", "news/battle"]).
 */
export function extractWikilinks(body: string): string[] {
  const targets: string[] = [];
  for (const match of body.matchAll(WIKILINK_RE)) targets.push(match[1]);
  return targets;
}

/**
 * Resolve [[wikilinks]] in a body string, replacing them with markdown-style
 * links: [[My Page]] → [My Page](/wiki/my-page)
 */
export function resolveWikilinks(body: string): string {
  return body.replace(WIKILINK_RE, (_full, target: string) => {
    const path = normWikilinkTarget(target);
    return `[${target.trim()}](/wiki/${path})`;
  });
}
