/**
 * Myrddin-style BBS Commands for UrsaMU
 *
 * Ported from Evennia (dawnofetrusca/commands/bbs.py + typeclasses/bbs_manager.py).
 *
 * Player Commands:
 *   +bbread, +bbnew, +bbnext, +bbscan, +bbcatchup,
 *   +bbpost, +bb, +bbproof, +bbtoss, +bbreply,
 *   +bbremove, +bbmove, +bblist, +bbleave, +bbjoin,
 *   +bbnotify, +bbsearch, +bbsig, +bbedit
 *
 * Staff Commands:
 *   +bbnewgroup, +bbcleargroup, +bbconfirm, +bblock,
 *   +bbwritelock, +bbtimeout, +bbconfig
 */

import { addCmd } from "../../services/commands/cmdParser.ts";
import type { IUrsamuSDK } from "../../@types/UrsamuSDK.ts";
import { boards, posts, getNextBoardId, getNextPostId } from "./db.ts";
import type { IBoard, IPost, IReply } from "./db.ts";

// ===========================================================================
// Constants & Helpers
// ===========================================================================

const WIDTH = 77;
const EQ_LINE = "=".repeat(WIDTH);
const DASH_LINE = "-".repeat(WIDTH);

function isStaff(u: IUrsamuSDK): boolean {
  return (
    u.me.flags.has("superuser") ||
    u.me.flags.has("admin") ||
    u.me.flags.has("wizard")
  );
}

function header(title: string): string {
  const t = ` ${title} `;
  const pad = Math.floor((WIDTH - t.length) / 2);
  return "=".repeat(pad) + t + "=".repeat(WIDTH - pad - t.length);
}

function divider(): string {
  return "-".repeat(WIDTH);
}

function _footer(): string {
  return "=".repeat(WIDTH);
}

function formatDate(epoch: number): string {
  try {
    const d = new Date(epoch);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${mm}/${dd}/${d.getFullYear()}`;
  } catch {
    return "???";
  }
}

function _formatDateTime(epoch: number): string {
  try {
    const d = new Date(epoch);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${mm}/${dd}/${d.getFullYear()} ${hh}:${min}`;
  } catch {
    return "???";
  }
}

function bbDate(epoch: number): string {
  try {
    const d = new Date(epoch);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(-2);
    return `${mm}-${dd}-${yy}`;
  } catch {
    return "";
  }
}

