import { join, resolve } from "@std/path";
import { ensureDir } from "@std/fs";
import { addCmd } from "../../services/commands/cmdParser.ts";
import type { IUrsamuSDK } from "../../@types/UrsamuSDK.ts";
import {
  WIKI_DIR,
  MAX_UPLOAD_BYTES,
  ALLOWED_MEDIA_TYPES,
  walkWiki,
  parseFrontmatter,
  serializePage,
  mimeForPath,
  safePath,
} from "./router.ts";
import { wikiHooks } from "./hooks.ts";

// ─── helpers ──────────────────────────────────────────────────────────────────

function isAdmin(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
}

async function findPageFile(wikiPath: string): Promise<string | null> {
  const base = resolve(WIKI_DIR);
  for (const rel of [`${wikiPath}.md`, `${wikiPath}/index.md`]) {
    const abs = resolve(join(WIKI_DIR, rel));
    if (!abs.startsWith(base)) continue;
    try { await Deno.stat(abs); return abs; } catch { /* try next */ }
  }
  return null;
}

// ─── +wiki ────────────────────────────────────────────────────────────────────
//
// +wiki                    — list top-level directories and pages
// +wiki <path>             — read a page or list a directory
// +wiki/search <query>     — full-text search

addCmd({
  name: "+wiki",
  pattern: /^\+wiki(?:\/(search))?\s*(.*)/i,
  lock: "connected",
  help: "+wiki [<path>]\n+wiki/search <query>\nBrowse or read wiki pages. Paths mirror the folder structure.",
  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] || "").toLowerCase().trim();
    const arg = (u.cmd.args[1] || "").trim();

    // ── +wiki/search ──────────────────────────────────────────────────────────
    if (sw === "search") {
      if (!arg) { u.send("Usage: +wiki/search <query>"); return; }

      const q    = arg.toLowerCase();
      const hits: Array<{ path: string; title: string }> = [];

      for await (const { urlPath, absPath } of walkWiki(resolve(WIKI_DIR))) {
        try {
          const raw = await Deno.readTextFile(absPath);
          const { meta, body } = parseFrontmatter(raw);
          const title = (meta.title as string) || urlPath;
          const tags  = Array.isArray(meta.tags) ? (meta.tags as string[]) : [];
          if (
            title.toLowerCase().includes(q) ||
            body.toLowerCase().includes(q) ||
            tags.some((t) => t.toLowerCase().includes(q))
          ) {
            hits.push({ path: urlPath, title });
          }
        } catch { /* skip unreadable file */ }
      }

      if (!hits.length) { u.send(`No wiki pages match "${arg}".`); return; }

      u.send(`%ch%cw${hits.length} result(s) for "${arg}":%cn`);
      u.send("%ch" + "-".repeat(60) + "%cn");
      for (const h of hits) {
        u.send(u.util.ljust(h.path, 36) + " " + h.title);
      }
      u.send("%ch" + "-".repeat(60) + "%cn");
      u.send('Use "+wiki <path>" to read a page.');
      return;
    }

    // ── +wiki — list root ─────────────────────────────────────────────────────
    if (!arg) {
      const entries: Array<{ name: string; type: string }> = [];
      try {
        for await (const e of Deno.readDir(resolve(WIKI_DIR))) {
          if (e.name.startsWith(".") || e.name === "README.md") continue;
          entries.push({ name: e.name.replace(/\.md$/, ""), type: e.isDirectory ? "dir" : "page" });
        }
      } catch {
        u.send("Wiki directory is empty or does not exist.");
        return;
      }
      if (!entries.length) { u.send("The wiki is empty."); return; }

      entries.sort((a, b) => a.name.localeCompare(b.name));
      u.send("%ch%cw=== WIKI ===%cn");
      u.send("%ch" + "-".repeat(40) + "%cn");
      for (const e of entries) {
        const marker = e.type === "dir" ? "%ch%cb[dir]%cn " : "      ";
        u.send(marker + e.name);
      }
      u.send("%ch" + "-".repeat(40) + "%cn");
      u.send('Use "+wiki <path>" to read a page or list a directory.');
      return;
    }

    // ── +wiki <path> — read page or list directory ────────────────────────────
    const wikiPath = arg.replace(/^\/+/, "").replace(/\/+/g, "/").replace(/\/$/, "");

    // Try to read as a page first
    const pageFile = await findPageFile(wikiPath);
    if (pageFile) {
      const raw = await Deno.readTextFile(pageFile);
      const { meta, body } = parseFrontmatter(raw);
      const title  = (meta.title as string) || wikiPath;
      const date   = meta.date   ? ` | ${meta.date}`   : "";
      const author = meta.author ? ` | By ${meta.author}` : "";
      const tags   = Array.isArray(meta.tags) && meta.tags.length
        ? ` | Tags: ${(meta.tags as string[]).join(", ")}`
        : "";

      u.send(`%ch%cw=== ${title} ===%cn`);
      u.send(`[${wikiPath}]${author}${date}${tags}`);
      u.send("%ch" + "-".repeat(72) + "%cn");
      u.send(body);
      u.send("%ch" + "-".repeat(72) + "%cn");
      return;
    }

    // Try as a directory listing
    const dirAbs = resolve(join(WIKI_DIR, wikiPath));
    if (!dirAbs.startsWith(resolve(WIKI_DIR))) { u.send("Invalid path."); return; }

    const children: Array<{ path: string; title: string; type: string }> = [];
    try {
      for await (const entry of Deno.readDir(dirAbs)) {
        if (entry.name === "README.md" || entry.name.startsWith(".")) continue;
        if (entry.isFile && entry.name.endsWith(".md")) {
          const slug      = entry.name.replace(/\.md$/, "");
          const childPath = slug === "index" ? wikiPath : `${wikiPath}/${slug}`;
          let title       = slug;
          try {
            const raw = await Deno.readTextFile(join(dirAbs, entry.name));
            const { meta } = parseFrontmatter(raw);
            title = (meta.title as string) || slug;
          } catch { /* keep slug */ }
          children.push({ path: childPath, title, type: "page" });
        } else if (entry.isDirectory) {
          children.push({ path: `${wikiPath}/${entry.name}`, title: entry.name, type: "dir" });
        }
      }
    } catch {
      u.send(`No wiki page or directory found at '${wikiPath}'.`);
      return;
    }

    if (!children.length) { u.send(`'${wikiPath}' is empty.`); return; }
    children.sort((a, b) => a.path.localeCompare(b.path));

    u.send(`%ch%cw=== ${wikiPath.toUpperCase()} ===%cn`);
    u.send("%ch" + "-".repeat(60) + "%cn");
    for (const c of children) {
      const marker = c.type === "dir" ? "%ch%cb[dir]%cn " : "      ";
      u.send(marker + u.util.ljust(c.path.split("/").pop() || c.path, 28) + " " + c.title);
    }
    u.send("%ch" + "-".repeat(60) + "%cn");
    u.send(`Use "+wiki ${wikiPath}/<page>" to read a page.`);
  },
});

