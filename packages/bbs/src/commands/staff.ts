import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { boards, posts, getNextBoardNum } from "../db.ts";
import type { IBoard } from "../db.ts";
import { getAllBoards, findBoard, getPost, getBoardPosts } from "../query.ts";
import { isWebhookUrlSafe } from "../url-safety.ts";
import { isStaff, isBoardMod } from "../permissions.ts";
import { getConfig, setConfig } from "../tracking.ts";
import { bbDate, EQ_LINE, DASH_LINE } from "../display.ts";

// ─── +bbnewgroup ─────────────────────────────────────────────────────────────

addCmd({
  name: "+bbnewgroup",
  pattern: /^\+?bbnewgroup\s+(.+?)(?:=(.+))?$/i,
  lock: "connected admin+",
  category: "BBS Staff",
  help: `+bbnewgroup <title>[=<category>]  — Create a new BBS board. Staff only.

Examples:
  +bbnewgroup Announcements               Create board in default "General" category.
  +bbnewgroup IC Events=Roleplay          Create board in the "Roleplay" category.`,
  exec: async (u: IUrsamuSDK) => {
    if (!isStaff(u)) { u.send("%ch>BBS:%cn Staff only."); return; }
    const title    = u.util.stripSubs((u.cmd.args[0] ?? "").trim());
    const category = u.util.stripSubs((u.cmd.args[1] ?? "General").trim());
    if (!title) { u.send("%ch>BBS:%cn Board title is required."); return; }

    const existing = await boards.queryOne({ title });
    if (existing) { u.send(`%ch>BBS:%cn A board named "${title}" already exists.`); return; }

    const num = await getNextBoardNum();
    const board: IBoard = {
      id: `board-${num}`, num, title,
      timeout: 0, anonymous: false,
      readLock: "all()", writeLock: "all()",
      pendingDelete: false,
      category, type: "normal", moderators: [],
    };
    await boards.create(board);
    u.send(`%ch>BBS:%cn Board %cc${title}%cn (#${num}) created in category %cc${category}%cn.`);
  },
});

// ─── +bbcleargroup / +bbconfirm ──────────────────────────────────────────────

addCmd({
  name: "+bbcleargroup",
  pattern: /^\+?bbcleargroup\s+(.*)/i,
  lock: "connected admin+",
  category: "BBS Staff",
  help: `+bbcleargroup <#>  — Mark a board for deletion. Confirm with +bbconfirm <#>.

Examples:
  +bbcleargroup 3    Mark board 3 for deletion.`,
  exec: async (u: IUrsamuSDK) => {
    if (!isStaff(u)) { u.send("%ch>BBS:%cn Staff only."); return; }
    const { board, error } = await findBoard((u.cmd.args[0] ?? "").trim());
    if (!board) { u.send(`%ch>BBS:%cn ${error}`); return; }
    await boards.modify({ id: board.id }, "$set", { pendingDelete: true });
    u.send(`%ch>BBS:%cn Board %cc${board.title}%cn marked for deletion. Confirm with +bbconfirm ${board.num}.`);
  },
});

addCmd({
  name: "+bbconfirm",
  pattern: /^\+?bbconfirm\s+(.*)/i,
  lock: "connected admin+",
  category: "BBS Staff",
  help: `+bbconfirm <#>  — Confirm deletion of a board marked with +bbcleargroup.

Examples:
  +bbconfirm 3    Delete board 3 and all its posts.`,
  exec: async (u: IUrsamuSDK) => {
    if (!isStaff(u)) { u.send("%ch>BBS:%cn Staff only."); return; }
    const { board, error } = await findBoard((u.cmd.args[0] ?? "").trim());
    if (!board) { u.send(`%ch>BBS:%cn ${error}`); return; }
    if (!board.pendingDelete) { u.send(`%ch>BBS:%cn Board ${board.num} is not marked for deletion. Use +bbcleargroup first.`); return; }

    const boardPosts = await getBoardPosts(board.num);
    for (const post of boardPosts) await posts.delete({ id: post.id });
    await boards.delete({ id: board.id });
    u.send(`%ch>BBS:%cn Board %cc${board.title}%cn and ${boardPosts.length} post(s) deleted.`);
  },
});

// ─── +bblock / +bbwritelock ──────────────────────────────────────────────────