function formatTimeFull(epoch: number): string {
  try {
    const d = new Date(epoch);
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${days[d.getDay()]} ${months[d.getMonth()]} ${String(d.getDate()).padStart(2, " ")} ${d.getFullYear()} ${hh}:${mm}:${ss}`;
  } catch {
    return "???";
  }
}

// ---------------------------------------------------------------------------
// Board lookup
// ---------------------------------------------------------------------------

async function getAllBoards(): Promise<IBoard[]> {
  const all = await boards.query({});
  return all.sort((a, b) => a.num - b.num);
}

async function findBoard(
  query: string,
): Promise<{ board: IBoard | null; error: string | null }> {
  query = query.trim();

  // Try numeric first
  const num = parseInt(query, 10);
  if (!isNaN(num)) {
    const found = await boards.queryOne({ num });
    if (found) return { board: found, error: null };
    return { board: null, error: "No board with that number." };
  }

  // Name matching
  const all = await getAllBoards();
  const lower = query.toLowerCase();

  // Exact match
  for (const b of all) {
    if (b.title.toLowerCase() === lower) return { board: b, error: null };
  }

  // Starts-with
  const startMatches = all.filter((b) =>
    b.title.toLowerCase().startsWith(lower)
  );
  if (startMatches.length === 1) return { board: startMatches[0], error: null };
  if (startMatches.length > 1) {
    const names = startMatches
      .map((b) => `${b.num}: ${b.title}`)
      .join(", ");
    return { board: null, error: `Ambiguous board name. Matches: ${names}` };
  }

  // Substring
  const subMatches = all.filter((b) =>
    b.title.toLowerCase().includes(lower)
  );
  if (subMatches.length === 1) return { board: subMatches[0], error: null };
  if (subMatches.length > 1) {
    const names = subMatches
      .map((b) => `${b.num}: ${b.title}`)
      .join(", ");
    return { board: null, error: `Ambiguous board name. Matches: ${names}` };
  }

  return { board: null, error: "No matching board found." };
}

// ---------------------------------------------------------------------------
// Post helpers
// ---------------------------------------------------------------------------

async function getBoardPosts(boardNum: number): Promise<IPost[]> {
  const all = await posts.query({ boardId: boardNum });
  return all.sort((a, b) => a.num - b.num);
}

async function getPost(
  boardNum: number,
  postNum: number,
): Promise<IPost | null> {
  return await posts.queryOne({ boardId: boardNum, num: postNum });
}

function getReply(post: IPost, replyNum: number): IReply | undefined {
  if (!post.replies || !Array.isArray(post.replies)) return undefined;
  return post.replies.find((r) => r.num === replyNum);
}

function getNextReplyNum(post: IPost): number {
  if (!post.replies || post.replies.length === 0) return 1;
  // Use max + 1 to avoid gaps. Even if a reply was deleted, new replies
  // get the next sequential number above the highest existing one.
  const maxNum = Math.max(...post.replies.map((r) => r.num));
  return maxNum + 1;
}

// Note: Reply numbering has a theoretical race condition if two users
// reply to the same post simultaneously. The DBO doesn't support
// transactions, so the second save could overwrite the first reply.
// In practice this is extremely rare on a MUSH. If it becomes an issue,
// the post should be re-read after save to verify the reply was persisted.

// ---------------------------------------------------------------------------
// Read tracking (stored on player: state.bb_read)
// ---------------------------------------------------------------------------

function getReadSet(
  u: IUrsamuSDK,
  boardNum: number,
): Set<string> {
  const bbRead = (u.me.state.bb_read as Record<string, string[]>) || {};
  const arr = bbRead[String(boardNum)] || [];
  return new Set(arr);
}

async function markRead(
  u: IUrsamuSDK,
  boardNum: number,
  msgKey: string,
): Promise<void> {
  const bbRead = (u.me.state.bb_read as Record<string, string[]>) || {};
  const arr = bbRead[String(boardNum)] || [];
  if (!arr.includes(msgKey)) {
    arr.push(msgKey);
  }
  bbRead[String(boardNum)] = arr;
  await u.db.modify(u.me.id, "$set", { "data.bb_read": bbRead });
}

async function markAllRead(
  u: IUrsamuSDK,
  boardNum: number,
): Promise<void> {
  const allKeys = await getAllMessageKeys(boardNum);
  const bbRead = (u.me.state.bb_read as Record<string, string[]>) || {};
  bbRead[String(boardNum)] = allKeys;
  await u.db.modify(u.me.id, "$set", { "data.bb_read": bbRead });
}

async function _markAllBoardsRead(u: IUrsamuSDK): Promise<void> {
  const allBoards = await getAllBoards();
  const bbRead = (u.me.state.bb_read as Record<string, string[]>) || {};
  for (const board of allBoards) {
    const allKeys = await getAllMessageKeys(board.num);
    bbRead[String(board.num)] = allKeys;
  }
  await u.db.modify(u.me.id, "$set", { "data.bb_read": bbRead });
}

async function getAllMessageKeys(boardNum: number): Promise<string[]> {
  const boardPosts = await getBoardPosts(boardNum);
  const keys: string[] = [];
  for (const post of boardPosts) {
    keys.push(String(post.num));
    for (const reply of (post.replies || []).sort((a, b) => a.num - b.num)) {
      keys.push(`${post.num}.${reply.num}`);
    }
  }
  return keys;
}

async function getUnreadKeys(
  u: IUrsamuSDK,
  boardNum: number,
): Promise<string[]> {
  const allKeys = await getAllMessageKeys(boardNum);
  const readSet = getReadSet(u, boardNum);
  return allKeys.filter((k) => !readSet.has(k));
}

async function getUnreadCount(
  u: IUrsamuSDK,
  boardNum: number,
): Promise<number> {
  return (await getUnreadKeys(u, boardNum)).length;
}

// ---------------------------------------------------------------------------
// Membership (stored on player: state.bb_membership)
// ---------------------------------------------------------------------------

function isMember(u: IUrsamuSDK, boardNum: number): boolean {
  const m = (u.me.state.bb_membership as Record<string, boolean>) || {};
  const val = m[String(boardNum)];
  return val === undefined ? true : val;
}

async function setMembership(
  u: IUrsamuSDK,
  boardNum: number,
  value: boolean,
): Promise<void> {
  const m = (u.me.state.bb_membership as Record<string, boolean>) || {};
  m[String(boardNum)] = value;
  await u.db.modify(u.me.id, "$set", { "data.bb_membership": m });
}

// ---------------------------------------------------------------------------
// Notifications (stored on player: state.bb_notify)
// ---------------------------------------------------------------------------

function _getNotify(u: IUrsamuSDK, boardNum: number): boolean {
  const n = (u.me.state.bb_notify as Record<string, boolean>) || {};
  const val = n[String(boardNum)];
  return val === undefined ? true : val;
}

async function setNotify(
  u: IUrsamuSDK,
  boardNum: number,
  value: boolean,
): Promise<void> {
  const n = (u.me.state.bb_notify as Record<string, boolean>) || {};
  n[String(boardNum)] = value;
  await u.db.modify(u.me.id, "$set", { "data.bb_notify": n });
}

// ---------------------------------------------------------------------------
// Draft (stored on player: state.bb_draft)
// ---------------------------------------------------------------------------

interface IDraft {
  boardNum: number;
  subject: string;
  body: string;
  replyToPost?: number;
  editingPost?: number;
}

function getDraft(u: IUrsamuSDK): IDraft | null {
  return (u.me.state.bb_draft as IDraft) || null;
}

async function setDraft(
  u: IUrsamuSDK,
  draft: IDraft,
): Promise<void> {
  await u.db.modify(u.me.id, "$set", { "data.bb_draft": draft });
}

async function clearDraft(u: IUrsamuSDK): Promise<void> {
  await u.db.modify(u.me.id, "$set", { "data.bb_draft": null });
}

// ---------------------------------------------------------------------------
// Signature (stored on player: state.bb_sig)
// ---------------------------------------------------------------------------

function getSig(u: IUrsamuSDK): string | null {
  const sig = u.me.state.bb_sig;
  if (typeof sig === "string" && sig.length > 0) return sig;
  return null;
}

async function setSig(u: IUrsamuSDK, sig: string): Promise<void> {
  await u.db.modify(u.me.id, "$set", { "data.bb_sig": sig });
}

async function clearSig(u: IUrsamuSDK): Promise<void> {
  await u.db.modify(u.me.id, "$set", { "data.bb_sig": null });
}

// ---------------------------------------------------------------------------
// Lock checks
// ---------------------------------------------------------------------------

function canRead(_u: IUrsamuSDK, board: IBoard): boolean {
  // For now, all() = everyone. Staff always passes.
  if (board.readLock === "all()") return true;
  if (isStaff(_u)) return true;
  return false;
}

function canWrite(_u: IUrsamuSDK, board: IBoard): boolean {
  if (board.writeLock === "all()") return true;
  if (isStaff(_u)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Post renumbering
// ---------------------------------------------------------------------------

// Renumber posts after deletion and migrate all players' read tracking keys.
async function renumberPosts(boardNum: number): Promise<void> {
  const boardPosts = await getBoardPosts(boardNum);
  if (boardPosts.length === 0) return;

  // Build old→new number mapping
  const numMap = new Map<number, number>();
  for (let i = 0; i < boardPosts.length; i++) {
    const newNum = i + 1;
    if (boardPosts[i].num !== newNum) {
      numMap.set(boardPosts[i].num, newNum);
      await posts.modify({ id: boardPosts[i].id }, "$set", { num: newNum });
    }
  }

  // If no numbers changed, nothing to migrate
  if (numMap.size === 0) return;

  // Migrate all players' read tracking for this board
  try {
    const { dbojs } = await import("../../services/Database/index.ts");
    const allPlayers = await dbojs.query({ flags: /player/ });
    for (const player of allPlayers) {
      const readData = (player.data?.bb_read as Record<string, string[]>) || {};
      const boardKey = String(boardNum);
      const oldKeys = readData[boardKey];
      if (!oldKeys || !Array.isArray(oldKeys) || oldKeys.length === 0) continue;

      const newKeys: string[] = [];
      for (const key of oldKeys) {
        if (key.includes(".")) {
          const [pStr, rStr] = key.split(".", 2);
          const oldP = parseInt(pStr, 10);
          const newP = numMap.get(oldP);
          newKeys.push(newP !== undefined ? `${newP}.${rStr}` : key);
        } else {
          const oldP = parseInt(key, 10);
          const newP = numMap.get(oldP);
          newKeys.push(newP !== undefined ? String(newP) : key);
        }
      }
      readData[boardKey] = newKeys;
      await dbojs.modify({ id: player.id }, "$set", { "data.bb_read": readData });
    }
  } catch {
    // Read tracking migration failure shouldn't block deletion
  }
}

// ---------------------------------------------------------------------------
// Format a post for reading
// ---------------------------------------------------------------------------

function formatPost(
  board: IBoard,
  post: IPost,
  reply?: IReply,
  msgKey?: string,
): string {
  const msg = reply || post;
  if (!msgKey) {
    msgKey = reply
      ? `${post.num}.${reply.num}`
      : String(post.num);
  }

  const author = board.anonymous ? "Anonymous" : msg.authorName;

  // Header: board title centered in = dividers
  const core = ` ${board.title} `;
  const totalPad = WIDTH - core.length;
  const leftPad = Math.ceil(totalPad / 2);
  const rightPad = totalPad - leftPad;
  const postHeader = "%cb" + "=".repeat(leftPad) + "%cg" + core + "%cb" + "=".repeat(rightPad) + "%cn";

  // Date and time
  const _dateStr = formatTimeFull(msg.createdAt);
  const timeStr = (() => {
    try {
      const d = new Date(msg.createdAt);
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      const ss = String(d.getSeconds()).padStart(2, "0");
      return `${hh}:${mm}:${ss}`;
    } catch {
      return "???";
    }
  })();

  // Line 2: Message / Author / Date
  const msgPart = `Message: ${board.num}/${msgKey}`;
  const authorPart = `Author: ${author}`;
  const datePart = bbDate(msg.createdAt);
  const remaining = WIDTH - msgPart.length - authorPart.length - datePart.length;
  const gap1 = Math.max(Math.floor(remaining / 2), 1);
  const gap2 = Math.max(remaining - gap1, 1);
  const infoLine =
    msgPart + " ".repeat(gap1) + authorPart + " ".repeat(gap2) + datePart;

  // Line 3: Subject + time
  let subject = msg.subject;
  if (msg.editCount) {
    subject += ` (edited x${msg.editCount})`;
  }
  const subjWidth = WIDTH - timeStr.length;
  const subjLine =
    "%cc" +
    subject +
    "%cn" +
    " ".repeat(Math.max(subjWidth - subject.length, 0)) +
    timeStr;

  const lines = [
    postHeader,
    infoLine,
    subjLine,
    "%cb" + DASH_LINE + "%cn",
    msg.body,
    "%cb" + EQ_LINE + "%cn",
  ];
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Parse helpers
// ---------------------------------------------------------------------------

function parseBoardPost(
  args: string,
): { boardStr: string; postStr: string } | null {
  if (!args.includes("/")) return null;
  const idx = args.indexOf("/");
  return {
    boardStr: args.slice(0, idx).trim(),
    postStr: args.slice(idx + 1).trim(),
  };
}

function parsePostSpec(
  spec: string,
  boardPosts: IPost[],
): number[] | "unread" | null {
  spec = spec.trim();
  if (spec.toLowerCase() === "u") return "unread";

  const postNums = new Set(boardPosts.map((p) => p.num));
  const nums: number[] = [];

  for (const part of spec.split(",")) {
    const trimmed = part.trim();
    if (trimmed.includes("-")) {
      const [startStr, endStr] = trimmed.split("-", 2);
      let start = parseInt(startStr, 10);
      let end = parseInt(endStr, 10);
      if (isNaN(start) || isNaN(end)) return null;
      if (start > end) { const tmp = start; start = end; end = tmp; }
      for (let i = start; i <= end; i++) {
        if (postNums.has(i)) nums.push(i);
      }
    } else {
      const n = parseInt(trimmed, 10);
      if (isNaN(n)) return null;
      if (postNums.has(n)) nums.push(n);
    }
  }
  return nums;
}

function resolveKey(
  boardPosts: IPost[],
  msgKey: string,
): { post: IPost | null; reply: IReply | undefined } {
  if (msgKey.includes(".")) {
    const [pnStr, rnStr] = msgKey.split(".", 2);
    const pn = parseInt(pnStr, 10);
    const rn = parseInt(rnStr, 10);
    const post = boardPosts.find((p) => p.num === pn) || null;
    if (!post) return { post: null, reply: undefined };
    const reply = (post.replies || []).find((r) => r.num === rn) || undefined;
    return { post, reply: reply ?? undefined };
  }
  const pn = parseInt(msgKey, 10);
  const post = boardPosts.find((p) => p.num === pn) || null;
  return { post, reply: undefined };
}

// ---------------------------------------------------------------------------
// BBS config (stored in boards collection as a special doc)
// ---------------------------------------------------------------------------

interface IBBConfig {
  id: string;
  timeout: number;
  autoTimeout: boolean;
}

async function getConfig(): Promise<IBBConfig> {
  const existing = await boards.queryOne({ id: "bbconfig" });
  if (existing) {
    return existing as unknown as IBBConfig;
  }
  return { id: "bbconfig", timeout: 0, autoTimeout: false };
}

async function setConfig(cfg: Partial<IBBConfig>): Promise<void> {
  const existing = await boards.queryOne({ id: "bbconfig" });
  if (existing) {
    await boards.modify({ id: "bbconfig" }, "$set", cfg);
  } else {
    await boards.create({
      id: "bbconfig",
      num: -1,
      title: "__config__",
      timeout: cfg.timeout ?? 0,
      anonymous: false,
      readLock: "all()",
      writeLock: "all()",
      pendingDelete: false,
    } as IBoard);
  }
}

// ---------------------------------------------------------------------------
// Post expiration cleanup
// ---------------------------------------------------------------------------

export async function cleanupExpiredPosts(): Promise<number> {
  const cfg = await getConfig();
  if (!cfg.autoTimeout) return 0;

  const now = Date.now();
  const allBoards = await getAllBoards();
  let removed = 0;

  for (const board of allBoards) {
    const boardTimeout = board.timeout || cfg.timeout;
    if (boardTimeout <= 0) continue;

    const boardPosts = await getBoardPosts(board.num);
    for (const post of boardPosts) {
      const postTimeout = post.timeout || boardTimeout;
      if (postTimeout <= 0) continue;

      const ageMs = now - post.createdAt;
      const timeoutMs = postTimeout * 24 * 60 * 60 * 1000;
      if (ageMs > timeoutMs) {
        await posts.delete({ id: post.id });
        removed++;
      }
    }

    if (removed > 0) {
      await renumberPosts(board.num);
    }
  }

  return removed;
}

// Run expiration check on startup and every 6 hours
(async () => {
  try {
    const removed = await cleanupExpiredPosts();
    if (removed > 0) console.log(`[bboards] Cleaned up ${removed} expired post(s).`);
  } catch { /* startup cleanup failure is non-fatal */ }

  setInterval(async () => {
    try {
      const removed = await cleanupExpiredPosts();
      if (removed > 0) console.log(`[bboards] Cleaned up ${removed} expired post(s).`);
    } catch { /* periodic cleanup failure is non-fatal */ }
  }, 6 * 60 * 60 * 1000);
})();

// ---------------------------------------------------------------------------
// Notification broadcast
// ---------------------------------------------------------------------------

function notifyBoard(
  u: IUrsamuSDK,
  _board: IBoard,
  message: string,
): void {
  // Broadcast to the room -- connected players will see it
  try {
    u.broadcast(message);
  } catch {
    // Silently fail if broadcast not available
  }
}

// ===========================================================================
// PLAYER COMMANDS
// ===========================================================================

// ─── +bbread ────────────────────────────────────────────────────────────────

addCmd({
  name: "+bbread",
  pattern: /^\+?bbread\s*(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    const args = (u.cmd.args[0] || "").trim();

    if (!args) {
      // Scan all boards
      await doBBScan(u);
      return;
    }

    const parsed = parseBoardPost(args);
    if (parsed) {
      await doReadPosts(u, parsed.boardStr, parsed.postStr);
    } else {
      await doListPosts(u, args);
    }
  },
});

async function doBBScan(u: IUrsamuSDK): Promise<void> {
  const allBoards = (await getAllBoards()).filter((b) => b.num >= 0);
  const visibleBoards = allBoards.filter((b) => canRead(u, b));

  if (!visibleBoards.length) {
    u.send("%ch>BBS:%cn No boards exist.");
    return;
  }

  const lines: string[] = ["%cb" + EQ_LINE + "%cn"];
  // Fixed positions: #(4) space flag(3) space title ... Last Post + Messages right-aligned
  const P = { num: 0, flag: 5, title: 9, lastpost: 51, msgs: 68 };

  const hdr = " ".repeat(WIDTH).split("");
  const placeHdr = (pos: number, text: string) => {
    for (let i = 0; i < text.length && pos + i < WIDTH; i++) hdr[pos + i] = text[i];
  };
  placeHdr(P.num, "   #");
  placeHdr(P.title + 1, "Group Name");
  // Right-align headers
  const lpHdr = "Last Post";
  const msHdr = "Messages";
  placeHdr(WIDTH - msHdr.length, msHdr);
  placeHdr(WIDTH - msHdr.length - 4 - lpHdr.length, lpHdr);
  lines.push(hdr.join(""));
  lines.push("%cb" + DASH_LINE + "%cn");

  for (const board of visibleBoards) {
    const boardPosts = await getBoardPosts(board.num);
    const total = boardPosts.length;

    let flag = "   ";
    if (board.readLock !== "all()") {
      flag = " * ";
    } else if (board.writeLock !== "all()") {
      flag = canWrite(u, board) ? "(-)" : " - ";
    }

    let dateStr = "";
    if (boardPosts.length > 0) {
      const latest = boardPosts.reduce((a, b) =>
        a.createdAt > b.createdAt ? a : b
      );
      dateStr = bbDate(latest.createdAt);
    }

    const numStr = String(board.num).padStart(4);
    const titleStr = board.title.padEnd(35).slice(0, 35);
    // Fixed positions for right columns
    const msPos = WIDTH - msHdr.length; // Messages starts here
    const lpPos = msPos - 4 - lpHdr.length; // Last Post starts here
    const _leftPart = `${numStr} ${flag}%cc${titleStr}%cn`;
    const _leftVisible = numStr.length + 1 + flag.length + titleStr.length;
    // Build right portion with fixed positions
    const row = " ".repeat(WIDTH).split("");
    // Place visible left content (extra space between flag and title)
    let pos = 0;
    for (const ch of `${numStr} ${flag} ${titleStr}`) {
      if (pos < WIDTH) row[pos++] = ch;
    }
    // Place date at lpPos
    for (let i = 0; i < dateStr.length && lpPos + i < WIDTH; i++) {
      row[lpPos + i] = dateStr[i];
    }
    // Place total right-aligned at end
    const totalStr = String(total);
    const tStart = WIDTH - totalStr.length;
    for (let i = 0; i < totalStr.length; i++) {
      row[tStart + i] = totalStr[i];
    }
    const plainRow = row.join("");
    // Re-insert color codes around the title
    const titleStart = numStr.length + 1 + flag.length + 1;
    const beforeTitle = plainRow.slice(0, titleStart);
    const titlePart = plainRow.slice(titleStart, titleStart + titleStr.length);
    const afterTitle = plainRow.slice(titleStart + titleStr.length);
    lines.push(`${beforeTitle}%cc${titlePart}%cn${afterTitle}`);
  }

  lines.push("%cb" + DASH_LINE + "%cn");
  lines.push(
    " '*' = restricted     '-' = read only     '(-)' = read only, but you can write",
  );
  lines.push("%cb" + EQ_LINE + "%cn");
  u.send(lines.join("\n"));
}

async function doListPosts(u: IUrsamuSDK, boardStr: string): Promise<void> {
  const { board, error } = await findBoard(boardStr);
  if (!board) {
    u.send(`%ch>BBS:%cn ${error}`);
    return;
  }
  if (!canRead(u, board)) {
    u.send("%ch>BBS:%cn You don't have access to that board.");
    return;
  }

  const boardPosts = await getBoardPosts(board.num);

  const titleStr = `**** ${board.title} ****`;
  const centered = titleStr.padStart(
    Math.floor((WIDTH + titleStr.length) / 2),
  ).padEnd(WIDTH);

  const lines: string[] = ["%cb" + EQ_LINE + "%cn"];
  lines.push("%cg" + centered + "%cn");
  lines.push(
    "     " + "Message".padEnd(45) + "Posted".padEnd(13) + "By",
  );
  lines.push("%cb" + DASH_LINE + "%cn");

  for (const post of boardPosts) {
    const author = board.anonymous ? "Anonymous" : post.authorName;
    const msgNum = `${board.num}/${post.num}`;
    const dateStr = bbDate(post.createdAt);
    const subj = post.subject.slice(0, 42);
    lines.push(
      "%cc" + msgNum.padEnd(5) + "%cn" +
        subj.padEnd(45) +
        dateStr.padEnd(13) +
        author,
    );

    // Show replies with tree connectors
    const sortedReplies = [...(post.replies || [])].sort(
      (a, b) => a.num - b.num,
    );
    for (let i = 0; i < sortedReplies.length; i++) {
      const reply = sortedReplies[i];
      const isLast = i === sortedReplies.length - 1;
      const connector = isLast ? "`" : "|";
      const replyKey = `${board.num}/${post.num}.${reply.num}`;
      const rAuthor = board.anonymous ? "Anonymous" : reply.authorName;
      const rSubj = reply.subject.slice(0, 38);
      const rDate = bbDate(reply.createdAt);
      lines.push(
        `  ${connector}  %cc${replyKey.padEnd(5)}%cn` +
          rSubj.padEnd(41) +
          rDate.padEnd(13) +
          rAuthor,
      );
    }
  }

  lines.push("%cb" + EQ_LINE + "%cn");
  u.send(lines.join("\n"));
}

