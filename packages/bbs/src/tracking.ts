import type { IUrsamuSDK } from "@ursamu/mush";
import { boards } from "./db.ts";
import type { IBBConfig, IDraft } from "./db.ts";
import { getBoardPosts } from "./query.ts";

// ---------------------------------------------------------------------------
// Read tracking  (player state: bb_read)
// ---------------------------------------------------------------------------

export function getReadSet(u: IUrsamuSDK, boardNum: number): Set<string> {
  const bbRead = (u.me.state.bb_read as Record<string, string[]>) ?? {};
  return new Set(bbRead[String(boardNum)] ?? []);
}

export async function markRead(
  u: IUrsamuSDK,
  boardNum: number,
  msgKey: string,
): Promise<void> {
  const bbRead = (u.me.state.bb_read as Record<string, string[]>) ?? {};
  const arr = bbRead[String(boardNum)] ?? [];
  if (!arr.includes(msgKey)) arr.push(msgKey);
  bbRead[String(boardNum)] = arr;
  await u.db.modify(u.me.id, "$set", { "data.bb_read": bbRead });
}

export async function markAllRead(u: IUrsamuSDK, boardNum: number): Promise<void> {
  const allKeys = await getAllMessageKeys(boardNum);
  const bbRead  = (u.me.state.bb_read as Record<string, string[]>) ?? {};
  bbRead[String(boardNum)] = allKeys;
  await u.db.modify(u.me.id, "$set", { "data.bb_read": bbRead });
}

export async function markAllBoardsRead(u: IUrsamuSDK): Promise<void> {
  const allBoards = await boards.query({});
  const bbRead    = (u.me.state.bb_read as Record<string, string[]>) ?? {};
  for (const board of allBoards.filter((b) => b.id !== "bbconfig")) {
    bbRead[String(board.num)] = await getAllMessageKeys(board.num);
  }
  await u.db.modify(u.me.id, "$set", { "data.bb_read": bbRead });
}

export async function getAllMessageKeys(boardNum: number): Promise<string[]> {
  const boardPosts = await getBoardPosts(boardNum);
  const keys: string[] = [];
  for (const post of boardPosts) {
    keys.push(String(post.num));
    for (const reply of (post.replies ?? []).sort((a, b) => a.num - b.num)) {
      keys.push(`${post.num}.${reply.num}`);
    }
  }
  return keys;
}

export async function getUnreadKeys(u: IUrsamuSDK, boardNum: number): Promise<string[]> {
  const allKeys = await getAllMessageKeys(boardNum);
  const readSet = getReadSet(u, boardNum);
  return allKeys.filter((k) => !readSet.has(k));
}

export async function getUnreadCount(u: IUrsamuSDK, boardNum: number): Promise<number> {
  return (await getUnreadKeys(u, boardNum)).length;
}

// ---------------------------------------------------------------------------
// Membership  (player state: bb_membership)
// ---------------------------------------------------------------------------

export function isMember(u: IUrsamuSDK, boardNum: number): boolean {
  const m = (u.me.state.bb_membership as Record<string, boolean>) ?? {};
  const val = m[String(boardNum)];
  return val === undefined ? true : val;
}

export async function setMembership(
  u: IUrsamuSDK,
  boardNum: number,
  value: boolean,
): Promise<void> {
  const m = (u.me.state.bb_membership as Record<string, boolean>) ?? {};
  m[String(boardNum)] = value;
  await u.db.modify(u.me.id, "$set", { "data.bb_membership": m });
}

// ---------------------------------------------------------------------------
// Notifications  (player state: bb_notify)
// ---------------------------------------------------------------------------

export function getNotify(u: IUrsamuSDK, boardNum: number): boolean {
  const n   = (u.me.state.bb_notify as Record<string, boolean>) ?? {};
  const val = n[String(boardNum)];
  return val === undefined ? true : val;
}

export async function setNotify(
  u: IUrsamuSDK,
  boardNum: number,
  value: boolean,
): Promise<void> {
  const n = (u.me.state.bb_notify as Record<string, boolean>) ?? {};
  n[String(boardNum)] = value;
  await u.db.modify(u.me.id, "$set", { "data.bb_notify": n });
}

// ---------------------------------------------------------------------------
// Draft  (player state: bb_draft)
// ---------------------------------------------------------------------------

export function getDraft(u: IUrsamuSDK): IDraft | null {
  return (u.me.state.bb_draft as IDraft) ?? null;
}

export async function setDraft(u: IUrsamuSDK, draft: IDraft): Promise<void> {
  await u.db.modify(u.me.id, "$set", { "data.bb_draft": draft });
}

export async function clearDraft(u: IUrsamuSDK): Promise<void> {
  await u.db.modify(u.me.id, "$set", { "data.bb_draft": null });
}

// ---------------------------------------------------------------------------
// Signature  (player state: bb_sig)
// ---------------------------------------------------------------------------

export function getSig(u: IUrsamuSDK): string | null {
  const sig = u.me.state.bb_sig;
  return typeof sig === "string" && sig.length > 0 ? sig : null;
}

export async function setSig(u: IUrsamuSDK, sig: string): Promise<void> {
  await u.db.modify(u.me.id, "$set", { "data.bb_sig": sig });
}

export async function clearSig(u: IUrsamuSDK): Promise<void> {
  await u.db.modify(u.me.id, "$set", { "data.bb_sig": null });
}

// ---------------------------------------------------------------------------
// Config  (stored as special doc in boards collection)
// ---------------------------------------------------------------------------

export async function getConfig(): Promise<IBBConfig> {
  const existing = await boards.queryOne({ id: "bbconfig" });
  if (existing) return existing as unknown as IBBConfig;
  return { id: "bbconfig", timeout: 0, autoTimeout: false };
}

export async function setConfig(cfg: Partial<IBBConfig>): Promise<void> {
  const existing = await boards.queryOne({ id: "bbconfig" });
  if (existing) {
    await boards.modify({ id: "bbconfig" }, "$set", cfg);
  } else {
    await boards.create({
      id: "bbconfig", num: -1, title: "__config__",
      timeout: cfg.timeout ?? 0, anonymous: false,
      readLock: "", writeLock: "", pendingDelete: false,
      category: "", type: "normal", moderators: [],
    });
  }
}