addCmd({
  name: "+bblock",
  pattern: /^\+?bblock\s+(.+?)=(.*)/i,
  lock: "connected admin+",
  category: "BBS Staff",
  help: `+bblock <#>=<lock>  — Set the read lock on a board. Use "all()" for open.

Lock values: "all()" (open), "faction" (ownerId-based), "" (also open).

Examples:
  +bblock 2=all()     Open board 2 to everyone.
  +bblock 2=faction   Restrict board 2 to faction members.`,
  exec: async (u: IUrsamuSDK) => {
    if (!isStaff(u)) { u.send("%ch>BBS:%cn Staff only."); return; }
    const { board, error } = await findBoard((u.cmd.args[0] ?? "").trim());
    if (!board) { u.send(`%ch>BBS:%cn ${error}`); return; }
    const lock = (u.cmd.args[1] ?? "").trim();
    await boards.modify({ id: board.id }, "$set", { readLock: lock });
    u.send(`%ch>BBS:%cn Read lock on %cc${board.title}%cn set to: ${lock || "(open)"}`);
  },
});

addCmd({
  name: "+bbwritelock",
  pattern: /^\+?bbwritelock\s+(.+?)=(.*)/i,
  lock: "connected admin+",
  category: "BBS Staff",
  help: `+bbwritelock <#>=<lock>  — Set the write lock on a board.

Examples:
  +bbwritelock 2=all()     Allow anyone to post.
  +bbwritelock 2=faction   Only faction members can post.`,
  exec: async (u: IUrsamuSDK) => {
    if (!isStaff(u)) { u.send("%ch>BBS:%cn Staff only."); return; }
    const { board, error } = await findBoard((u.cmd.args[0] ?? "").trim());
    if (!board) { u.send(`%ch>BBS:%cn ${error}`); return; }
    const lock = (u.cmd.args[1] ?? "").trim();
    await boards.modify({ id: board.id }, "$set", { writeLock: lock });
    u.send(`%ch>BBS:%cn Write lock on %cc${board.title}%cn set to: ${lock || "(open)"}`);
  },
});

// ─── +bbtimeout ──────────────────────────────────────────────────────────────

addCmd({
  name: "+bbtimeout",
  pattern: /^\+?bbtimeout\s+(.+?)\/(\d+)=(\d+)/i,
  lock: "connected admin+",
  category: "BBS Staff",
  help: `+bbtimeout <#>/<post>=<days>  — Set post expiry in days. 0 = no timeout.

Examples:
  +bbtimeout 2/3=30    Set post 3 on board 2 to expire in 30 days.
  +bbtimeout 2/3=0     Remove timeout from post 3.`,
  exec: async (u: IUrsamuSDK) => {
    if (!isStaff(u)) { u.send("%ch>BBS:%cn Staff only."); return; }
    const { board, error } = await findBoard((u.cmd.args[0] ?? "").trim());
    if (!board) { u.send(`%ch>BBS:%cn ${error}`); return; }
    const post = await getPost(board.num, parseInt(u.cmd.args[1] ?? "", 10));
    if (!post) { u.send("%ch>BBS:%cn Post not found."); return; }
    const days = parseInt(u.cmd.args[2] ?? "", 10);
    await posts.modify({ id: post.id }, "$set", { timeout: days });
    u.send(`%ch>BBS:%cn Post ${board.num}/${post.num} timeout set to ${days} day(s).`);
  },
});

// ─── +bbconfig ───────────────────────────────────────────────────────────────

addCmd({
  name: "+bbconfig",
  pattern: /^\+?bbconfig(?:\s+(.+?)=(.+))?$/i,
  lock: "connected admin+",
  category: "BBS Staff",
  help: `+bbconfig [<setting>=<value>]  — View or set global BBS config.

Settings: timeout (days), autotimeout (on/off).

Examples:
  +bbconfig                    Show current config.
  +bbconfig timeout=30         Set global default timeout.
  +bbconfig autotimeout=on     Enable auto-expiry.`,
  exec: async (u: IUrsamuSDK) => {
    if (!isStaff(u)) { u.send("%ch>BBS:%cn Staff only."); return; }
    const key = (u.cmd.args[0] ?? "").trim().toLowerCase();
    const val = (u.cmd.args[1] ?? "").trim().toLowerCase();

    if (!key) {
      const cfg = await getConfig();
      u.send(`%ch>BBS Config:%cn\n  timeout:     ${cfg.timeout} days (0 = none)\n  autotimeout: ${cfg.autoTimeout ? "on" : "off"}`);
      return;
    }
    if (key === "timeout") {
      const n = parseInt(val, 10);
      if (isNaN(n) || n < 0) { u.send("%ch>BBS:%cn timeout must be a non-negative integer."); return; }
      await setConfig({ timeout: n });
      u.send(`%ch>BBS:%cn Global timeout set to ${n} days.`);
    } else if (key === "autotimeout") {
      await setConfig({ autoTimeout: val === "on" });
      u.send(`%ch>BBS:%cn Auto-timeout ${val === "on" ? "enabled" : "disabled"}.`);
    } else {
      u.send(`%ch>BBS:%cn Unknown setting: ${key}`);
    }
  },
});

