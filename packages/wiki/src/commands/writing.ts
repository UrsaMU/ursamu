import { join, resolve } from "@std/path";
import { ensureDir } from "@std/fs";
import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import {
  MAX_UPLOAD_BYTES, ALLOWED_MEDIA_TYPES,
  safePath, mimeForPath, parseFrontmatter, serializePage,
  findPageFile, normalisePath,
} from "../fs.ts";
import { isAdmin, isValidReadLock } from "../permissions.ts";
import { isWebhookUrlSafe, isPrivateIp, buildPinnedFetchUrl } from "../url-safety.ts";
import { saveSnapshot, listHistory, readSnapshot, migrateHistory } from "../history.ts";
import { loadWebhooks, saveWebhooks } from "../webhook.ts";
import { wikiHooks } from "../hooks.ts";
import { subscriptions } from "../db.ts";

// ─── @wiki ────────────────────────────────────────────────────────────────────

addCmd({
  name: "@wiki",
  pattern: /^@wiki(?:\/(create|edit|delete|move|tag|fetch|lock|draft|webhook|restore|diff|history))?\s*(.*)/i,
  lock: "connected",
  category: "Wiki",
  help: `@wiki/<switch> <args>  — Manage wiki pages (admin+).

Switches:
  /create <path>=<title>/<body>    Create a new page.
  /edit <path>=<new body>          Replace body, keep frontmatter.
  /delete <path>                   Delete a page and its history.
  /move <path>=<new-path>          Rename/move a page.
  /tag <path>=<tag1,tag2,...>      Set tags on a page.
  /fetch <url>=<wiki-path>         Download a remote asset into the wiki.
  /lock <path>=<lock>              Set readLock (connected|admin|staff|faction:<id>).
  /draft <path>=<on|off>           Toggle draft (staff-only visibility).
  /webhook <dir>=<url>             Set Discord webhook for a directory (https:// only).
  /restore <path>=<timestamp>      Restore a page from a history snapshot.
  /diff <path>=<t1>/<t2>           Compare two snapshots (shows first differing line).
  /history <path>                  List available history snapshots.

Examples:
  @wiki/create news/battle=Battle of Shadows/The conflict began at dawn...
  @wiki/edit news/battle=Updated body text goes here.
  @wiki/delete news/old-post
  @wiki/move news/battle=archive/battle-2026
  @wiki/tag lore/factions=lore,ic,factions
  @wiki/lock staff-notes=admin
  @wiki/draft lore/wip=on
  @wiki/webhook news=https://discord.com/api/webhooks/...
  @wiki/history news/battle`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = (u.cmd.args[1] ?? "").trim();

    if (!sw) { u.send("Usage: @wiki/<switch> <args>  — see 'help @wiki' for details."); return; }
    if (!isAdmin(u)) { u.send("%ch>Wiki:%cn Permission denied."); return; }

    if (sw === "create")  return await cmdCreate(u, arg);
    if (sw === "edit")    return await cmdEdit(u, arg);
    if (sw === "delete")  return await cmdDelete(u, arg);
    if (sw === "move")    return await cmdMove(u, arg);
    if (sw === "tag")     return await cmdTag(u, arg);
    if (sw === "fetch")   return await cmdFetch(u, arg);
    if (sw === "lock")    return await cmdLock(u, arg);
    if (sw === "draft")   return await cmdDraft(u, arg);
    if (sw === "webhook") return await cmdWebhook(u, arg);
    if (sw === "restore") return await cmdRestore(u, arg);
    if (sw === "diff")    return await cmdDiff(u, arg);
    if (sw === "history") return await cmdHistory(u, arg);

    u.send("Unknown @wiki switch. See 'help @wiki' for available options.");
  },
});

// ─── /create ─────────────────────────────────────────────────────────────────

