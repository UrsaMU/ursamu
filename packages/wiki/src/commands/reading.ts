import { join, resolve } from "@std/path";
import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import {
  WIKI_DIR, walkWiki, readPageFile, findPageFile, normalisePath, parseFrontmatter,
} from "../fs.ts";
import { canReadPage } from "../permissions.ts";
import { scanBacklinks } from "../backlinks.ts";

// ─── helpers ─────────────────────────────────────────────────────────────────

const SEP60 = "%ch" + "-".repeat(60) + "%cn";
const SEP72 = "%ch" + "-".repeat(72) + "%cn";

function hdr(title: string): string {
  return `%ch%cw=== ${title} ===%cn`;
}

// ─── +wiki ────────────────────────────────────────────────────────────────────

addCmd({
  name: "+wiki",
  pattern: /^\+wiki(?:\/(search|tag|recent|toc|backlinks))?\s*(.*)/i,
  lock: "connected",
  category: "Wiki",
  help: `+wiki[/<switch>] [<path>]  — Browse, read, and search the wiki.

Switches:
  /search <query>    Full-text search across title, body, and tags.
  /tag <tag>         List all pages with a given tag.
  /recent [<n>]      Show the n most recently modified pages (default 10).
  /toc <path>        Show table of contents (headings) for a page.
  /backlinks <path>  List pages that link to this page via [[wikilinks]].

Examples:
  +wiki                    Show root-level wiki index.
  +wiki news               List pages in the news/ directory.
  +wiki news/battle-2026   Read a specific page.
  +wiki/search treaty      Find pages mentioning "treaty".
  +wiki/tag ic             List all IC-tagged pages.
  +wiki/recent 5           Show the 5 most recently edited pages.
  +wiki/toc lore/history   Show section headings for lore/history.
  +wiki/backlinks factions Show pages that link to factions.`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = (u.cmd.args[1] ?? "").trim();

    if (sw === "search") return await cmdSearch(u, arg);
    if (sw === "tag")    return await cmdTagList(u, arg);
    if (sw === "recent") return await cmdRecent(u, arg);
    if (sw === "toc")    return await cmdToc(u, arg);
    if (sw === "backlinks") return await cmdBacklinks(u, arg);

    if (!arg) return await cmdRoot(u);
    return await cmdRead(u, normalisePath(arg));
  },
});

// ─── root index ──────────────────────────────────────────────────────────────

async function cmdRoot(u: IUrsamuSDK): Promise<void> {
  const entries: Array<{ name: string; type: string }> = [];
  try {
    for await (const e of Deno.readDir(resolve(WIKI_DIR))) {
      if (e.name.startsWith(".") || e.name === "README.md") continue;
      entries.push({ name: e.name.replace(/\.md$/, ""), type: e.isDirectory ? "dir" : "page" });
    }
  } catch { u.send("Wiki directory is empty or does not exist."); return; }

  if (!entries.length) { u.send("The wiki is empty."); return; }
  entries.sort((a, b) => a.name.localeCompare(b.name));

  u.send(hdr("WIKI"));
  u.send("%ch" + "-".repeat(40) + "%cn");
  for (const e of entries) {
    u.send((e.type === "dir" ? "%ch%cb[dir]%cn " : "      ") + e.name);
  }
  u.send("%ch" + "-".repeat(40) + "%cn");
  u.send('Use "+wiki <path>" to read a page or list a directory.');
}

// ─── read page or directory ───────────────────────────────────────────────────