// ─── @wiki ────────────────────────────────────────────────────────────────────
//
// @wiki/create <path>=<title>/<body>   — write a new .md file
// @wiki/edit   <path>=<new body>       — replace body, keep frontmatter
// @wiki/fetch  <url>=<wiki-path>       — download image from URL into wiki/

addCmd({
  name: "@wiki",
  pattern: /^@wiki(?:\/(create|edit|fetch))?\s*(.*)/i,
  lock: "connected",
  help: [
    "@wiki/create <path>=<title>/<body>  (admin)",
    "@wiki/edit <path>=<new body>         (admin)",
    "@wiki/fetch <url>=<wiki-path>        (admin)",
    "Manage wiki pages and images.",
  ].join("\n"),
  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] || "").toLowerCase().trim();
    const arg = (u.cmd.args[1] || "").trim();

    if (!sw) {
      u.send("Usage: @wiki/<switch> <args>  — see 'help @wiki' for details.");
      return;
    }

    if (!isAdmin(u)) { u.send("Permission denied."); return; }

    // ── @wiki/create <path>=<title>/<body> ────────────────────────────────────
    if (sw === "create") {
      const eqIdx = arg.indexOf("=");
      if (eqIdx === -1) { u.send("Usage: @wiki/create <path>=<title>/<body>"); return; }

      const pagePath = arg.slice(0, eqIdx).trim().replace(/\.md$/, "");
      const rest     = arg.slice(eqIdx + 1);
      const sepIdx   = rest.indexOf("/");

      if (!pagePath || sepIdx === -1) { u.send("Usage: @wiki/create <path>=<title>/<body>"); return; }

      const title    = rest.slice(0, sepIdx).trim();
      const body     = rest.slice(sepIdx + 1).trim();

      if (!title || !body) { u.send("Usage: @wiki/create <path>=<title>/<body>"); return; }

      const targetAbs = safePath(`${pagePath}.md`);
      if (!targetAbs) { u.send("Invalid path."); return; }

      try { await Deno.stat(targetAbs); u.send(`Page '${pagePath}' already exists. Use @wiki/edit to update it.`); return; }
      catch { /* file doesn't exist — proceed */ }

      const meta = {
        title,
        author: u.me.name || u.me.id,
        date:   new Date().toISOString().slice(0, 10),
      };

      await ensureDir(resolve(join(targetAbs, "..")));
      await Deno.writeTextFile(targetAbs, serializePage(meta, body));
      await wikiHooks.emit("wiki:created", { path: pagePath, meta, body });
      u.send(`Page '${pagePath}' created: "${title}"`);
      return;
    }

    // ── @wiki/edit <path>=<new body> ──────────────────────────────────────────
    if (sw === "edit") {
      const eqIdx = arg.indexOf("=");
      if (eqIdx === -1) { u.send("Usage: @wiki/edit <path>=<new body>"); return; }

      const pagePath = arg.slice(0, eqIdx).trim();
      const newBody  = arg.slice(eqIdx + 1).trim();

      if (!pagePath || !newBody) { u.send("Usage: @wiki/edit <path>=<new body>"); return; }

      const found = await findPageFile(pagePath);
      if (!found) { u.send(`Page '${pagePath}' not found.`); return; }

      const raw = await Deno.readTextFile(found);
      const { meta } = parseFrontmatter(raw);

      await Deno.writeTextFile(found, serializePage(meta, newBody));
      await wikiHooks.emit("wiki:edited", { path: pagePath, meta, body: newBody });
      u.send(`Page '${pagePath}' updated.`);
      return;
    }

    // ── @wiki/fetch <url>=<wiki-path> ─────────────────────────────────────────
    if (sw === "fetch") {
      const eqIdx = arg.indexOf("=");
      if (eqIdx === -1) { u.send("Usage: @wiki/fetch <url>=<wiki-path>"); return; }

      const fetchUrl = arg.slice(0, eqIdx).trim();
      const savePath = arg.slice(eqIdx + 1).trim();

      if (!fetchUrl.startsWith("http://") && !fetchUrl.startsWith("https://")) {
        u.send("URL must start with http:// or https://");
        return;
      }

      // SSRF guard — block private/loopback/link-local ranges.
      let parsedUrl: URL;
      try { parsedUrl = new URL(fetchUrl); } catch { u.send("Invalid URL."); return; }
      const hostname = parsedUrl.hostname.toLowerCase();
      const privatePattern = /^(localhost|127\.|0\.0\.0\.0|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|::1$|fc00:|fd)/;
      if (privatePattern.test(hostname)) {
        u.send("URL resolves to a private or internal address.");
        return;
      }

      const targetAbs = safePath(savePath);
      if (!targetAbs) { u.send("Invalid save path."); return; }

      if (!mimeForPath(savePath)) {
        const allowed = Object.keys(ALLOWED_MEDIA_TYPES).join(", ");
        u.send(`Unsupported file type. Allowed extensions: ${allowed}`);
        return;
      }

      u.send(`Fetching ${fetchUrl} ...`);

      try {
        const resp = await fetch(fetchUrl, { signal: AbortSignal.timeout(15_000) });
        if (!resp.ok) {
          u.send(`Fetch failed: ${resp.status} ${resp.statusText}`);
          return;
        }

        const contentType = resp.headers.get("content-type") || "";
        const allowedMimes = Object.values(ALLOWED_MEDIA_TYPES);
        if (!allowedMimes.some((m) => contentType.startsWith(m))) {
          u.send(`Remote server returned an unsupported content type: ${contentType}`);
          return;
        }

        const data = new Uint8Array(await resp.arrayBuffer());
        if (data.length > MAX_UPLOAD_BYTES) {
          u.send("File too large (max 10 MB).");
          return;
        }

        await ensureDir(resolve(join(targetAbs, "..")));
        await Deno.writeFile(targetAbs, data);
        u.send(`Saved to wiki/${savePath} (${(data.length / 1024).toFixed(1)} KB)`);
      } catch (e) {
        u.send(`Fetch error: ${e instanceof Error ? e.message : String(e)}`);
      }
      return;
    }

    u.send("Unknown @wiki switch. See 'help @wiki' for available options.");
  },
});