// ─── +bbmod ──────────────────────────────────────────────────────────────────

addCmd({
  name: "+bbmod",
  pattern: /^\+?bbmod\s+(.+?)=(.+)/i,
  lock: "connected admin+",
  category: "BBS Staff",
  help: `+bbmod <#>=<player>  — Add or remove a board moderator. Staff only.

Toggles: if player is already a mod, removes them; otherwise adds them.

Examples:
  +bbmod 2=Alice    Add Alice as a moderator of board 2 (or remove if already mod).`,
  exec: async (u: IUrsamuSDK) => {
    if (!isStaff(u)) { u.send("%ch>BBS:%cn Staff only."); return; }
    const { board, error } = await findBoard((u.cmd.args[0] ?? "").trim());
    if (!board) { u.send(`%ch>BBS:%cn ${error}`); return; }

    const name   = u.util.stripSubs((u.cmd.args[1] ?? "").trim());
    const target = await u.util.target(u.me, name, true);
    if (!target) { u.send(`%ch>BBS:%cn Player "${name}" not found.`); return; }
    // Reject non-player objects — rooms/items must not become moderators
    if (!target.flags.has("player")) { u.send(`%ch>BBS:%cn Target must be a player.`); return; }

    const mods = board.moderators ?? [];
    if (mods.includes(target.id)) {
      await boards.modify({ id: board.id }, "$set", { moderators: mods.filter((m) => m !== target.id) });
      u.send(`%ch>BBS:%cn ${target.name} removed as moderator of %cc${board.title}%cn.`);
    } else {
      await boards.modify({ id: board.id }, "$set", { moderators: [...mods, target.id] });
      u.send(`%ch>BBS:%cn ${target.name} added as moderator of %cc${board.title}%cn.`);
    }
  },
});

// ─── +bbcategory ─────────────────────────────────────────────────────────────

addCmd({
  name: "+bbcategory",
  pattern: /^\+?bbcategory\s+(.+?)=(.*)/i,
  lock: "connected admin+",
  category: "BBS Staff",
  help: `+bbcategory <#>=<category>  — Set the display category for a board.

Examples:
  +bbcategory 2=Roleplay    Move board 2 into the "Roleplay" category.
  +bbcategory 2=General     Reset board 2 to the default category.`,
  exec: async (u: IUrsamuSDK) => {
    if (!isStaff(u)) { u.send("%ch>BBS:%cn Staff only."); return; }
    const { board, error } = await findBoard((u.cmd.args[0] ?? "").trim());
    if (!board) { u.send(`%ch>BBS:%cn ${error}`); return; }
    const cat = u.util.stripSubs((u.cmd.args[1] ?? "General").trim()) || "General";
    await boards.modify({ id: board.id }, "$set", { category: cat });
    u.send(`%ch>BBS:%cn Board %cc${board.title}%cn moved to category %cc${cat}%cn.`);
  },
});

// ─── +bbwebhook ──────────────────────────────────────────────────────────────

addCmd({
  name: "+bbwebhook",
  pattern: /^\+?bbwebhook\s+(.+?)=(.*)/i,
  lock: "connected admin+",
  category: "BBS Staff",
  help: `+bbwebhook <#>=<url>  — Set (or clear) a Discord webhook URL for a board.

New posts on this board will fire a webhook notification. Clear with empty value.

Examples:
  +bbwebhook 2=https://discord.com/api/webhooks/...    Set webhook.
  +bbwebhook 2=                                        Clear webhook.`,
  exec: async (u: IUrsamuSDK) => {
    if (!isStaff(u)) { u.send("%ch>BBS:%cn Staff only."); return; }
    const { board, error } = await findBoard((u.cmd.args[0] ?? "").trim());
    if (!board) { u.send(`%ch>BBS:%cn ${error}`); return; }
    const url = (u.cmd.args[1] ?? "").trim();
    // Block non-HTTPS and SSRF targets (loopback, RFC-1918, link-local)
    if (url && !isWebhookUrlSafe(url)) { u.send("%ch>BBS:%cn Webhook URL must be a public HTTPS address (internal IPs not allowed)."); return; }
    await boards.modify({ id: board.id }, "$set", { webhookUrl: url || undefined });
    u.send(url ? `%ch>BBS:%cn Webhook set on %cc${board.title}%cn.` : `%ch>BBS:%cn Webhook cleared from %cc${board.title}%cn.`);
  },
});