async function doReadPosts(
  u: IUrsamuSDK,
  boardStr: string,
  postSpec: string,
): Promise<void> {
  const { board, error } = await findBoard(boardStr);
  if (!board) {
    u.send(`%ch>BBS:%cn ${error}`);
    return;
  }
  if (!canRead(u, board)) {
    u.send("%ch>BBS:%cn You don't have access to that board.");
    return;
  }

  // Handle * suffix: read post and all its threaded replies
  if (postSpec.trimEnd().endsWith("*")) {
    let base = postSpec.trimEnd().slice(0, -1).trim();
    if (base.includes(".")) {
      base = base.split(".", 1)[0];
    }
    const postNum = parseInt(base, 10);
    if (isNaN(postNum)) {
      u.send("%ch>BBS:%cn Invalid post number.");
      return;
    }
    const post = await getPost(board.num, postNum);
    if (!post) {
      u.send("%ch>BBS:%cn Post not found.");
      return;
    }
    const output: string[] = [formatPost(board, post)];
    await markRead(u, board.num, String(postNum));
    const sortedReplies = [...(post.replies || [])].sort(
      (a, b) => a.num - b.num,
    );
    for (const reply of sortedReplies) {
      const rk = `${postNum}.${reply.num}`;
      output.push(formatPost(board, post, reply, rk));
      await markRead(u, board.num, rk);
    }
    u.send(output.join("\n\n"));
    return;
  }

  // Handle dotted number: read a specific reply
  if (postSpec.trim().includes(".") && !postSpec.includes(",") && !postSpec.includes("-")) {
    const parts = postSpec.trim().split(".", 2);
    const postNum = parseInt(parts[0], 10);
    const replyNum = parseInt(parts[1], 10);
    if (isNaN(postNum) || isNaN(replyNum)) {
      u.send("%ch>BBS:%cn Invalid message number.");
      return;
    }
    const post = await getPost(board.num, postNum);
    if (!post) {
      u.send("%ch>BBS:%cn Post not found.");
      return;
    }
    const reply = getReply(post, replyNum);
    if (!reply) {
      u.send("%ch>BBS:%cn Reply not found.");
      return;
    }
    const msgKey = `${postNum}.${replyNum}`;
    await markRead(u, board.num, msgKey);
    u.send(formatPost(board, post, reply, msgKey));
    return;
  }

  // Handle 'u' for unread
  const boardPosts = await getBoardPosts(board.num);
  const spec = parsePostSpec(postSpec, boardPosts);

  if (spec === "unread") {
    const unreadKeys = await getUnreadKeys(u, board.num);
    if (!unreadKeys.length) {
      u.send(`%ch>BBS:%cn No unread messages on ${board.title}.`);
      return;
    }
    const output: string[] = [];
    for (const key of unreadKeys) {
      const { post, reply } = resolveKey(boardPosts, key);
      if (post) {
        output.push(formatPost(board, post, reply, key));
        await markRead(u, board.num, key);
      }
    }
    if (output.length) {
      u.send(output.join("\n\n"));
    } else {
      u.send("%ch>BBS:%cn No matching messages found.");
    }
    return;
  }

  if (spec === null || spec.length === 0) {
    u.send("%ch>BBS:%cn Invalid post specification.");
    return;
  }

  // Regular post numbers
  const output: string[] = [];
  for (const pn of spec) {
    const post = await getPost(board.num, pn);
    if (!post) continue;
    output.push(formatPost(board, post));
    await markRead(u, board.num, String(pn));
  }

  if (output.length) {
    u.send(output.join("\n\n"));
  } else {
    u.send("%ch>BBS:%cn No matching posts found.");
  }
}

// ─── +bbnew ─────────────────────────────────────────────────────────────────

addCmd({
  name: "+bbnew",
  pattern: /^\+?bbnew\s+(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    const args = (u.cmd.args[0] || "").trim();
    if (!args) {
      u.send("%ch>BBS:%cn Usage: +bbnew <#>  (Use +bbscan for an overview.)");
      return;
    }

    const { board, error } = await findBoard(args);
    if (!board) {
      u.send(`%ch>BBS:%cn ${error}`);
      return;
    }
    if (!canRead(u, board)) {
      u.send("%ch>BBS:%cn You don't have access to that board.");
      return;
    }

    const unreadKeys = await getUnreadKeys(u, board.num);
    if (!unreadKeys.length) {
      u.send(`%ch>BBS:%cn No unread messages on ${board.title}.`);
      return;
    }

    const boardPosts = await getBoardPosts(board.num);
    const lines: string[] = [header(`Unread on ${board.title} (#${board.num})`)];
    lines.push(
      " " + "#".padEnd(6) + "Subject".padEnd(35) + "Author".padEnd(16) + "Date",
    );
    lines.push(divider());

    for (const key of unreadKeys) {
      const { post, reply } = resolveKey(boardPosts, key);
      if (!post) continue;
      const msg = reply || post;
      const author = board.anonymous ? "Anonymous" : msg.authorName;
      lines.push(
        " " +
          key.padEnd(6) +
          msg.subject.slice(0, 33).padEnd(35) +
          author.slice(0, 14).padEnd(16) +
          bbDate(msg.createdAt),
      );
    }

    lines.push(divider());
    lines.push(` ${unreadKeys.length} unread message(s).`);
    u.send(lines.join("\n"));
  },
});

// ─── +bbnext ────────────────────────────────────────────────────────────────

