import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { getAllBoards, findBoard, getBoardPosts } from "../query.ts";
import { canRead } from "../permissions.ts";
import { isMember, setMembership, getNotify, setNotify, getSig, setSig, clearSig, getUnreadCount } from "../tracking.ts";
import { bbDate, EQ_LINE, DASH_LINE } from "../display.ts";
import { posts } from "../db.ts";
import { getPost } from "../query.ts";

const WATCHER_CAP = 50;

// ─── +bblist ─────────────────────────────────────────────────────────────────

addCmd({
  name: "+bblist",
  pattern: /^\+?bblist$/i,
  lock: "connected",
  category: "BBS",
  help: `+bblist  — Show all accessible BBS boards grouped by category.

Examples:
  +bblist    Display the board index.`,
  exec: async (u: IUrsamuSDK) => {
    const allBoards = await getAllBoards();
    const visible: typeof allBoards = [];
    for (const b of allBoards) {
      if (await canRead(u, b)) visible.push(b);
    }
    if (!visible.length) { u.send("%ch>BBS:%cn No accessible boards."); return; }

    const cats = new Map<string, typeof visible>();
    for (const b of visible) {
      const cat = b.category || "General";
      if (!cats.has(cat)) cats.set(cat, []);
      cats.get(cat)!.push(b);
    }

    const lines = ["%cb" + EQ_LINE + "%cn"];
    for (const [cat, catBoards] of cats) {
      lines.push(`%ch%cc  ${cat}%cn`);
      lines.push("%cb" + DASH_LINE + "%cn");
      for (const board of catBoards) {
        const member  = isMember(u, board.num);
        const notify  = getNotify(u, board.num);
        const unread  = await getUnreadCount(u, board.num);
        const total   = (await getBoardPosts(board.num)).length;
        const unreadLabel = unread > 0 ? `%ch%cy${unread}%cn` : " 0";
        const flags   = `${member ? "J" : " "}${notify ? "N" : " "}${(board.moderators ?? []).includes(u.me.id) ? "M" : " "}`;
        lines.push(`  ${String(board.num).padStart(3)} [${flags}] %cc${board.title.padEnd(30)}%cn  ${bbDate(Date.now()).padEnd(9)} ${String(total).padStart(4)} posts  (${unreadLabel} new)`);
      }
    }
    lines.push("%cb" + DASH_LINE + "%cn");
    lines.push("  Flags: J=Joined  N=Notifications on  M=Moderator");
    lines.push("%cb" + EQ_LINE + "%cn");
    u.send(lines.join("\n"));
  },
});

// ─── +bbjoin ─────────────────────────────────────────────────────────────────

addCmd({
  name: "+bbjoin",
  pattern: /^\+?bbjoin\s+(.*)/i,
  lock: "connected",
  category: "BBS",
  help: `+bbjoin <#>  — Subscribe to a BBS board.

Examples:
  +bbjoin 2    Subscribe to board 2.`,
  exec: async (u: IUrsamuSDK) => {
    const { board, error } = await findBoard((u.cmd.args[0] ?? "").trim());
    if (!board) { u.send(`%ch>BBS:%cn ${error}`); return; }
    if (!(await canRead(u, board))) { u.send("%ch>BBS:%cn Access denied."); return; }
    if (isMember(u, board.num)) { u.send(`%ch>BBS:%cn You are already subscribed to ${board.title}.`); return; }
    await setMembership(u, board.num, true);
    u.send(`%ch>BBS:%cn Subscribed to %cc${board.title}%cn.`);
  },
});

// ─── +bbleave ────────────────────────────────────────────────────────────────

addCmd({
  name: "+bbleave",
  pattern: /^\+?bbleave\s+(.*)/i,
  lock: "connected",
  category: "BBS",
  help: `+bbleave <#>  — Unsubscribe from a BBS board.

Examples:
  +bbleave 2    Unsubscribe from board 2.`,
  exec: async (u: IUrsamuSDK) => {
    const { board, error } = await findBoard((u.cmd.args[0] ?? "").trim());
    if (!board) { u.send(`%ch>BBS:%cn ${error}`); return; }
    await setMembership(u, board.num, false);
    u.send(`%ch>BBS:%cn Unsubscribed from %cc${board.title}%cn.`);
  },
});

// ─── +bbnotify ───────────────────────────────────────────────────────────────

addCmd({
  name: "+bbnotify",
  pattern: /^\+?bbnotify\s+(.+?)=(on|off)/i,
  lock: "connected",
  category: "BBS",
  help: `+bbnotify <#>=<on|off>  — Toggle new-post notifications for a board.

Examples:
  +bbnotify 2=on     Enable notifications for board 2.
  +bbnotify 2=off    Disable notifications for board 2.`,
  exec: async (u: IUrsamuSDK) => {
    const { board, error } = await findBoard((u.cmd.args[0] ?? "").trim());
    if (!board) { u.send(`%ch>BBS:%cn ${error}`); return; }
    const on = (u.cmd.args[1] ?? "").toLowerCase() === "on";
    await setNotify(u, board.num, on);
    u.send(`%ch>BBS:%cn Notifications for %cc${board.title}%cn %ch${on ? "enabled" : "disabled"}%cn.`);
  },
});