async function cmdCreate(u: IUrsamuSDK, arg: string): Promise<void> {
  const eqIdx = arg.indexOf("=");
  if (eqIdx === -1) { u.send("Usage: @wiki/create <path>=<title>/<body>"); return; }
  const pagePath = normalisePath(arg.slice(0, eqIdx).trim().replace(/\.md$/, ""));
  const rest     = arg.slice(eqIdx + 1);
  const sepIdx   = rest.indexOf("/");
  if (!pagePath || sepIdx === -1) { u.send("Usage: @wiki/create <path>=<title>/<body>"); return; }

  const title = rest.slice(0, sepIdx).trim();
  const body  = rest.slice(sepIdx + 1).trim();
  if (!title || !body) { u.send("Usage: @wiki/create <path>=<title>/<body>"); return; }

  const targetAbs = safePath(`${pagePath}.md`);
  if (!targetAbs) { u.send("Invalid path."); return; }

  try { await Deno.stat(targetAbs); u.send(`Page '${pagePath}' already exists.`); return; }
  catch { /* proceed */ }

  const meta = { title, author: u.util.stripSubs(u.me.name ?? u.me.id), date: new Date().toISOString().slice(0, 10) };
  await ensureDir(resolve(join(targetAbs, "..")));
  // Atomic create: createNew prevents TOCTOU race
  try {
    const file = await Deno.open(targetAbs, { write: true, createNew: true });
    const content = serializePage(meta, body);
    await file.write(new TextEncoder().encode(content));
    file.close();
    await saveSnapshot(pagePath, content);
  } catch (e) {
    if (e instanceof Deno.errors.AlreadyExists) { u.send(`Page '${pagePath}' already exists.`); return; }
    throw e;
  }
  await wikiHooks.emit("wiki:created", { path: pagePath, meta, body });
  u.send(`%ch>Wiki:%cn Page '${pagePath}' created.`);
}

// ─── /edit ───────────────────────────────────────────────────────────────────

async function cmdEdit(u: IUrsamuSDK, arg: string): Promise<void> {
  const eqIdx = arg.indexOf("=");
  if (eqIdx === -1) { u.send("Usage: @wiki/edit <path>=<new body>"); return; }
  const pagePath = normalisePath(arg.slice(0, eqIdx).trim());
  const newBody  = arg.slice(eqIdx + 1).trim();
  if (!pagePath || !newBody) { u.send("Usage: @wiki/edit <path>=<new body>"); return; }

  const found = await findPageFile(pagePath);
  if (!found) { u.send(`Page '${pagePath}' not found.`); return; }

  const raw   = await Deno.readTextFile(found);
  const { meta } = parseFrontmatter(raw);
  await saveSnapshot(pagePath, raw);
  const content = serializePage(meta, newBody);
  await Deno.writeTextFile(found, content);
  await wikiHooks.emit("wiki:edited", { path: pagePath, meta, body: newBody });
  u.send(`%ch>Wiki:%cn Page '${pagePath}' updated.`);
}

// ─── /delete ─────────────────────────────────────────────────────────────────

async function cmdDelete(u: IUrsamuSDK, arg: string): Promise<void> {
  const pagePath = normalisePath(arg.trim());
  if (!pagePath) { u.send("Usage: @wiki/delete <path>"); return; }

  const found = await findPageFile(pagePath);
  if (!found) { u.send(`Page '${pagePath}' not found.`); return; }

  const raw  = await Deno.readTextFile(found);
  const { meta } = parseFrontmatter(raw);
  await Deno.remove(found);
  // Clean up subscriptions for the deleted page
  const subs = await subscriptions.find({ path: pagePath });
  for (const s of subs) await subscriptions.delete({ id: s.id });

  await wikiHooks.emit("wiki:deleted", { path: pagePath, meta });
  u.send(`%ch>Wiki:%cn Page '${pagePath}' deleted.`);
}

// ─── /move ───────────────────────────────────────────────────────────────────