addCmd({
  name: "+bbnext",
  pattern: /^\+?bbnext\s*(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    const args = (u.cmd.args[0] || "").trim();

    if (args) {
      // Next unread on a specific board
      const { board, error } = await findBoard(args);
      if (!board) {
        u.send(`%ch>BBS:%cn ${error}`);
        return;
      }
      if (!canRead(u, board)) {
        u.send("%ch>BBS:%cn You don't have access to that board.");
        return;
      }
      const unreadKeys = await getUnreadKeys(u, board.num);
      if (!unreadKeys.length) {
        u.send(`%ch>BBS:%cn No unread messages on ${board.title}.`);
        return;
      }
      const boardPosts = await getBoardPosts(board.num);
      const { post, reply } = resolveKey(boardPosts, unreadKeys[0]);
      if (!post) {
        u.send("%ch>BBS:%cn No unread messages.");
        return;
      }
      const msgKey = reply
        ? `${post.num}.${reply.num}`
        : String(post.num);
      await markRead(u, board.num, msgKey);
      u.send(formatPost(board, post, reply, msgKey));
      return;
    }

    // Next unread across all boards
    const allBoards = (await getAllBoards()).filter((b) => b.num >= 0);
    for (const board of allBoards) {
      if (!isMember(u, board.num)) continue;
      if (!canRead(u, board)) continue;
      const unreadKeys = await getUnreadKeys(u, board.num);
      if (!unreadKeys.length) continue;

      const boardPosts = await getBoardPosts(board.num);
      const { post, reply } = resolveKey(boardPosts, unreadKeys[0]);
      if (!post) continue;

      const msgKey = reply
        ? `${post.num}.${reply.num}`
        : String(post.num);
      await markRead(u, board.num, msgKey);
      u.send(formatPost(board, post, reply, msgKey));
      return;
    }

    u.send("%ch>BBS:%cn No unread messages.");
  },
});

// ─── +bbscan ────────────────────────────────────────────────────────────────

addCmd({
  name: "+bbscan",
  pattern: /^\+?bbscan\s*$/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    const allBoards = (await getAllBoards()).filter((b) => b.num >= 0);
    let hasUnread = false;
    const unreadLines: string[] = [];

    for (const board of allBoards) {
      if (!canRead(u, board)) continue;
      if (!isMember(u, board.num)) continue;
      const unreadKeys = await getUnreadKeys(u, board.num);
      if (unreadKeys.length) {
        hasUnread = true;
        const keyList = unreadKeys.join(", ");
        unreadLines.push(
          `%cc${board.title}%cn (#${board.num}): ${unreadKeys.length} unread (${keyList})`,
        );
      }
    }

    if (!hasUnread) {
      u.send(
        "%ccBBS%cg:%cn There are no unread postings on the Global Bulletin Board.\n" +
          "%ccBBS%cg:%cn %cgHINT:%cn You can reply directly to a BB posting with " +
          "+bbreply (eg. '+bbreply 1/3')",
      );
      return;
    }

    const title = " Unread Postings on the Global Bulletin Board ";
    const totalPad = WIDTH - title.length;
    const leftPad = Math.floor(totalPad / 2);
    const rightPad = totalPad - leftPad;
    const topBorder =
      "%cb" + "-".repeat(leftPad) + "%cg" + title + "%cb" + "-".repeat(rightPad) + "%cn";

    const lines: string[] = [topBorder];
    lines.push(...unreadLines);
    lines.push("%cb" + "-".repeat(WIDTH) + "%cn");
    lines.push(
      "%ccBBS%cg:%cn %cgHINT:%cn You can reply directly to a BB posting with " +
        "+bbreply (eg. '+bbreply 1/3')",
    );
    u.send(lines.join("\n"));
  },
});

// ─── +bbcatchup ─────────────────────────────────────────────────────────────

addCmd({
  name: "+bbcatchup",
  pattern: /^\+?bbcatchup\s+(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    const args = (u.cmd.args[0] || "").trim();

    if (!args) {
      u.send("%ch>BBS:%cn Usage: +bbcatchup <#> or +bbcatchup all");
      return;
    }

    if (args.toLowerCase() === "all") {
      // Only catch up boards the user can read
      const allBoards = await boards.find({});
      for (const b of allBoards) {
        if (canRead(u, b) && isMember(u, b.num)) {
          await markAllRead(u, b.num);
        }
      }
      u.send("%ch>BBS:%cn All accessible boards marked as read.");
      return;
    }

    // Support multiple board identifiers separated by spaces or commas
    const parts = args
      .replace(/,/g, " ")
      .split(/\s+/)
      .filter((p) => p.length > 0);
    const caught: string[] = [];

    for (const part of parts) {
      const { board, error } = await findBoard(part);
      if (!board) {
        u.send(`%ch>BBS:%cn ${error}`);
        continue;
      }
      if (!canRead(u, board)) {
        u.send(`%ch>BBS:%cn You don't have access to ${board.title}.`);
        continue;
      }
      await markAllRead(u, board.num);
      caught.push(`${board.num} (${board.title})`);
    }

    if (caught.length) {
      u.send("%ch>BBS:%cn Marked as read: " + caught.join(", ") + ".");
    }
  },
});

// ─── +bbpost ────────────────────────────────────────────────────────────────

addCmd({
  name: "+bbpost",
  pattern: /^\+?bbpost\s*(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    const args = (u.cmd.args[0] || "").trim();

    // No args = submit draft
    if (!args) {
      await submitDraft(u);
      return;
    }

    const parsed = parseBoardPost(args);
    if (!parsed) {
      u.send("%ch>BBS:%cn Usage: +bbpost <#>/<subject>[=<body>]");
      return;
    }

    const { board, error } = await findBoard(parsed.boardStr);
    if (!board) {
      u.send(`%ch>BBS:%cn ${error}`);
      return;
    }
    if (!canWrite(u, board)) {
      u.send("%ch>BBS:%cn You don't have permission to post to that board.");
      return;
    }

    const rest = parsed.postStr;

    // Check for quick post: subject=body
    if (rest.includes("=")) {
      const eqIdx = rest.indexOf("=");
      const subject = rest.slice(0, eqIdx).trim();
      let body = rest.slice(eqIdx + 1).trim();
      if (!subject || !body) {
        u.send("%ch>BBS:%cn Usage: +bbpost <#>/<subject>=<body>");
        return;
      }

      // Append signature if set
      const sig = getSig(u);
      if (sig) {
        body = body + "\n-- \n" + sig;
      }

      const globalId = await getNextPostId();
      const boardPosts = await getBoardPosts(board.num);
      const postNum = boardPosts.length > 0
        ? Math.max(...boardPosts.map((p) => p.num)) + 1
        : 1;

      const newPost: IPost = {
        id: `bbpost-${globalId}`,
        boardId: board.num,
        num: postNum,
        globalId,
        subject,
        body,
        authorId: u.me.id,
        authorName: u.me.name || "Unknown",
        createdAt: Date.now(),
        timeout: 0,
        editCount: 0,
        replies: [],
      };

      await posts.create(newPost);
      await markRead(u, board.num, String(postNum));
      u.send(
        `%ch>BBS:%cn %cgPost #${postNum} created on ${board.title}.%cn`,
      );
      await notifyBoard(
        u,
        board,
        `%ch>BBS:%cn New post on %ch${board.title}%cn (#${board.num}/${postNum}): %ch${subject}%cn by ${newPost.authorName}`,
      );
      return;
    }

    // Start a draft
    const subject = rest.trim();
    if (!subject) {
      u.send("%ch>BBS:%cn Usage: +bbpost <#>/<subject>");
      return;
    }

    await setDraft(u, {
      boardNum: board.num,
      subject,
      body: "",
    });
    u.send(
      `%ch>BBS:%cn Draft started for board ${board.num} (${board.title}).\n` +
        ` Subject: %ch${subject}%cn\n` +
        ` Use %ch+bb <text>%cn to add text (required before posting).\n` +
        ` Use %ch+bbproof%cn to preview, %ch+bbpost%cn to submit.`,
    );
  },
});

async function submitDraft(u: IUrsamuSDK): Promise<void> {
  const draft = getDraft(u);
  if (!draft) {
    u.send(
      "%ch>BBS:%cn No draft in progress. Use +bbpost <#>/<subject> to start one.",
    );
    return;
  }

  const { board } = await findBoard(String(draft.boardNum));
  if (!board) {
    u.send("%ch>BBS:%cn The target board no longer exists.");
    await clearDraft(u);
    return;
  }

  if (!draft.body || !draft.body.trim()) {
    u.send(
      "%ch>BBS:%cn Draft body is empty. Use %ch+bb <text>%cn to add text.",
    );
    return;
  }

  let body = draft.body;

  // Append signature if not editing
  if (!draft.editingPost) {
    const sig = getSig(u);
    if (sig) {
      body = body + "\n-- \n" + sig;
    }
  }

  // Check if this is an edit draft
  if (draft.editingPost) {
    const post = await getPost(board.num, draft.editingPost);
    if (!post) {
      u.send(
        "%ch>BBS:%cn Failed to save edits. The original post may have been removed.",
      );
      return;
    }
    await posts.modify({ id: post.id }, "$set", {
      subject: draft.subject,
      body,
      editCount: post.editCount + 1,
    });
    await clearDraft(u);
    u.send(
      `%ch>BBS:%cn %cgPost #${draft.editingPost} on ${board.title} updated.%cn`,
    );
    return;
  }

  // Check if this is a reply draft
  if (draft.replyToPost) {
    const post = await getPost(board.num, draft.replyToPost);
    if (!post) {
      u.send(
        "%ch>BBS:%cn Failed to submit reply. Original post may have been removed.",
      );
      return;
    }

    const replyNum = getNextReplyNum(post);
    const newReply: IReply = {
      num: replyNum,
      subject: draft.subject,
      body,
      authorId: u.me.id,
      authorName: u.me.name || "Unknown",
      createdAt: Date.now(),
      editCount: 0,
    };

    const updatedReplies = [...post.replies, newReply];
    await posts.modify({ id: post.id }, "$set", { replies: updatedReplies });
    const replyKey = `${post.num}.${replyNum}`;
    await clearDraft(u);
    await markRead(u, board.num, replyKey);
    u.send(
      `%ch>BBS:%cn %cgReply ${replyKey} submitted to ${board.title}.%cn`,
    );
    await notifyBoard(
      u,
      board,
      `%ch>BBS:%cn New reply on %ch${board.title}%cn (#${board.num}/${replyKey}): %ch${newReply.subject}%cn by ${newReply.authorName}`,
    );
    return;
  }

  // Normal post
  const globalId = await getNextPostId();
  const boardPosts = await getBoardPosts(board.num);
  const postNum = boardPosts.length > 0
    ? Math.max(...boardPosts.map((p) => p.num)) + 1
    : 1;

  const newPost: IPost = {
    id: `bbpost-${globalId}`,
    boardId: board.num,
    num: postNum,
    globalId,
    subject: draft.subject,
    body,
    authorId: u.me.id,
    authorName: u.me.name || "Unknown",
    createdAt: Date.now(),
    timeout: 0,
    editCount: 0,
    replies: [],
  };

  await posts.create(newPost);
  await clearDraft(u);
  await markRead(u, board.num, String(postNum));
  u.send(
    `%ch>BBS:%cn %cgPost #${postNum} submitted to ${board.title}.%cn`,
  );
  await notifyBoard(
    u,
    board,
    `%ch>BBS:%cn New post on %ch${board.title}%cn (#${board.num}/${postNum}): %ch${draft.subject}%cn by ${newPost.authorName}`,
  );
}