// ─── +bbarchive ──────────────────────────────────────────────────────────────

addCmd({
  name: "+bbarchive",
  pattern: /^\+?bbarchive\s+(.*)/i,
  lock: "connected admin+",
  category: "BBS Staff",
  help: `+bbarchive <#>  — Toggle archive mode on a board.

Archive boards are read-only. Expired posts from other boards migrate here
if their +bbarchiveto is set to this board.

Examples:
  +bbarchive 4    Toggle board 4 between normal and archive mode.`,
  exec: async (u: IUrsamuSDK) => {
    if (!isStaff(u)) { u.send("%ch>BBS:%cn Staff only."); return; }
    const { board, error } = await findBoard((u.cmd.args[0] ?? "").trim());
    if (!board) { u.send(`%ch>BBS:%cn ${error}`); return; }
    const newType = board.type === "archive" ? "normal" : "archive";
    await boards.modify({ id: board.id }, "$set", { type: newType });
    u.send(`%ch>BBS:%cn Board %cc${board.title}%cn is now %ch${newType === "archive" ? "ARCHIVE (read-only)" : "NORMAL"}%cn.`);
  },
});

// ─── +bbreview ───────────────────────────────────────────────────────────────

addCmd({
  name: "+bbreview",
  pattern: /^\+?bbreview(?:\s+(.+))?$/i,
  lock: "connected",
  category: "BBS Staff",
  help: `+bbreview [<#>]  — List flagged posts. Board mods see their board; staff see all.

Examples:
  +bbreview      List all flagged posts (staff) or your moderated boards (mod).
  +bbreview 2    List flagged posts on board 2.`,
  exec: async (u: IUrsamuSDK) => {
    const boardStr = (u.cmd.args[0] ?? "").trim();
    const allBoards = boardStr
      ? [(await findBoard(boardStr)).board].filter(Boolean)
      : await getAllBoards();

    const lines: string[] = ["%cb" + EQ_LINE + "%cn", "%ch  Flagged Posts%cn", "%cb" + DASH_LINE + "%cn"];
    let count = 0;

    for (const board of allBoards) {
      if (!board || !isBoardMod(u, board)) continue;
      const bPosts = await getBoardPosts(board.num);
      for (const post of bPosts) {
        if (!(post.flags ?? []).length) continue;
        count++;
        lines.push(`%cc${board.num}/${post.num}%cn — ${post.subject} (${post.authorName}, ${bbDate(post.createdAt)})`);
        for (const f of post.flags) {
          lines.push(`    Flagged by ${f.playerName}: ${f.reason || "(no reason)"}`);
        }
      }
    }

    if (count === 0) { u.send("%ch>BBS:%cn No flagged posts."); return; }
    lines.push("%cb" + EQ_LINE + "%cn");
    u.send(lines.join("\n"));
  },
});

// ─── +bbunflag ───────────────────────────────────────────────────────────────

addCmd({
  name: "+bbunflag",
  pattern: /^\+?bbunflag\s+(.+?)\/(\d+)/i,
  lock: "connected",
  category: "BBS Staff",
  help: `+bbunflag <#>/<post>  — Clear all flags from a post. Board mods and staff only.

Examples:
  +bbunflag 2/3    Clear flags from post 3 on board 2.`,
  exec: async (u: IUrsamuSDK) => {
    const { board, error } = await findBoard((u.cmd.args[0] ?? "").trim());
    if (!board) { u.send(`%ch>BBS:%cn ${error}`); return; }
    if (!isBoardMod(u, board)) { u.send("%ch>BBS:%cn Board mods or staff only."); return; }
    const post = await getPost(board.num, parseInt(u.cmd.args[1] ?? "", 10));
    if (!post) { u.send("%ch>BBS:%cn Post not found."); return; }
    await posts.modify({ id: post.id }, "$set", { flags: [] });
    u.send(`%ch>BBS:%cn Flags cleared from ${board.num}/${post.num}.`);
  },
});