// ─── +bbwatch ────────────────────────────────────────────────────────────────

addCmd({
  name: "+bbwatch",
  pattern: /^\+?bbwatch\s+(.*)/i,
  lock: "connected",
  category: "BBS",
  help: `+bbwatch <#>/<post>  — Toggle reply-watch subscription on a post.

You will receive a notification when someone replies to watched posts.
Maximum ${WATCHER_CAP} watchers per post.

Examples:
  +bbwatch 2/3    Subscribe (or unsubscribe) to replies on board 2, post 3.`,
  exec: async (u: IUrsamuSDK) => {
    const arg = (u.cmd.args[0] ?? "").trim();
    const idx = arg.indexOf("/");
    if (idx === -1) { u.send("%ch>BBS:%cn Usage: +bbwatch <#>/<post>"); return; }

    const { board, error } = await findBoard(arg.slice(0, idx));
    if (!board) { u.send(`%ch>BBS:%cn ${error}`); return; }
    if (!(await canRead(u, board))) { u.send("%ch>BBS:%cn Access denied."); return; }

    const postNum = parseInt(arg.slice(idx + 1), 10);
    const post    = await getPost(board.num, postNum);
    if (!post) { u.send("%ch>BBS:%cn Post not found."); return; }

    const watchers = post.watchers ?? [];
    if (watchers.includes(u.me.id)) {
      // Unsubscribe
      await posts.modify({ id: post.id }, "$set", { watchers: watchers.filter((w) => w !== u.me.id) });
      u.send(`%ch>BBS:%cn You are no longer watching ${board.num}/${post.num}.`);
    } else {
      // Enforce cap at write time with slice — prevents TOCTOU from exceeding 50
      const updated = [...watchers, u.me.id].slice(0, WATCHER_CAP);
      if (!updated.includes(u.me.id)) { u.send(`%ch>BBS:%cn That post has reached the watcher limit (${WATCHER_CAP}).`); return; }
      await posts.modify({ id: post.id }, "$set", { watchers: updated });
      u.send(`%ch>BBS:%cn You are now watching ${board.num}/${post.num} for replies.`);
    }
  },
});

// ─── +bbsig ──────────────────────────────────────────────────────────────────

addCmd({
  name: "+bbsig",
  pattern: /^\+?bbsig\s*(.*)/i,
  lock: "connected",
  category: "BBS",
  help: `+bbsig [<text>]  — Set your BBS signature. No args clears it.

Your signature is automatically appended to all new posts and replies.

Examples:
  +bbsig -- Alice, Keeper of Lore    Set your signature.
  +bbsig                             Clear your signature.`,
  exec: async (u: IUrsamuSDK) => {
    const raw = u.util.stripSubs((u.cmd.args[0] ?? "").trim());
    if (!raw) {
      await clearSig(u);
      u.send("%ch>BBS:%cn Signature cleared.");
    } else {
      await setSig(u, raw);
      u.send(`%ch>BBS:%cn Signature set: ${raw}`);
    }
  },
});

// ─── +bbsearch ───────────────────────────────────────────────────────────────

addCmd({
  name: "+bbsearch",
  pattern: /^\+?bbsearch\s+(.*)/i,
  lock: "connected",
  category: "BBS",
  help: `+bbsearch <#>/<query>  — Search posts on a board.

Use tag:<name> to search by tag. Otherwise matches author name.

Examples:
  +bbsearch 2/Alice          Find posts by Alice on board 2.
  +bbsearch 2/tag:lore       Find posts tagged "lore" on board 2.`,
  exec: async (u: IUrsamuSDK) => {
    const arg    = (u.cmd.args[0] ?? "").trim();
    const idx    = arg.indexOf("/");
    if (idx === -1) { u.send("%ch>BBS:%cn Usage: +bbsearch <#>/<query>"); return; }

    const { board, error } = await findBoard(arg.slice(0, idx));
    if (!board) { u.send(`%ch>BBS:%cn ${error}`); return; }
    if (!(await canRead(u, board))) { u.send("%ch>BBS:%cn Access denied."); return; }

    const query  = u.util.stripSubs(arg.slice(idx + 1).trim()).toLowerCase();
    const bPosts = await getBoardPosts(board.num);
    let   found: typeof bPosts;

    if (query.startsWith("tag:")) {
      const tag = query.slice(4).trim();
      found = bPosts.filter((p) => (p.tags ?? []).includes(tag));
    } else {
      found = bPosts.filter((p) => (board.anonymous ? false : p.authorName.toLowerCase().includes(query)));
    }

    if (!found.length) { u.send(`%ch>BBS:%cn No posts matching "${query}" on ${board.title}.`); return; }

    const lines = [`%ch>BBS:%cn Results on %cc${board.title}%cn for "${query}":`];
    for (const p of found) {
      lines.push(`  ${board.num}/${p.num}  ${p.subject}  (${p.authorName}, ${bbDate(p.createdAt)})`);
    }
    u.send(lines.join("\n"));
  },
});

void getSig;