// ─── +bb (append to draft) ──────────────────────────────────────────────────

addCmd({
  name: "+bb",
  pattern: /^\+bb(?![a-z])\s+(.+)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    const args = (u.cmd.args[0] || "").trim();
    if (!args) {
      u.send("%ch>BBS:%cn Usage: +bb <text>");
      return;
    }

    const draft = getDraft(u);
    if (!draft) {
      u.send(
        "%ch>BBS:%cn No draft in progress. Use +bbpost <#>/<subject> to start one.",
      );
      return;
    }

    // Edit drafts replace the body; new/reply drafts append
    if (draft.editingPost) {
      draft.body = args;
      await setDraft(u, draft);
      u.send("%ch>BBS:%cn Draft body replaced.");
    } else {
      if (draft.body) {
        draft.body += "\n" + args;
      } else {
        draft.body = args;
      }
      await setDraft(u, draft);
      u.send("%ch>BBS:%cn Text appended to draft.");
    }
  },
});

// ─── +bbproof ───────────────────────────────────────────────────────────────

addCmd({
  name: "+bbproof",
  pattern: /^\+?bbproof\s*$/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    const draft = getDraft(u);
    if (!draft) {
      u.send("%ch>BBS:%cn No draft in progress.");
      return;
    }

    const { board } = await findBoard(String(draft.boardNum));
    const boardName = board ? board.title : "Unknown";

    const lines: string[] = [header("Draft Preview")];
    lines.push(` %chBoard:%cn   ${boardName}`);
    if (draft.editingPost) {
      lines.push(` %chEditing:%cn Post #${draft.editingPost}`);
    }
    if (draft.replyToPost) {
      lines.push(` %chReply to:%cn Post #${draft.replyToPost}`);
    }
    lines.push(` %chSubject:%cn ${draft.subject}`);
    lines.push(divider());
    lines.push(draft.body || "(empty)");
    lines.push(divider());
    u.send(lines.join("\n"));
  },
});

// ─── +bbtoss ────────────────────────────────────────────────────────────────

addCmd({
  name: "+bbtoss",
  pattern: /^\+?bbtoss\s*$/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    const draft = getDraft(u);
    if (!draft) {
      u.send("%ch>BBS:%cn No draft in progress.");
      return;
    }
    await clearDraft(u);
    u.send("%ch>BBS:%cn Draft discarded.");
  },
});

// ─── +bbreply ───────────────────────────────────────────────────────────────

addCmd({
  name: "+bbreply",
  pattern: /^\+?bbreply\s+(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    const args = (u.cmd.args[0] || "").trim();
    if (!args) {
      u.send("%ch>BBS:%cn Usage: +bbreply <#>/<#>[=<text>]");
      return;
    }

    // Split on = for quick reply vs draft reply
    let lhs = args;
    let rhs: string | null = null;
    if (args.includes("=")) {
      const eqIdx = args.indexOf("=");
      lhs = args.slice(0, eqIdx).trim();
      rhs = args.slice(eqIdx + 1).trim();
    }

    const parsed = parseBoardPost(lhs);
    if (!parsed) {
      u.send("%ch>BBS:%cn Usage: +bbreply <#>/<#>[=<text>]");
      return;
    }

    const { board, error } = await findBoard(parsed.boardStr);
    if (!board) {
      u.send(`%ch>BBS:%cn ${error}`);
      return;
    }
    if (!canWrite(u, board)) {
      u.send(
        "%ch>BBS:%cn You don't have permission to post to that board.",
      );
      return;
    }

    // Parse post/reply number - replying to 1.3 creates reply under post 1
    let postNumStr = parsed.postStr;
    if (postNumStr.includes(".")) {
      postNumStr = postNumStr.split(".", 1)[0];
    }
    const postNum = parseInt(postNumStr, 10);
    if (isNaN(postNum)) {
      u.send("%ch>BBS:%cn Invalid post number.");
      return;
    }

    const original = await getPost(board.num, postNum);
    if (!original) {
      u.send("%ch>BBS:%cn Post not found.");
      return;
    }

    // Subject is always "Re: <root subject>" (single Re: prefix)
    const origSubj = original.subject;
    const subject = origSubj.toLowerCase().startsWith("re: ")
      ? origSubj
      : `Re: ${origSubj}`;

    // Draft mode: +bbreply <#>/<#> (no = sign)
    if (rhs === null) {
      await setDraft(u, {
        boardNum: board.num,
        subject,
        body: "",
        replyToPost: postNum,
      });
      u.send(
        `%ch>BBS:%cn Reply draft started for ${board.title}.\n` +
          ` Subject: %ch${subject}%cn\n` +
          ` Use %ch+bb <text>%cn to add text, %ch+bbproof%cn to preview, %ch+bbpost%cn to submit.`,
      );
      return;
    }

    // Quick reply: +bbreply <#>/<#>=<text>
    if (!rhs) {
      u.send("%ch>BBS:%cn Reply text cannot be empty.");
      return;
    }

    let body = rhs;
    const sig = getSig(u);
    if (sig) {
      body = body + "\n-- \n" + sig;
    }

    const replyNum = getNextReplyNum(original);
    const newReply: IReply = {
      num: replyNum,
      subject,
      body,
      authorId: u.me.id,
      authorName: u.me.name || "Unknown",
      createdAt: Date.now(),
      editCount: 0,
    };

    const updatedReplies = [...original.replies, newReply];
    await posts.modify({ id: original.id }, "$set", {
      replies: updatedReplies,
    });
    const replyKey = `${postNum}.${replyNum}`;
    await markRead(u, board.num, replyKey);
    u.send(
      `%ch>BBS:%cn %cgReply ${replyKey} posted to ${board.title}.%cn`,
    );
    await notifyBoard(
      u,
      board,
      `%ch>BBS:%cn New reply on %ch${board.title}%cn (#${board.num}/${replyKey}): %ch${subject}%cn by ${newReply.authorName}`,
    );
  },
});

// ─── +bbremove ──────────────────────────────────────────────────────────────

addCmd({
  name: "+bbremove",
  pattern: /^\+?bbremove\s+(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    const args = (u.cmd.args[0] || "").trim();
    const parsed = parseBoardPost(args);
    if (!parsed) {
      u.send("%ch>BBS:%cn Usage: +bbremove <#>/<post list>");
      return;
    }

    const { board, error } = await findBoard(parsed.boardStr);
    if (!board) {
      u.send(`%ch>BBS:%cn ${error}`);
      return;
    }

    const staff = isStaff(u);
    const postSpec = parsed.postStr;

    // Handle dotted number (single reply removal)
    if (postSpec.trim().includes(".") && !postSpec.includes(",") && !postSpec.includes("-")) {
      const parts = postSpec.trim().split(".", 2);
      const postNum = parseInt(parts[0], 10);
      const replyNum = parseInt(parts[1], 10);
      if (isNaN(postNum) || isNaN(replyNum)) {
        u.send("%ch>BBS:%cn Invalid message number.");
        return;
      }
      const post = await getPost(board.num, postNum);
      if (!post) {
        u.send("%ch>BBS:%cn Post not found.");
        return;
      }
      const reply = getReply(post, replyNum);
      if (!reply) {
        u.send("%ch>BBS:%cn Reply not found.");
        return;
      }
      if (reply.authorId !== u.me.id && !staff) {
        u.send("%ch>BBS:%cn You can only remove your own replies.");
        return;
      }
      const updatedReplies = post.replies.filter((r) => r.num !== replyNum);
      await posts.modify({ id: post.id }, "$set", {
        replies: updatedReplies,
      });
      u.send(
        `%ch>BBS:%cn %cgReply ${postNum}.${replyNum} removed from ${board.title}.%cn`,
      );
      return;
    }

    // Parse post spec
    const boardPosts = await getBoardPosts(board.num);
    const spec = parsePostSpec(postSpec, boardPosts);
    if (spec === null || spec === "unread" || spec.length === 0) {
      u.send("%ch>BBS:%cn Invalid post specification.");
      return;
    }

    let removed = 0;
    for (const pn of spec) {
      const post = await getPost(board.num, pn);
      if (!post) continue;
      if (post.authorId !== u.me.id && !staff) {
        u.send(
          `%ch>BBS:%cn You can only remove your own posts (post #${pn} skipped).`,
        );
        continue;
      }
      await posts.delete({ id: post.id });
      removed++;
    }

    if (removed) {
      await renumberPosts(board.num);
      u.send(
        `%ch>BBS:%cn %cg${removed} post(s) removed from ${board.title}.%cn`,
      );
    } else {
      u.send("%ch>BBS:%cn No posts removed.");
    }
  },
});

// ─── +bbmove ────────────────────────────────────────────────────────────────

addCmd({
  name: "+bbmove",
  pattern: /^\+?bbmove\s+(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    const args = (u.cmd.args[0] || "").trim();

    // Find " to " (case-insensitive)
    const toIdx = args.toLowerCase().lastIndexOf(" to ");
    if (toIdx === -1) {
      u.send("%ch>BBS:%cn Usage: +bbmove <board>/<post> to <board>");
      return;
    }

    const source = args.slice(0, toIdx).trim();
    const destStr = args.slice(toIdx + 4).trim();

    const parsed = parseBoardPost(source);
    if (!parsed) {
      u.send("%ch>BBS:%cn Usage: +bbmove <board>/<post> to <board>");
      return;
    }

    const { board: fromBoard, error: fromErr } = await findBoard(
      parsed.boardStr,
    );
    if (!fromBoard) {
      u.send(`%ch>BBS:%cn Source: ${fromErr}`);
      return;
    }

    const { board: toBoard, error: toErr } = await findBoard(destStr);
    if (!toBoard) {
      u.send(`%ch>BBS:%cn Destination: ${toErr}`);
      return;
    }

    const postNum = parseInt(parsed.postStr, 10);
    if (isNaN(postNum)) {
      u.send("%ch>BBS:%cn Invalid post number.");
      return;
    }

    const post = await getPost(fromBoard.num, postNum);
    if (!post) {
      u.send("%ch>BBS:%cn Post not found.");
      return;
    }

    if (post.authorId !== u.me.id && !isStaff(u)) {
      u.send("%ch>BBS:%cn You can only move your own posts.");
      return;
    }

    // Calculate new post number on destination board
    const destPosts = await getBoardPosts(toBoard.num);
    const newNum = destPosts.length > 0
      ? Math.max(...destPosts.map((p) => p.num)) + 1
      : 1;

    // Update post to new board
    await posts.modify({ id: post.id }, "$set", {
      boardId: toBoard.num,
      num: newNum,
    });

    // Renumber source board
    await renumberPosts(fromBoard.num);

    u.send(
      `%ch>BBS:%cn %cgPost moved from ${fromBoard.title} to ${toBoard.title} as post #${newNum}.%cn`,
    );
  },
});

