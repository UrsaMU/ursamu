import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { getAllBoards, findBoard, getBoardPosts, getPost, parseBoardPost, parsePostSpec, resolveKey } from "../query.ts";
import { canRead } from "../permissions.ts";
import { getReadSet, markRead, markAllRead, markAllBoardsRead, getUnreadKeys, getUnreadCount, isMember } from "../tracking.ts";
import { bbDate, formatPost, EQ_LINE, DASH_LINE, WIDTH } from "../display.ts";

// ─── +bbread ─────────────────────────────────────────────────────────────────

addCmd({
  name: "+bbread",
  pattern: /^\+?bbread\s*(.*)/i,
  lock: "connected",
  category: "BBS",
  help: `+bbread [<#>[/<posts>]]  — Read BBS boards or posts.

No args: show board index grouped by category.
<#>: list posts on board.
<#>/<N>: read post N.  <#>/<N>*: read post and all replies.
<#>/<N.R>: read reply R on post N.  <#>/u: read unread.
<#>/1-5: read a range.

Examples:
  +bbread             Show all boards.
  +bbread 2           List posts on board 2.
  +bbread 2/3         Read post 3 on board 2.
  +bbread 2/3*        Read post 3 and all its replies.
  +bbread 2/u         Read all unread on board 2.`,
  exec: async (u: IUrsamuSDK) => {
    const args = (u.cmd.args[0] ?? "").trim();
    if (!args) { await doBBList(u); return; }
    const parsed = parseBoardPost(args);
    if (parsed) {
      await doReadPosts(u, parsed.boardStr, parsed.postStr);
    } else {
      await doListPosts(u, args);
    }
  },
});

async function doBBList(u: IUrsamuSDK): Promise<void> {
  const allBoards = await getAllBoards();
  const visible: typeof allBoards = [];
  for (const b of allBoards) {
    if (await canRead(u, b)) visible.push(b);
  }
  if (!visible.length) { u.send("%ch>BBS:%cn No accessible boards."); return; }

  // Group by category
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
      const bPosts  = await getBoardPosts(board.num);
      const unread  = await getUnreadCount(u, board.num);
      const total   = bPosts.length;
      const last    = bPosts.length ? bbDate(Math.max(...bPosts.map((p) => p.createdAt))) : "";
      const modMark = (board.moderators ?? []).includes(u.me.id) ? "[M]" : "   ";
      const num     = String(board.num).padStart(4);
      const title   = board.title.padEnd(35).slice(0, 35);
      const unreadStr = unread > 0 ? `%ch%cy${unread}%cn` : "0";
      lines.push(`${num} ${modMark} %cc${title}%cn  ${last.padEnd(10)} ${String(total).padStart(4)}  (${unreadStr} new)`);
    }
  }
  lines.push("%cb" + DASH_LINE + "%cn");
  lines.push(" '*' = restricted  '-' = read-only  [M] = you are moderator");
  lines.push("%cb" + EQ_LINE + "%cn");
  u.send(lines.join("\n"));
}

async function doListPosts(u: IUrsamuSDK, boardStr: string): Promise<void> {
  const { board, error } = await findBoard(boardStr);
  if (!board) { u.send(`%ch>BBS:%cn ${error}`); return; }
  if (!(await canRead(u, board))) { u.send("%ch>BBS:%cn You don't have access to that board."); return; }

  const bPosts = await getBoardPosts(board.num);
  const lines  = ["%cb" + EQ_LINE + "%cn", `%cg  **** ${board.title} ****%cn`, "     " + "Message".padEnd(45) + "Posted".padEnd(13) + "By", "%cb" + DASH_LINE + "%cn"];
  for (const post of bPosts) {
    const author  = board.anonymous ? "Anonymous" : post.authorName;
    const subj    = (post.sticky ? "[S] " : "") + post.subject.slice(0, 40);
    const msgNum  = `${board.num}/${post.num}`;
    lines.push(`%cc${msgNum.padEnd(6)}%cn${subj.padEnd(43)}${bbDate(post.createdAt).padEnd(13)}${author}`);
    for (let i = 0; i < (post.replies ?? []).length; i++) {
      const r      = post.replies[i];
      const isLast = i === post.replies.length - 1;
      const conn   = isLast ? "`" : "|";
      lines.push(`  ${conn}  %cc${board.num}/${post.num}.${r.num}%cn  ${r.subject.slice(0, 38).padEnd(38)}  ${bbDate(r.createdAt).padEnd(13)}${board.anonymous ? "Anonymous" : r.authorName}`);
    }
  }
  lines.push("%cb" + EQ_LINE + "%cn");
  u.send(lines.join("\n"));
}