async function cmdMove(u: IUrsamuSDK, arg: string): Promise<void> {
  const eqIdx = arg.indexOf("=");
  if (eqIdx === -1) { u.send("Usage: @wiki/move <path>=<new-path>"); return; }
  const oldPath = normalisePath(arg.slice(0, eqIdx).trim());
  const newPath = normalisePath(arg.slice(eqIdx + 1).trim().replace(/\.md$/, ""));
  if (!oldPath || !newPath) { u.send("Usage: @wiki/move <path>=<new-path>"); return; }

  const found  = await findPageFile(oldPath);
  if (!found) { u.send(`Page '${oldPath}' not found.`); return; }
  const newAbs = safePath(`${newPath}.md`);
  if (!newAbs) { u.send("Invalid destination path."); return; }

  try { await Deno.stat(newAbs); u.send(`Destination '${newPath}' already exists.`); return; }
  catch { /* proceed */ }

  await ensureDir(resolve(join(newAbs, "..")));
  const raw = await Deno.readTextFile(found);
  const { meta, body } = parseFrontmatter(raw);
  await Deno.rename(found, newAbs);
  await migrateHistory(oldPath, newPath);

  // Migrate subscriptions to new path
  const subs = await subscriptions.find({ path: oldPath });
  for (const s of subs) await subscriptions.modify({ id: s.id }, "$set", { path: newPath });

  await wikiHooks.emit("wiki:renamed", { path: newPath, oldPath, meta, body });
  u.send(`%ch>Wiki:%cn Page moved from '${oldPath}' to '${newPath}'.`);
}

// ─── /tag ────────────────────────────────────────────────────────────────────

async function cmdTag(u: IUrsamuSDK, arg: string): Promise<void> {
  const eqIdx = arg.indexOf("=");
  if (eqIdx === -1) { u.send("Usage: @wiki/tag <path>=<tag1,tag2,...>"); return; }
  const pagePath = normalisePath(arg.slice(0, eqIdx).trim());
  const tagStr   = u.util.stripSubs(arg.slice(eqIdx + 1).trim());
  if (!pagePath) { u.send("Usage: @wiki/tag <path>=<tag1,tag2,...>"); return; }

  const found = await findPageFile(pagePath);
  if (!found) { u.send(`Page '${pagePath}' not found.`); return; }

  const raw  = await Deno.readTextFile(found);
  const { meta, body } = parseFrontmatter(raw);
  const tags = tagStr ? tagStr.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean) : [];
  const updatedMeta = { ...meta, tags };
  await Deno.writeTextFile(found, serializePage(updatedMeta, body));
  await wikiHooks.emit("wiki:edited", { path: pagePath, meta: updatedMeta, body });
  u.send(`%ch>Wiki:%cn Tags set on '${pagePath}': ${tags.length ? tags.join(", ") : "(none)"}`);
}

// ─── /fetch ──────────────────────────────────────────────────────────────────