// ─── +bblist ────────────────────────────────────────────────────────────────

addCmd({
  name: "+bblist",
  pattern: /^\+?bblist\s*$/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    const allBoards = (await getAllBoards()).filter((b) => b.num >= 0);
    const visibleBoards = allBoards.filter((b) => canRead(u, b));

    if (!visibleBoards.length) {
      u.send("%ch>BBS:%cn No boards exist.");
      return;
    }

    const lines: string[] = [header("Board List")];
    lines.push(
      " " +
        "#".padEnd(5) +
        "Name".padEnd(30) +
        "Posts".padEnd(7) +
        "Unread".padEnd(8) +
        "Member".padEnd(8) +
        "R-Lock".padEnd(10) +
        "W-Lock",
    );
    lines.push(divider());

    for (const board of visibleBoards) {
      const boardPosts = await getBoardPosts(board.num);
      const total = boardPosts.length;
      const unread = await getUnreadCount(u, board.num);
      const member = isMember(u, board.num) ? "Yes" : "No";
      const rLock = board.readLock || "all()";
      const wLock = board.writeLock || "all()";
      lines.push(
        " " +
          String(board.num).padEnd(5) +
          board.title.slice(0, 28).padEnd(30) +
          String(total).padEnd(7) +
          String(unread).padEnd(8) +
          member.padEnd(8) +
          rLock.slice(0, 9).padEnd(10) +
          wLock.slice(0, 9),
      );
    }

    lines.push(divider());
    lines.push(` ${visibleBoards.length} board(s).`);
    u.send(lines.join("\n"));
  },
});

// ─── +bbleave ───────────────────────────────────────────────────────────────

addCmd({
  name: "+bbleave",
  pattern: /^\+?bbleave\s+(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    const args = (u.cmd.args[0] || "").trim();
    if (!args) {
      u.send("%ch>BBS:%cn Usage: +bbleave <#>");
      return;
    }

    const { board, error } = await findBoard(args);
    if (!board) {
      u.send(`%ch>BBS:%cn ${error}`);
      return;
    }

    await setMembership(u, board.num, false);
    u.send(`%ch>BBS:%cn You have left ${board.title}.`);
  },
});

// ─── +bbjoin ────────────────────────────────────────────────────────────────

addCmd({
  name: "+bbjoin",
  pattern: /^\+?bbjoin\s+(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    const args = (u.cmd.args[0] || "").trim();
    if (!args) {
      u.send("%ch>BBS:%cn Usage: +bbjoin <#>");
      return;
    }

    const { board, error } = await findBoard(args);
    if (!board) {
      u.send(`%ch>BBS:%cn ${error}`);
      return;
    }
    if (!canRead(u, board)) {
      u.send("%ch>BBS:%cn You don't have access to that board.");
      return;
    }

    await setMembership(u, board.num, true);
    u.send(`%ch>BBS:%cn You have joined ${board.title}.`);
  },
});

// ─── +bbnotify ──────────────────────────────────────────────────────────────

addCmd({
  name: "+bbnotify",
  pattern: /^\+?bbnotify\s+(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    const args = (u.cmd.args[0] || "").trim();
    if (!args.includes("=")) {
      u.send("%ch>BBS:%cn Usage: +bbnotify <#>=<on|off>");
      return;
    }

    const eqIdx = args.indexOf("=");
    const boardStr = args.slice(0, eqIdx).trim();
    const valStr = args.slice(eqIdx + 1).trim().toLowerCase();

    const { board, error } = await findBoard(boardStr);
    if (!board) {
      u.send(`%ch>BBS:%cn ${error}`);
      return;
    }

    if (["on", "yes", "true", "1"].includes(valStr)) {
      await setNotify(u, board.num, true);
      u.send(`%ch>BBS:%cn Notifications ON for ${board.title}.`);
    } else if (["off", "no", "false", "0"].includes(valStr)) {
      await setNotify(u, board.num, false);
      u.send(`%ch>BBS:%cn Notifications OFF for ${board.title}.`);
    } else {
      u.send("%ch>BBS:%cn Use 'on' or 'off'.");
    }
  },
});

// ─── +bbsearch ──────────────────────────────────────────────────────────────

addCmd({
  name: "+bbsearch",
  pattern: /^\+?bbsearch\s+(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    const args = (u.cmd.args[0] || "").trim();
    const parsed = parseBoardPost(args);
    if (!parsed) {
      u.send("%ch>BBS:%cn Usage: +bbsearch <#>/<name>");
      return;
    }

    const { board, error } = await findBoard(parsed.boardStr);
    if (!board) {
      u.send(`%ch>BBS:%cn ${error}`);
      return;
    }
    if (!canRead(u, board)) {
      u.send("%ch>BBS:%cn You don't have access to that board.");
      return;
    }

    const name = parsed.postStr;
    const nameLower = name.toLowerCase();
    const boardPosts = await getBoardPosts(board.num);
    const matches = boardPosts.filter((p) =>
      p.authorName.toLowerCase().includes(nameLower)
    );

    if (!matches.length) {
      u.send(`%ch>BBS:%cn No posts by '${name}' on ${board.title}.`);
      return;
    }

    const lines: string[] = [
      header(`Posts by '${name}' on ${board.title}`),
    ];
    lines.push(
      " " + "#".padEnd(6) + "Subject".padEnd(35) + "Date".padEnd(12),
    );
    lines.push(divider());

    for (const post of matches) {
      lines.push(
        " " +
          String(post.num).padEnd(6) +
          post.subject.slice(0, 33).padEnd(35) +
          formatDate(post.createdAt),
      );
    }

    lines.push(divider());
    lines.push(` ${matches.length} post(s) found.`);
    u.send(lines.join("\n"));
  },
});

// ─── +bbsig ─────────────────────────────────────────────────────────────────

addCmd({
  name: "+bbsig",
  pattern: /^\+?bbsig\s*(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    const args = (u.cmd.args[0] || "").trim();

    if (args.toLowerCase() === "/clear") {
      await clearSig(u);
      u.send("%ch>BBS:%cn Signature cleared.");
      return;
    }

    if (!args) {
      const sig = getSig(u);
      if (sig) {
        u.send(`%ch>BBS:%cn Your signature:\n${sig}`);
      } else {
        u.send("%ch>BBS:%cn No signature set.");
      }
      return;
    }

    await setSig(u, args);
    u.send(`%ch>BBS:%cn Signature set to:\n${args}`);
  },
});

// ─── +bbedit ────────────────────────────────────────────────────────────────

addCmd({
  name: "+bbedit",
  pattern: /^\+?bbedit\s+(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    const args = (u.cmd.args[0] || "").trim();
    if (!args) {
      u.send(
        "%ch>BBS:%cn Usage: +bbedit text=old/new, +bbedit <#>/<#>=old/new, or +bbedit <#>/<#>",
      );
      return;
    }

    // No '=' means load-for-editing: +bbedit <#>/<#>
    if (!args.includes("=")) {
      const parsed = parseBoardPost(args);
      if (parsed) {
        await loadForEditing(u, parsed.boardStr, parsed.postStr);
      } else {
        u.send(
          "%ch>BBS:%cn Usage: +bbedit text=old/new, +bbedit <#>/<#>=old/new, or +bbedit <#>/<#>",
        );
      }
      return;
    }

    const eqIdx = args.indexOf("=");
    const lhs = args.slice(0, eqIdx).trim();
    const rhs = args.slice(eqIdx + 1).trim();

    // Draft edit: +bbedit text=old/new or +bbedit title=old/new
    if (lhs.toLowerCase() === "text" || lhs.toLowerCase() === "title") {
      await editDraft(u, lhs.toLowerCase(), rhs);
      return;
    }

    // Post edit: +bbedit <board>/<post>=old/new
    const parsed = parseBoardPost(lhs);
    if (parsed) {
      await editPost(u, parsed.boardStr, parsed.postStr, rhs);
      return;
    }

    u.send(
      "%ch>BBS:%cn Usage: +bbedit text=old/new or +bbedit <#>/<#>=old/new",
    );
  },
});

async function editDraft(
  u: IUrsamuSDK,
  field: string,
  replacement: string,
): Promise<void> {
  const draft = getDraft(u);
  if (!draft) {
    u.send("%ch>BBS:%cn No draft in progress.");
    return;
  }

  if (!replacement.includes("/")) {
    u.send("%ch>BBS:%cn Format: old/new");
    return;
  }

  const slashIdx = replacement.indexOf("/");
  const old = replacement.slice(0, slashIdx);
  const newText = replacement.slice(slashIdx + 1);

  if (field === "text") {
    if (!draft.body.includes(old)) {
      u.send("%ch>BBS:%cn Text not found in draft body.");
      return;
    }
    // replaceAll is intentional: BBS edit replaces every occurrence in the draft.
    draft.body = draft.body.replaceAll(old, newText);
    await setDraft(u, draft);
    u.send("%ch>BBS:%cn Draft body updated.");
  } else {
    if (!draft.subject.includes(old)) {
      u.send("%ch>BBS:%cn Text not found in draft subject.");
      return;
    }
    // replaceAll is intentional: BBS edit replaces every occurrence in the draft.
    draft.subject = draft.subject.replaceAll(old, newText);
    await setDraft(u, draft);
    u.send("%ch>BBS:%cn Draft subject updated.");
  }
}