async function doReadPosts(u: IUrsamuSDK, boardStr: string, postSpec: string): Promise<void> {
  const { board, error } = await findBoard(boardStr);
  if (!board) { u.send(`%ch>BBS:%cn ${error}`); return; }
  if (!(await canRead(u, board))) { u.send("%ch>BBS:%cn You don't have access to that board."); return; }

  const bPosts = await getBoardPosts(board.num);

  // Thread mode: 3*
  if (postSpec.trimEnd().endsWith("*")) {
    const base    = postSpec.trimEnd().slice(0, -1).replace(/\.\d+$/, "").trim();
    const postNum = parseInt(base, 10);
    if (isNaN(postNum)) { u.send("%ch>BBS:%cn Invalid post number."); return; }
    const post = await getPost(board.num, postNum);
    if (!post) { u.send("%ch>BBS:%cn Post not found."); return; }
    const output = [formatPost(board, post)];
    await markRead(u, board.num, String(postNum));
    for (const reply of (post.replies ?? []).sort((a, b) => a.num - b.num)) {
      const rk = `${postNum}.${reply.num}`;
      output.push(formatPost(board, post, reply, rk));
      await markRead(u, board.num, rk);
    }
    u.send(output.join("\n\n"));
    return;
  }

  // Unread mode
  if (postSpec.trim().toLowerCase() === "u") {
    const unread = await getUnreadKeys(u, board.num);
    if (!unread.length) { u.send(`%ch>BBS:%cn No unread messages on ${board.title}.`); return; }
    const output: string[] = [];
    for (const key of unread) {
      const { post, reply } = resolveKey(bPosts, key);
      if (!post) continue;
      output.push(formatPost(board, post, reply, key));
      await markRead(u, board.num, key);
    }
    u.send(output.join("\n\n"));
    return;
  }

  // Reply: 3.2
  if (postSpec.includes(".") && !postSpec.includes(",") && !postSpec.includes("-")) {
    const [pStr, rStr] = postSpec.split(".", 2);
    const post  = await getPost(board.num, parseInt(pStr, 10));
    const reply = post ? (post.replies ?? []).find((r) => r.num === parseInt(rStr, 10)) : undefined;
    if (!post || !reply) { u.send("%ch>BBS:%cn Message not found."); return; }
    const key = `${post.num}.${reply.num}`;
    u.send(formatPost(board, post, reply, key));
    await markRead(u, board.num, key);
    return;
  }

  // Range or list
  const nums = parsePostSpec(postSpec, bPosts);
  if (!nums || nums === "unread" || nums.length === 0) { u.send("%ch>BBS:%cn No matching posts."); return; }
  const output: string[] = [];
  for (const n of nums) {
    const post = bPosts.find((p) => p.num === n);
    if (!post) continue;
    output.push(formatPost(board, post));
    await markRead(u, board.num, String(n));
  }
  u.send(output.join("\n\n"));
}

// ─── +bbnext ─────────────────────────────────────────────────────────────────

addCmd({
  name: "+bbnext",
  pattern: /^\+?bbnext(?:\s+(\S+))?/i,
  lock: "connected",
  category: "BBS",
  help: `+bbnext [<#>]  — Read your next unread BBS message.

Reads the next unread message across all joined boards, or on a specific board.

Examples:
  +bbnext      Read next unread across all boards.
  +bbnext 2    Read next unread on board 2.`,
  exec: async (u: IUrsamuSDK) => {
    const boardStr = (u.cmd.args[0] ?? "").trim();
    const allBoards = await getAllBoards();
    const toCheck   = boardStr
      ? [(await findBoard(boardStr)).board].filter(Boolean)
      : allBoards;

    for (const board of toCheck) {
      if (!board || !(await canRead(u, board)) || !isMember(u, board.num)) continue;
      const unread = await getUnreadKeys(u, board.num);
      if (!unread.length) continue;
      const bPosts  = await getBoardPosts(board.num);
      const key     = unread[0];
      const { post, reply } = resolveKey(bPosts, key);
      if (!post) continue;
      u.send(formatPost(board, post, reply, key));
      await markRead(u, board.num, key);
      return;
    }
    u.send("%ch>BBS:%cn No unread messages.");
  },
});

// ─── +bbcatchup ──────────────────────────────────────────────────────────────

addCmd({
  name: "+bbcatchup",
  pattern: /^\+?bbcatchup(?:\s+(.+))?/i,
  lock: "connected",
  category: "BBS",
  help: `+bbcatchup [<#>|all]  — Mark board(s) as fully read.

Examples:
  +bbcatchup 2    Mark board 2 as read.
  +bbcatchup all  Mark all boards as read.`,
  exec: async (u: IUrsamuSDK) => {
    const arg = (u.cmd.args[0] ?? "").trim().toLowerCase();
    if (!arg || arg === "all") {
      await markAllBoardsRead(u);
      u.send("%ch>BBS:%cn All boards marked as read.");
      return;
    }
    const { board, error } = await findBoard(arg);
    if (!board) { u.send(`%ch>BBS:%cn ${error}`); return; }
    if (!(await canRead(u, board))) { u.send("%ch>BBS:%cn Access denied."); return; }
    await markAllRead(u, board.num);
    u.send(`%ch>BBS:%cn ${board.title} marked as read.`);
  },
});

// Suppress unused import warning
void getReadSet;
void WIDTH;