async function cmdFetch(u: IUrsamuSDK, arg: string): Promise<void> {
  const eqIdx = arg.indexOf("=");
  if (eqIdx === -1) { u.send("Usage: @wiki/fetch <url>=<wiki-path>"); return; }
  const fetchUrl = arg.slice(0, eqIdx).trim();
  const savePath = arg.slice(eqIdx + 1).trim();

  if (!fetchUrl.startsWith("http://") && !fetchUrl.startsWith("https://")) {
    u.send("URL must start with http:// or https://"); return;
  }

  let parsedUrl: URL;
  try { parsedUrl = new URL(fetchUrl); } catch { u.send("Invalid URL."); return; }

  const hostname = parsedUrl.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost") { u.send("URL resolves to a private address."); return; }

  const addrs = [
    ...await Deno.resolveDns(hostname, "A").catch(() => []),
    ...await Deno.resolveDns(hostname, "AAAA").catch(() => []),
  ];
  if (!addrs.length || addrs.some(isPrivateIp)) {
    u.send("URL resolves to a private or internal address."); return;
  }

  const targetAbs = safePath(savePath);
  if (!targetAbs) { u.send("Invalid save path."); return; }
  if (!mimeForPath(savePath)) {
    u.send(`Unsupported file type. Allowed: ${Object.keys(ALLOWED_MEDIA_TYPES).join(", ")}`); return;
  }

  // Pin the fetch to the first resolved IP to prevent DNS rebinding.
  const pinnedUrl = buildPinnedFetchUrl(fetchUrl, addrs[0]);

  u.send(`Fetching ${fetchUrl} ...`);
  try {
    const resp = await fetch(pinnedUrl, { signal: AbortSignal.timeout(15_000) });
    if (!resp.ok) { u.send(`Fetch failed: ${resp.status} ${resp.statusText}`); return; }
    const contentType  = resp.headers.get("content-type") || "";
    const allowedMimes = Object.values(ALLOWED_MEDIA_TYPES);
    if (!allowedMimes.some((m) => contentType.startsWith(m))) {
      u.send(`Unsupported content type: ${contentType}`); return;
    }
    const data = new Uint8Array(await resp.arrayBuffer());
    if (data.length > MAX_UPLOAD_BYTES) { u.send("File too large (max 10 MB)."); return; }
    await ensureDir(resolve(join(targetAbs, "..")));
    await Deno.writeFile(targetAbs, data);
    u.send(`%ch>Wiki:%cn Saved to wiki/${savePath} (${(data.length / 1024).toFixed(1)} KB)`);
  } catch (e: unknown) {
    u.send(`Fetch error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ─── /lock ───────────────────────────────────────────────────────────────────

async function cmdLock(u: IUrsamuSDK, arg: string): Promise<void> {
  const eqIdx = arg.indexOf("=");
  if (eqIdx === -1) { u.send("Usage: @wiki/lock <path>=<lock>"); return; }
  const pagePath = normalisePath(arg.slice(0, eqIdx).trim());
  const lock     = u.util.stripSubs(arg.slice(eqIdx + 1).trim());
  if (!pagePath || !lock) { u.send("Usage: @wiki/lock <path>=<lock>"); return; }
  if (!isValidReadLock(lock)) {
    u.send("Invalid lock. Use: connected, admin, staff, or faction:<id>"); return;
  }
  const found = await findPageFile(pagePath);
  if (!found) { u.send(`Page '${pagePath}' not found.`); return; }
  const raw  = await Deno.readTextFile(found);
  const { meta, body } = parseFrontmatter(raw);
  await Deno.writeTextFile(found, serializePage({ ...meta, readLock: lock }, body));
  u.send(`%ch>Wiki:%cn Read lock on '${pagePath}' set to '${lock}'.`);
}

// ─── /draft ──────────────────────────────────────────────────────────────────

async function cmdDraft(u: IUrsamuSDK, arg: string): Promise<void> {
  const eqIdx = arg.indexOf("=");
  if (eqIdx === -1) { u.send("Usage: @wiki/draft <path>=<on|off>"); return; }
  const pagePath = normalisePath(arg.slice(0, eqIdx).trim());
  const toggle   = arg.slice(eqIdx + 1).trim().toLowerCase();
  if (!pagePath || (toggle !== "on" && toggle !== "off")) {
    u.send("Usage: @wiki/draft <path>=<on|off>"); return;
  }
  const found = await findPageFile(pagePath);
  if (!found) { u.send(`Page '${pagePath}' not found.`); return; }
  const raw  = await Deno.readTextFile(found);
  const { meta, body } = parseFrontmatter(raw);
  const isDraft = toggle === "on";
  await Deno.writeTextFile(found, serializePage({ ...meta, draft: isDraft }, body));
  u.send(`%ch>Wiki:%cn Page '${pagePath}' is now ${isDraft ? "%ch%cydraft%cn (staff-only)" : "published"}.`);
}

// ─── /webhook ────────────────────────────────────────────────────────────────

async function cmdWebhook(u: IUrsamuSDK, arg: string): Promise<void> {
  const eqIdx = arg.indexOf("=");
  if (eqIdx === -1) { u.send("Usage: @wiki/webhook <dir>=<url>  (or =off to remove)"); return; }
  const dir = normalisePath(arg.slice(0, eqIdx).trim());
  const url = arg.slice(eqIdx + 1).trim();
  const map = await loadWebhooks();

  if (url === "off" || url === "") {
    delete map[dir];
    await saveWebhooks(map);
    u.send(`%ch>Wiki:%cn Webhook removed for '${dir || "root"}'.`);
    return;
  }

  if (!isWebhookUrlSafe(url)) {
    u.send("Webhook must be an https:// URL pointing to a non-private host."); return;
  }
  map[dir] = url;
  await saveWebhooks(map);
  u.send(`%ch>Wiki:%cn Webhook set for '${dir || "root"}'.`);
}

// ─── /restore ────────────────────────────────────────────────────────────────

async function cmdRestore(u: IUrsamuSDK, arg: string): Promise<void> {
  const eqIdx = arg.indexOf("=");
  if (eqIdx === -1) { u.send("Usage: @wiki/restore <path>=<timestamp>"); return; }
  const pagePath  = normalisePath(arg.slice(0, eqIdx).trim());
  const timestamp = arg.slice(eqIdx + 1).trim();
  if (!pagePath || !timestamp) { u.send("Usage: @wiki/restore <path>=<timestamp>"); return; }

  const snapshot = await readSnapshot(pagePath, timestamp);
  if (!snapshot) { u.send(`Snapshot '${timestamp}' not found for '${pagePath}'.`); return; }

  const found = await findPageFile(pagePath);
  if (!found) { u.send(`Page '${pagePath}' not found.`); return; }

  const current = await Deno.readTextFile(found);
  await saveSnapshot(pagePath, current);
  await Deno.writeTextFile(found, snapshot);
  const { meta, body } = parseFrontmatter(snapshot);
  await wikiHooks.emit("wiki:edited", { path: pagePath, meta, body });
  u.send(`%ch>Wiki:%cn Page '${pagePath}' restored from ${timestamp}.`);
}

// ─── /diff ───────────────────────────────────────────────────────────────────

async function cmdDiff(u: IUrsamuSDK, arg: string): Promise<void> {
  const eqIdx = arg.indexOf("=");
  if (eqIdx === -1) { u.send("Usage: @wiki/diff <path>=<t1>/<t2>"); return; }
  const pagePath = normalisePath(arg.slice(0, eqIdx).trim());
  const rest     = arg.slice(eqIdx + 1);
  const slashIdx = rest.indexOf("/");
  if (slashIdx === -1) { u.send("Usage: @wiki/diff <path>=<t1>/<t2>"); return; }

  const t1 = rest.slice(0, slashIdx).trim();
  const t2 = rest.slice(slashIdx + 1).trim();
  const [snap1, snap2] = await Promise.all([readSnapshot(pagePath, t1), readSnapshot(pagePath, t2)]);
  if (!snap1) { u.send(`Snapshot '${t1}' not found.`); return; }
  if (!snap2) { u.send(`Snapshot '${t2}' not found.`); return; }

  const lines1 = snap1.split("\n");
  const lines2 = snap2.split("\n");
  const diffs: string[] = [];
  const max = Math.max(lines1.length, lines2.length);

  for (let i = 0; i < max && diffs.length < 20; i++) {
    if (lines1[i] !== lines2[i]) {
      diffs.push(`L${i + 1}: %cr- ${lines1[i] ?? ""}%cn`);
      diffs.push(`L${i + 1}: %cg+ ${lines2[i] ?? ""}%cn`);
    }
  }

  if (!diffs.length) { u.send(`No differences found between '${t1}' and '${t2}'.`); return; }
  u.send(`%ch>Wiki:%cn Diff ${pagePath} (${t1} → ${t2}), showing first 20 changes:%cn`);
  for (const d of diffs) u.send(d);
}

// ─── /history ────────────────────────────────────────────────────────────────

async function cmdHistory(u: IUrsamuSDK, arg: string): Promise<void> {
  const pagePath = normalisePath(arg.trim());
  if (!pagePath) { u.send("Usage: @wiki/history <path>"); return; }
  const timestamps = await listHistory(pagePath);
  if (!timestamps.length) { u.send(`No history for '${pagePath}'.`); return; }
  u.send(`%ch>Wiki:%cn History for '${pagePath}' (${timestamps.length} snapshots):%cn`);
  for (const t of timestamps.slice(0, 20)) u.send("  " + t);
  if (timestamps.length > 20) u.send(`  ... and ${timestamps.length - 20} more.`);
}