async function editPost(
  u: IUrsamuSDK,
  boardStr: string,
  postStr: string,
  replacement: string,
): Promise<void> {
  const { board, error } = await findBoard(boardStr);
  if (!board) {
    u.send(`%ch>BBS:%cn ${error}`);
    return;
  }

  if (!replacement.includes("/")) {
    u.send("%ch>BBS:%cn Format: old/new");
    return;
  }

  const slashIdx = replacement.indexOf("/");
  const old = replacement.slice(0, slashIdx);
  const newText = replacement.slice(slashIdx + 1);

  // Handle dotted number (reply edit)
  if (postStr.includes(".")) {
    const parts = postStr.split(".", 2);
    const postNum = parseInt(parts[0], 10);
    const replyNum = parseInt(parts[1], 10);
    if (isNaN(postNum) || isNaN(replyNum)) {
      u.send("%ch>BBS:%cn Invalid message number.");
      return;
    }
    const post = await getPost(board.num, postNum);
    if (!post) {
      u.send("%ch>BBS:%cn Post not found.");
      return;
    }
    const reply = getReply(post, replyNum);
    if (!reply) {
      u.send("%ch>BBS:%cn Reply not found.");
      return;
    }
    if (reply.authorId !== u.me.id && !isStaff(u)) {
      u.send("%ch>BBS:%cn You can only edit your own replies.");
      return;
    }
    if (!reply.body.includes(old)) {
      u.send("%ch>BBS:%cn Text not found in reply body.");
      return;
    }
    reply.body = reply.body.replaceAll(old, newText);
    reply.editCount = (reply.editCount || 0) + 1;
    const updatedReplies = post.replies.map((r) =>
      r.num === replyNum ? reply : r
    );
    await posts.modify({ id: post.id }, "$set", {
      replies: updatedReplies,
    });
    u.send(
      `%ch>BBS:%cn Reply ${board.num}/${postNum}.${replyNum} updated.`,
    );
    return;
  }

  const postNum = parseInt(postStr, 10);
  if (isNaN(postNum)) {
    u.send("%ch>BBS:%cn Invalid post number.");
    return;
  }

  const post = await getPost(board.num, postNum);
  if (!post) {
    u.send("%ch>BBS:%cn Post not found.");
    return;
  }

  if (post.authorId !== u.me.id && !isStaff(u)) {
    u.send("%ch>BBS:%cn You can only edit your own posts.");
    return;
  }

  if (!post.body.includes(old)) {
    u.send("%ch>BBS:%cn Text not found in post body.");
    return;
  }

  await posts.modify({ id: post.id }, "$set", {
    body: post.body.replaceAll(old, newText),
    editCount: post.editCount + 1,
  });
  u.send(`%ch>BBS:%cn Post ${board.num}/${postNum} updated.`);
}

async function loadForEditing(
  u: IUrsamuSDK,
  boardStr: string,
  postStr: string,
): Promise<void> {
  // Check for existing draft
  if (getDraft(u)) {
    u.send(
      "%ch>BBS:%cn You already have a draft in progress. Use %ch+bbtoss%cn to discard it first.",
    );
    return;
  }

  const { board, error } = await findBoard(boardStr);
  if (!board) {
    u.send(`%ch>BBS:%cn ${error}`);
    return;
  }

  const postNum = parseInt(postStr, 10);
  if (isNaN(postNum)) {
    u.send("%ch>BBS:%cn Invalid post number.");
    return;
  }

  const post = await getPost(board.num, postNum);
  if (!post) {
    u.send("%ch>BBS:%cn Post not found.");
    return;
  }

  if (post.authorId !== u.me.id && !isStaff(u)) {
    u.send("%ch>BBS:%cn You can only edit your own posts.");
    return;
  }

  await setDraft(u, {
    boardNum: board.num,
    subject: post.subject,
    body: post.body,
    editingPost: postNum,
  });
  u.send(
    `%ch>BBS:%cn Post #${postNum} from %ch${board.title}%cn loaded for editing.\n` +
      ` Use %ch+bbedit text=old/new%cn or %ch+bbedit title=old/new%cn to edit,\n` +
      ` %ch+bbproof%cn to preview, %ch+bbpost%cn to save.`,
  );
}

// ===========================================================================
// STAFF COMMANDS
// ===========================================================================

// ─── +bbnewgroup ────────────────────────────────────────────────────────────

addCmd({
  name: "+bbnewgroup",
  pattern: /^\+?bbnewgroup\s+(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    if (!isStaff(u)) {
      u.send("%ch>BBS:%cn Permission denied.");
      return;
    }

    const args = (u.cmd.args[0] || "").trim();
    if (!args) {
      u.send("%ch>BBS:%cn Usage: +bbnewgroup <title>");
      return;
    }

    const boardNum = await getNextBoardId();
    const newBoard: IBoard = {
      id: `board-${boardNum}`,
      num: boardNum,
      title: args,
      timeout: 0,
      anonymous: false,
      readLock: "all()",
      writeLock: "all()",
      pendingDelete: false,
    };

    await boards.create(newBoard);
    u.send(
      `%ch>BBS:%cn %cgBoard #${boardNum} '${args}' created.%cn`,
    );
  },
});

// ─── +bbcleargroup ──────────────────────────────────────────────────────────

addCmd({
  name: "+bbcleargroup",
  pattern: /^\+?bbcleargroup\s+(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    if (!isStaff(u)) {
      u.send("%ch>BBS:%cn Permission denied.");
      return;
    }

    const args = (u.cmd.args[0] || "").trim();
    if (!args) {
      u.send("%ch>BBS:%cn Usage: +bbcleargroup <#>");
      return;
    }

    const { board, error } = await findBoard(args);
    if (!board) {
      u.send(`%ch>BBS:%cn ${error}`);
      return;
    }

    await boards.modify({ id: board.id }, "$set", { pendingDelete: true });
    u.send(
      `%ch>BBS:%cn Board #${board.num} '${board.title}' marked for deletion. Use %ch+bbconfirm ${board.num}%cn to confirm.`,
    );
  },
});

// ─── +bbconfirm ─────────────────────────────────────────────────────────────

addCmd({
  name: "+bbconfirm",
  pattern: /^\+?bbconfirm\s+(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    if (!isStaff(u)) {
      u.send("%ch>BBS:%cn Permission denied.");
      return;
    }

    const args = (u.cmd.args[0] || "").trim();
    if (!args) {
      u.send("%ch>BBS:%cn Usage: +bbconfirm <#>");
      return;
    }

    const { board, error } = await findBoard(args);
    if (!board) {
      u.send(`%ch>BBS:%cn ${error}`);
      return;
    }

    if (!board.pendingDelete) {
      u.send(
        `%ch>BBS:%cn Board #${board.num} is not marked for deletion. Use %ch+bbcleargroup ${board.num}%cn first.`,
      );
      return;
    }

    const title = board.title;

    // Warn connected players who have drafts on this board
    try {
      const { dbojs } = await import("../../services/Database/index.ts");
      const connected = await dbojs.query({ flags: /connected/ });
      for (const player of connected) {
        const draft = player.data?.bb_draft as Record<string, unknown> | undefined;
        if (draft && draft.boardNum === board.num) {
          await dbojs.modify({ id: player.id }, "$unset", { "data.bb_draft": 1 });
          const { send } = await import("../../services/broadcast/index.ts");
          send([player.id], `%ch>BBS:%cn Board '${title}' was deleted. Your draft has been discarded.`);
        }
      }
    } catch { /* draft cleanup failure shouldn't block deletion */ }

    // Delete all posts on this board
    const boardPosts = await getBoardPosts(board.num);
    for (const post of boardPosts) {
      await posts.delete({ id: post.id });
    }

    // Delete the board
    await boards.delete({ id: board.id });
    u.send(`%ch>BBS:%cn %cgBoard '${title}' permanently deleted.%cn`);
  },
});

// ─── +bblock ────────────────────────────────────────────────────────────────

addCmd({
  name: "+bblock",
  pattern: /^\+?bblock\s+(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    if (!isStaff(u)) {
      u.send("%ch>BBS:%cn Permission denied.");
      return;
    }

    const args = (u.cmd.args[0] || "").trim();
    if (!args.includes("=")) {
      u.send("%ch>BBS:%cn Usage: +bblock <#>=<lock>");
      return;
    }

    const eqIdx = args.indexOf("=");
    const boardStr = args.slice(0, eqIdx).trim();
    const lockStr = args.slice(eqIdx + 1).trim();

    const { board, error } = await findBoard(boardStr);
    if (!board) {
      u.send(`%ch>BBS:%cn ${error}`);
      return;
    }

    if (!lockStr) {
      u.send("%ch>BBS:%cn Lock cannot be empty. Use 'all()' for no restriction.");
      return;
    }
    await boards.modify({ id: board.id }, "$set", { readLock: lockStr });
    u.send(
      `%ch>BBS:%cn Read lock on '${board.title}' set to: ${lockStr}`,
    );
  },
});

// ─── +bbwritelock ───────────────────────────────────────────────────────────

addCmd({
  name: "+bbwritelock",
  pattern: /^\+?bbwritelock\s+(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    if (!isStaff(u)) {
      u.send("%ch>BBS:%cn Permission denied.");
      return;
    }

    const args = (u.cmd.args[0] || "").trim();
    if (!args.includes("=")) {
      u.send("%ch>BBS:%cn Usage: +bbwritelock <#>=<lock>");
      return;
    }

    const eqIdx = args.indexOf("=");
    const boardStr = args.slice(0, eqIdx).trim();
    const lockStr = args.slice(eqIdx + 1).trim();

    const { board, error } = await findBoard(boardStr);
    if (!board) {
      u.send(`%ch>BBS:%cn ${error}`);
      return;
    }

    if (!lockStr) {
      u.send("%ch>BBS:%cn Lock cannot be empty. Use 'all()' for no restriction.");
      return;
    }
    await boards.modify({ id: board.id }, "$set", { writeLock: lockStr });
    u.send(
      `%ch>BBS:%cn Write lock on '${board.title}' set to: ${lockStr}`,
    );
  },
});

// ─── +bbtimeout ─────────────────────────────────────────────────────────────

addCmd({
  name: "+bbtimeout",
  pattern: /^\+?bbtimeout\s+(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    if (!isStaff(u)) {
      u.send("%ch>BBS:%cn Permission denied.");
      return;
    }

    const args = (u.cmd.args[0] || "").trim();
    if (!args.includes("=")) {
      u.send("%ch>BBS:%cn Usage: +bbtimeout <#>/<#>=<days>");
      return;
    }

    const eqIdx = args.indexOf("=");
    const lhs = args.slice(0, eqIdx).trim();
    const rhs = args.slice(eqIdx + 1).trim();

    const parsed = parseBoardPost(lhs);
    if (!parsed) {
      u.send("%ch>BBS:%cn Usage: +bbtimeout <#>/<#>=<days>");
      return;
    }

    const { board, error } = await findBoard(parsed.boardStr);
    if (!board) {
      u.send(`%ch>BBS:%cn ${error}`);
      return;
    }

    const postNum = parseInt(parsed.postStr, 10);
    const days = parseInt(rhs, 10);
    if (isNaN(postNum) || isNaN(days) || days < 0) {
      u.send("%ch>BBS:%cn Post number must be an integer and days must be 0 or greater.");
      return;
    }

    const post = await getPost(board.num, postNum);
    if (!post) {
      u.send("%ch>BBS:%cn Post not found.");
      return;
    }

    await posts.modify({ id: post.id }, "$set", { timeout: days });

    if (days > 0) {
      u.send(
        `%ch>BBS:%cn Post ${board.num}/${postNum} will expire in ${days} day(s).`,
      );
    } else {
      u.send(
        `%ch>BBS:%cn Post ${board.num}/${postNum} timeout cleared.`,
      );
    }
  },
});