async function cmdRead(u: IUrsamuSDK, wikiPath: string): Promise<void> {
  const pageFile = await findPageFile(wikiPath);
  if (pageFile) {
    const raw = await Deno.readTextFile(pageFile);
    const { meta, body } = parseFrontmatter(raw);

    if (!(await canReadPage(u, meta))) {
      u.send("%ch>Wiki:%cn Access denied.");
      return;
    }

    const title  = (meta.title as string) || wikiPath;
    const date   = meta.date   ? ` | ${meta.date}`    : "";
    const author = meta.author ? ` | By ${meta.author}` : "";
    const tags   = Array.isArray(meta.tags) && meta.tags.length
      ? ` | Tags: ${(meta.tags as string[]).join(", ")}` : "";
    const locked = meta.readLock && meta.readLock !== "connected"
      ? ` | Lock: ${meta.readLock}` : "";

    u.send(hdr(title));
    u.send(`[${wikiPath}]${author}${date}${tags}${locked}`);
    u.send(SEP72);
    u.send(body);
    u.send(SEP72);
    return;
  }

  // Try directory listing
  const dirAbs = resolve(join(WIKI_DIR, wikiPath));
  if (!dirAbs.startsWith(resolve(WIKI_DIR))) { u.send("Invalid path."); return; }

  const children: Array<{ path: string; title: string; type: string }> = [];
  try {
    for await (const entry of Deno.readDir(dirAbs)) {
      if (entry.name === "README.md" || entry.name.startsWith(".")) continue;
      if (entry.isFile && entry.name.endsWith(".md")) {
        const slug      = entry.name.replace(/\.md$/, "");
        const childPath = slug === "index" ? wikiPath : `${wikiPath}/${slug}`;
        const page      = await readPageFile(join(dirAbs, entry.name));
        children.push({ path: childPath, title: page ? (page.meta.title as string) || slug : slug, type: "page" });
      } else if (entry.isDirectory) {
        children.push({ path: `${wikiPath}/${entry.name}`, title: entry.name, type: "dir" });
      }
    }
  } catch { u.send(`No wiki page or directory found at '${wikiPath}'.`); return; }

  if (!children.length) { u.send(`'${wikiPath}' is empty.`); return; }
  children.sort((a, b) => a.path.localeCompare(b.path));

  u.send(hdr(wikiPath.toUpperCase()));
  u.send(SEP60);
  for (const c of children) {
    const marker = c.type === "dir" ? "%ch%cb[dir]%cn " : "      ";
    u.send(marker + u.util.ljust(c.path.split("/").pop() || c.path, 28) + " " + c.title);
  }
  u.send(SEP60);
  u.send(`Use "+wiki ${wikiPath}/<page>" to read a page.`);
}

// ─── /search ─────────────────────────────────────────────────────────────────

async function cmdSearch(u: IUrsamuSDK, arg: string): Promise<void> {
  if (!arg) { u.send("Usage: +wiki/search <query>"); return; }
  const q = arg.toLowerCase();
  const hits: Array<{ path: string; title: string }> = [];

  for await (const { urlPath, absPath } of walkWiki(resolve(WIKI_DIR))) {
    try {
      const raw = await Deno.readTextFile(absPath);
      const { meta, body } = parseFrontmatter(raw);
      if (!(await canReadPage(u, meta))) continue;
      const title = (meta.title as string) || urlPath;
      const tags  = Array.isArray(meta.tags) ? (meta.tags as string[]) : [];
      if (title.toLowerCase().includes(q) || body.toLowerCase().includes(q) || tags.some((t) => t.toLowerCase().includes(q))) {
        hits.push({ path: urlPath, title });
      }
    } catch { /* skip */ }
  }

  if (!hits.length) { u.send(`No wiki pages match "${arg}".`); return; }
  u.send(`%ch%cw${hits.length} result(s) for "${arg}":%cn`);
  u.send(SEP60);
  for (const h of hits) u.send(u.util.ljust(h.path, 36) + " " + h.title);
  u.send(SEP60);
}

// ─── /tag ────────────────────────────────────────────────────────────────────