// ─── +bbconfig ──────────────────────────────────────────────────────────────

addCmd({
  name: "+bbconfig",
  pattern: /^\+?bbconfig\s*(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    if (!isStaff(u)) {
      u.send("%ch>BBS:%cn Permission denied.");
      return;
    }

    const args = (u.cmd.args[0] || "").trim();

    if (!args) {
      // Show config
      const cfg = await getConfig();
      const allBoards = (await getAllBoards()).filter((b) => b.num >= 0);

      const lines: string[] = [header("BBS Configuration")];
      lines.push(` %chGlobal timeout:%cn  ${cfg.timeout} day(s)`);
      lines.push(
        ` %chAuto-timeout:%cn   ${cfg.autoTimeout ? "ON" : "OFF"}`,
      );
      lines.push("");
      lines.push(
        " " +
          "#".padEnd(5) +
          "Board".padEnd(28) +
          "Timeout".padEnd(10) +
          "Anonymous".padEnd(10) +
          "R-Lock".padEnd(12) +
          "W-Lock",
      );
      lines.push(divider());

      for (const board of allBoards) {
        lines.push(
          " " +
            String(board.num).padEnd(5) +
            board.title.slice(0, 26).padEnd(28) +
            String(board.timeout || 0).padEnd(10) +
            (board.anonymous ? "Yes" : "No").padEnd(10) +
            (board.readLock || "all()").slice(0, 11).padEnd(12) +
            (board.writeLock || "all()").slice(0, 11),
        );
      }

      lines.push(divider());
      u.send(lines.join("\n"));
      return;
    }

    if (!args.includes("=")) {
      u.send("%ch>BBS:%cn Usage: +bbconfig <setting>=<value>");
      return;
    }

    const eqIdx = args.indexOf("=");
    const lhs = args.slice(0, eqIdx).trim();
    const rhs = args.slice(eqIdx + 1).trim();

    // Global config
    if (lhs.toLowerCase() === "timeout") {
      const days = parseInt(rhs, 10);
      if (isNaN(days)) {
        u.send("%ch>BBS:%cn Timeout must be an integer (days).");
        return;
      }
      await setConfig({ timeout: days });
      u.send(`%ch>BBS:%cn Global timeout set to ${days} day(s).`);
      return;
    }

    if (lhs.toLowerCase() === "autotimeout") {
      const val = ["on", "yes", "true", "1"].includes(rhs.toLowerCase());
      await setConfig({ autoTimeout: val });
      u.send(`%ch>BBS:%cn Auto-timeout set to ${val ? "ON" : "OFF"}.`);
      return;
    }

    // Per-board config: <#>/timeout or <#>/anonymous
    const parsed = parseBoardPost(lhs);
    if (!parsed) {
      u.send("%ch>BBS:%cn Usage: +bbconfig <setting>=<value>");
      return;
    }

    const { board, error } = await findBoard(parsed.boardStr);
    if (!board) {
      u.send(`%ch>BBS:%cn ${error}`);
      return;
    }

    const setting = parsed.postStr.toLowerCase();

    if (setting === "timeout") {
      const days = parseInt(rhs, 10);
      if (isNaN(days)) {
        u.send("%ch>BBS:%cn Timeout must be an integer (days).");
        return;
      }
      await boards.modify({ id: board.id }, "$set", { timeout: days });
      u.send(
        `%ch>BBS:%cn Timeout for '${board.title}' set to ${days} day(s).`,
      );
    } else if (setting === "anonymous") {
      const val = ["on", "yes", "true", "1"].includes(rhs.toLowerCase());
      await boards.modify({ id: board.id }, "$set", { anonymous: val });
      u.send(
        `%ch>BBS:%cn Anonymous mode for '${board.title}' set to ${val ? "ON" : "OFF"}.`,
      );
    } else {
      u.send(
        "%ch>BBS:%cn Unknown setting. Use 'timeout' or 'anonymous'.",
      );
    }
  },
});

// ---------------------------------------------------------------------------
// +bbhelp
// ---------------------------------------------------------------------------

const BBHELP_TOPICS: Record<string, string> = {
  "": [
    "                    Commands for the BBS System",
    "-----------------------------------------------------------------------------",
    "     This BBS was inspired by Myrddin's BBS for MUSHes.",
    "     To see help on a particular topic, type '+bbhelp <topic>'",
    "     (Example: +bbhelp bbread).",
    "",
    "     TOPIC                 DESCRIPTION",
    "     ~~~~~                 ~~~~~~~~~~~",
    "     bbread                Reading bulletin board messages.",
    "     bbpost                Posting bulletin board messages.",
    "     bbmisc                Other commands (removing messages, unsubscribing",
    "                             groups, resubscribing to groups, etc)",
    "",
    "     bbtimeout             Expanded help on the topic of message timeouts.",
    "=============================================================================",
  ].join("\n"),
  "bbread": [
    "                   Commands for the BBS System:",
    "-----------------------------------------------------------------------------",
    "     +bbread                         Scans joined bulletin board groups.",
    "     +bbread <#>                     Scans messages in group <#>.",
    "     +bbread <#>/<list>              Reads message(s). <list> can be a single",
    "                                        number, multiple numbers, or a range",
    "                                        of numbers (ie. 1-6), or any combo.",
    "     +bbread <#>/<msg>*              Reads <msg> and all replies, if any.",
    "     +bbread <#>/u                   Reads all unread messages in group <#>.",
    "",
    "     +bbcatchup <#>                  Marks all messages in group <#> as read.",
    "                                        You can use multiple group #'s/names",
    "                                        or may use the word 'all' to catchup",
    "                                        on all messages on all boards.",
    "",
    "     +bbnew <#>                      Lists unread messages in group <#>",
    "",
    "     +bbnext                         Reads the 'next' unread message.",
    "     +bbnext <#>                     Reads the 'next' unread message in group",
    "                                        <#>.",
    "",
    "     +bbscan        Totals unread postings (if any) in each joined group.",
    "",
    "Note: You can use the board's name (or abbreviation) in place of its number.",
    "-----------------------------------------------------------------------------",
    "See also: +bbhelp bbpost, +bbhelp bbmisc",
    "=============================================================================",
  ].join("\n"),
  "bbpost": [
    "                   Commands for the BBS System",
    "-----------------------------------------------------------------------------",
    "     +bbpost <#>/<title>             This starts a post to group <#>.",
    "     +bbwrite <text>                 This adds text to an already started post.",
    "     +bb <text>                      Same as +bbwrite.",
    "     +bbedit <area>=<old>/<new>      Edits your post in progress. Valid areas",
    "                                       are: text, title",
    "     +bbproof                        Displays your current post in progress.",
    "     +bbtoss                         Discards your current post in progress.",
    "     +bbpost                         This will post your current post in",
    "                                       progress.",
    "",
    "     +bbreply <#>/<#>                Start a threaded reply to post <#>/<#>",
    "                                        Use normal authoring commands above to",
    "                                        write, proofread, edit, post.",
    "",
    "     +bbpost <#>/<subject>=<body>    Posts a message to group <#>. This is a",
    "                                       quick way of posting a message with",
    "                                       one command.",
    "     +bbreply <#>/<#>=<body>         Posts a threaded reply to <#>/<#> with a",
    "                                       single command.",
    "",
    "     +bbedit <#>/<#>=<old>/<new>     Edits one of your posted messages.",
    "",
    "-----------------------------------------------------------------------------",
    "See also: +bbhelp bbread, +bbhelp bbmisc",
    "=============================================================================",
  ].join("\n"),
  "bbmisc": [
    "                   Commands for the BBS System",
    "-----------------------------------------------------------------------------",
    "     +bbremove <#>/<list>            Removes a message by you. <list> can be a",
    "                                       single number, a group of numbers, or a",
    "                                       range (10-14).",
    "     +bbmove <#>/<#> to <#>          Moves one of your messages to a new group.",
    "     +bbleave <#>                    Unsubscribe from group <#>.",
    "     +bbjoin <#>                     Joins a group you've previously 'left'.",
    "     +bblist                         Listing of all groups available to you",
    "                                       along with their timeout values.",
    "     +bbsearch <#>/<name>            Shows you a list of <name>'s postings on",
    "                                       group <#>.",
    "     +bbnotify <#>=<on|off>          Turn post notification for group <#> on",
    "                                       or off.",
    "     +bbsig [text]                   Set your BBS signature.",
    "     +bbsig /clear                   Clear your BBS signature.",
    "",
    "     Staff only:",
    "     +bbnewgroup <title>             Create a new bulletin board.",
    "     +bbcleargroup <#>               Mark a board for deletion.",
    "     +bbconfirm <#>                  Confirm board deletion.",
    "     +bblock <#>=<lock>              Set read lock on a board.",
    "     +bbwritelock <#>=<lock>         Set write lock on a board.",
    "     +bbtimeout <#>/<#>=<days>       Changes timeout for a message to <days>.",
    "     +bbconfig                       View/set BBS configuration.",
    "",
    "-----------------------------------------------------------------------------",
    "See also: +bbhelp bbread, +bbhelp bbpost",
    "=============================================================================",
  ].join("\n"),
  "bbtimeout": [
    "                   BBS Timeout System",
    "-----------------------------------------------------------------------------",
    "     The BBS supports automatic expiration of old posts.",
    "",
    "     Each board can have a default timeout (in days). Posts on that board",
    "     will be automatically removed after that many days. A timeout of 0",
    "     means posts never expire.",
    "",
    "     Individual posts can also have their own timeout, which overrides",
    "     the board default.",
    "",
    "     Staff commands:",
    "     +bbconfig timeout=<days>        Set global default timeout.",
    "     +bbconfig <#>/timeout=<days>    Set board-specific timeout.",
    "     +bbtimeout <#>/<#>=<days>       Set timeout for a specific post.",
    "     +bbconfig autotimeout=on|off    Enable/disable auto-cleanup.",
    "",
    "     A timeout of 0 means no expiration.",
    "=============================================================================",
  ].join("\n"),
};

addCmd({
  name: "+bbhelp",
  pattern: /^\+bbhelp\s*(.*)/i,
  lock: "connected",
  exec: (u: IUrsamuSDK) => {
    const topic = (u.cmd.args[0] || "").trim().toLowerCase().replace(/^\+/, "");
    const text = BBHELP_TOPICS[topic];
    if (!text) {
      u.send(`%ch>BBS:%cn Unknown help topic '${topic}'. Type +bbhelp for a list of topics.`);
      return;
    }
    u.send(text);
  },
});