async function cmdTagList(u: IUrsamuSDK, tag: string): Promise<void> {
  if (!tag) { u.send("Usage: +wiki/tag <tag>"); return; }
  const q = tag.toLowerCase();
  const hits: Array<{ path: string; title: string }> = [];

  for await (const { urlPath, absPath } of walkWiki(resolve(WIKI_DIR))) {
    const page = await readPageFile(absPath);
    if (!page || !(await canReadPage(u, page.meta))) continue;
    const tags = Array.isArray(page.meta.tags) ? (page.meta.tags as string[]) : [];
    if (tags.some((t) => t.toLowerCase() === q)) {
      hits.push({ path: urlPath, title: (page.meta.title as string) || urlPath });
    }
  }

  if (!hits.length) { u.send(`No wiki pages tagged "${tag}".`); return; }
  u.send(hdr(`TAG: ${tag.toUpperCase()}`));
  u.send(SEP60);
  for (const h of hits) u.send(u.util.ljust(h.path, 36) + " " + h.title);
  u.send(SEP60);
}

// ─── /recent ─────────────────────────────────────────────────────────────────

async function cmdRecent(u: IUrsamuSDK, arg: string): Promise<void> {
  const n    = Math.min(Math.max(parseInt(arg || "10", 10) || 10, 1), 50);
  const base = resolve(WIKI_DIR);
  const items: Array<{ path: string; title: string; mtime: number }> = [];

  for await (const { urlPath, absPath } of walkWiki(base)) {
    const page = await readPageFile(absPath);
    if (!page || !(await canReadPage(u, page.meta))) continue;
    try {
      const stat = await Deno.stat(absPath);
      items.push({ path: urlPath, title: (page.meta.title as string) || urlPath, mtime: stat.mtime?.getTime() ?? 0 });
    } catch { /* skip */ }
  }

  items.sort((a, b) => b.mtime - a.mtime);
  const top = items.slice(0, n);

  if (!top.length) { u.send("No wiki pages found."); return; }
  u.send(hdr(`RECENT PAGES (${top.length})`));
  u.send(SEP60);
  for (const p of top) {
    const d = new Date(p.mtime);
    const ds = isNaN(d.getTime()) ? "" : ` (${d.toISOString().slice(0, 10)})`;
    u.send(u.util.ljust(p.path, 36) + " " + p.title + ds);
  }
  u.send(SEP60);
}

// ─── /toc ────────────────────────────────────────────────────────────────────

async function cmdToc(u: IUrsamuSDK, arg: string): Promise<void> {
  if (!arg) { u.send("Usage: +wiki/toc <path>"); return; }
  const wikiPath = normalisePath(arg);
  const found    = await findPageFile(wikiPath);
  if (!found) { u.send(`Page '${wikiPath}' not found.`); return; }

  const raw  = await Deno.readTextFile(found);
  const { meta, body } = parseFrontmatter(raw);
  if (!(await canReadPage(u, meta))) { u.send("%ch>Wiki:%cn Access denied."); return; }

  const headings: string[] = [];
  for (const line of body.split("\n")) {
    const m = line.match(/^(#{1,6})\s+(.+)/);
    if (m) headings.push("  ".repeat(m[1].length - 1) + m[2]);
  }

  if (!headings.length) { u.send(`'${wikiPath}' has no headings.`); return; }
  const title = (meta.title as string) || wikiPath;
  u.send(hdr(`TOC: ${title}`));
  u.send(SEP60);
  for (const h of headings) u.send(h);
  u.send(SEP60);
}

// ─── /backlinks ───────────────────────────────────────────────────────────────

async function cmdBacklinks(u: IUrsamuSDK, arg: string): Promise<void> {
  if (!arg) { u.send("Usage: +wiki/backlinks <path>"); return; }
  const wikiPath = normalisePath(arg);
  const links    = await scanBacklinks(wikiPath);

  if (!links.length) { u.send(`No pages link to '${wikiPath}'.`); return; }
  u.send(hdr(`BACKLINKS: ${wikiPath}`));
  u.send(SEP60);
  for (const l of links) u.send(u.util.ljust(l.path, 36) + " " + l.title);
  u.send(SEP60);
}
