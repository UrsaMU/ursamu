import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { posts, getNextPostNum } from "../db.ts";
import type { IPost, IReply } from "../db.ts";
import { findBoard, getPost, getNextReplyNum } from "../query.ts";
import { canRead, canWrite } from "../permissions.ts";
import { getDraft, setDraft, clearDraft, getSig } from "../tracking.ts";
import { fireWebhook } from "../webhook.ts";
import { formatPost } from "../display.ts";

// ─── +bbpost ─────────────────────────────────────────────────────────────────

addCmd({
  name: "+bbpost",
  pattern: /^\+?bbpost(?:\/(ic|ooc))?\s*(.*)/i,
  lock: "connected",
  category: "BBS",
  help: `+bbpost[/ic|/ooc] [<#>/<subject>[=<body>]]  — Post to a BBS board.

With <#>/<subject>=<body>: quick-post in one line.
With <#>/<subject> only: open a draft for multi-line composing.
No args with a draft open: submit the draft.

Switches:
  /ic    Tag the post as In-Character.
  /ooc   Tag the post as Out-of-Character.

Examples:
  +bbpost 2/Big News=The war is over.    Quick-post to board 2.
  +bbpost/ic 2/Scene Recap              Start an IC draft on board 2.
  +bbpost                               Submit your current draft.`,
  exec: async (u: IUrsamuSDK) => {
    const icSwitch = (u.cmd.args[0] ?? "").toLowerCase() as "ic" | "ooc" | "";
    const body     = (u.cmd.args[1] ?? "").trim();

    // Submit draft
    if (!body) {
      await doSubmitDraft(u);
      return;
    }

    const slashIdx = body.indexOf("/");
    if (slashIdx === -1) { u.send("%ch>BBS:%cn Usage: +bbpost <#>/<subject>[=<body>]"); return; }

    const boardStr = body.slice(0, slashIdx).trim();
    const rest     = body.slice(slashIdx + 1).trim();
    const eqIdx    = rest.indexOf("=");

    const { board, error } = await findBoard(boardStr);
    if (!board) { u.send(`%ch>BBS:%cn ${error}`); return; }
    if (!(await canWrite(u, board))) { u.send("%ch>BBS:%cn You cannot post to that board."); return; }

    const icTag = icSwitch ? (icSwitch as "ic" | "ooc") : undefined;

    if (eqIdx !== -1) {
      // Quick-post
      const subject  = rest.slice(0, eqIdx).trim();
      const postBody = u.util.stripSubs(rest.slice(eqIdx + 1).trim());
      if (!subject) { u.send("%ch>BBS:%cn Subject is required."); return; }
      await createPost(u, board.num, subject, postBody, icTag);
    } else {
      // Open draft
      const subject = rest.trim();
      if (!subject) { u.send("%ch>BBS:%cn Subject is required."); return; }
      const draft   = getDraft(u);
      const tags    = draft?.tags ?? [];
      await setDraft(u, { boardNum: board.num, subject, body: "", icTag, tags });
      u.send(`%ch>BBS:%cn Draft started on %cc${board.title}%cn — subject: %cc${subject}%cn. Use +bb <text> to add text, +bbpost to submit.`);
    }
  },
});

async function doSubmitDraft(u: IUrsamuSDK): Promise<void> {
  const draft = getDraft(u);
  if (!draft) { u.send("%ch>BBS:%cn No active draft. Start one with +bbpost <#>/<subject>."); return; }
  if (draft.replyToPost !== undefined) { await doSubmitReplyDraft(u, draft); return; }
  if (!draft.body.trim()) { u.send("%ch>BBS:%cn Draft body is empty. Add text with +bb <text>."); return; }

  const { board, error } = await findBoard(String(draft.boardNum));
  if (!board) { u.send(`%ch>BBS:%cn ${error}`); return; }
  if (!(await canWrite(u, board))) { u.send("%ch>BBS:%cn You cannot post to that board."); return; }

  await createPost(u, board.num, draft.subject, draft.body, draft.icTag, draft.tags ?? []);
  await clearDraft(u);
}

async function doSubmitReplyDraft(u: IUrsamuSDK, draft: NonNullable<ReturnType<typeof getDraft>>): Promise<void> {
  if (!draft.body.trim()) { u.send("%ch>BBS:%cn Reply body is empty."); return; }
  const { board } = await findBoard(String(draft.boardNum));
  if (!board) { u.send("%ch>BBS:%cn Board not found."); return; }
  const post = await getPost(board.num, draft.replyToPost!);
  if (!post) { u.send("%ch>BBS:%cn Post not found."); return; }

  const sig     = getSig(u);
  const body    = sig ? `${draft.body}\n---\n${sig}` : draft.body;
  const replyNum = getNextReplyNum(post);
  const reply: IReply = {
    num: replyNum, subject: `Re: ${post.subject}`, body,
    authorId: u.me.id, authorName: u.me.name ?? "Unknown",
    createdAt: Date.now(), editCount: 0, icTag: draft.icTag,
  };

  const updatedReplies = [...(post.replies ?? []), reply];
  await posts.modify({ id: post.id }, "$set", { replies: updatedReplies });

  // Notify watchers
  for (const watcherId of (post.watchers ?? [])) {
    if (watcherId === u.me.id) continue;
    u.send(`%ch>BBS:%cn New reply on %cc${board.title}%cn/${post.num} (${post.subject}) by %cc${u.me.name}%cn.`, watcherId);
  }

  u.send(`%ch>BBS:%cn Reply posted to %cc${board.title}%cn/${post.num}.`);
  await clearDraft(u);
}

async function createPost(
  u: IUrsamuSDK,
  boardNum: number,
  subject: string,
  body: string,
  icTag?: "ic" | "ooc",
  tags: string[] = [],
): Promise<void> {
  const sig     = getSig(u);
  const fullBody = sig ? `${body}\n---\n${sig}` : body;
  const num     = await getNextPostNum(boardNum);
  const post: IPost = {
    id: crypto.randomUUID(),
    boardId: boardNum, num, subject, body: fullBody,
    authorId: u.me.id, authorName: u.me.name ?? "Unknown",
    createdAt: Date.now(), timeout: 0, editCount: 0,
    replies: [], sticky: false, icTag, sceneId: undefined,
    tags, flags: [], watchers: [],
  };
  await posts.create(post);

  const { board } = await findBoard(String(boardNum));
  if (board?.webhookUrl) await fireWebhook(board.webhookUrl, board, post);

  const icLabel = icTag ? ` [${icTag.toUpperCase()}]` : "";
  u.send(`%ch>BBS:%cn Post ${boardNum}/${num} (${subject})${icLabel} created.`);
  try { u.broadcast(`%ch>BBS:%cn New message on board ${boardNum}: %cc${subject}%cn.`); } catch { /* non-fatal */ }
}

// ─── +bb (append to draft) ───────────────────────────────────────────────────

addCmd({
  name: "+bb",
  pattern: /^\+bb\s+(.*)/i,
  lock: "connected",
  category: "BBS",
  help: `+bb <text>  — Append text to your current BBS draft.

Examples:
  +bb This is the first paragraph.
  +bb %r%rAnd a second paragraph after a blank line.`,
  exec: async (u: IUrsamuSDK) => {
    const text  = (u.cmd.args[0] ?? "").trim();
    const draft = getDraft(u);
    if (!draft) { u.send("%ch>BBS:%cn No active draft."); return; }
    const newBody = draft.body ? `${draft.body}\n${text}` : text;
    await setDraft(u, { ...draft, body: newBody });  // await required for setDraft
    u.send(`%ch>BBS:%cn Text appended (${newBody.length} chars total).`);
  },
});

// ─── +bbproof ────────────────────────────────────────────────────────────────

addCmd({
  name: "+bbproof",
  pattern: /^\+?bbproof$/i,
  lock: "connected",
  category: "BBS",
  help: `+bbproof  — Preview your current BBS draft before submitting.

Examples:
  +bbproof    Show draft contents.`,
  exec: (u: IUrsamuSDK) => {
    const draft = getDraft(u);
    if (!draft) { u.send("%ch>BBS:%cn No active draft."); return; }
    const icLabel = draft.icTag ? ` [${draft.icTag.toUpperCase()}]` : "";
    const tagLine = draft.tags?.length ? `\nTags: ${draft.tags.join(", ")}` : "";
    u.send(`%ch>BBS Draft:%cn Board ${draft.boardNum} — ${draft.subject}${icLabel}${tagLine}\n${draft.body || "(empty)"}`);
  },
});

// ─── +bbtoss ─────────────────────────────────────────────────────────────────

addCmd({
  name: "+bbtoss",
  pattern: /^\+?bbtoss$/i,
  lock: "connected",
  category: "BBS",
  help: `+bbtoss  — Discard your current BBS draft.

Examples:
  +bbtoss    Throw away the draft.`,
  exec: async (u: IUrsamuSDK) => {
    const draft = getDraft(u);
    if (!draft) { u.send("%ch>BBS:%cn No active draft."); return; }
    await clearDraft(u);
    u.send("%ch>BBS:%cn Draft discarded.");
  },
});

// ─── +bbreply ────────────────────────────────────────────────────────────────

addCmd({
  name: "+bbreply",
  pattern: /^\+?bbreply(?:\/(ic|ooc))?\s*(.*)/i,
  lock: "connected",
  category: "BBS",
  help: `+bbreply[/ic|/ooc] <#>/<post>[=<text>]  — Reply to a BBS post.

Switches:
  /ic    Tag reply as In-Character.
  /ooc   Tag reply as Out-of-Character.

Examples:
  +bbreply 2/3=Great post!          Quick-reply to board 2, post 3.
  +bbreply/ic 2/3                   Start an IC reply draft.`,
  exec: async (u: IUrsamuSDK) => {
    const icSwitch = (u.cmd.args[0] ?? "").toLowerCase() as "ic" | "ooc" | "";
    const rest     = (u.cmd.args[1] ?? "").trim();
    const eqIdx    = rest.indexOf("=");
    const parsed   = parseBoardPostArg(eqIdx !== -1 ? rest.slice(0, eqIdx) : rest);
    if (!parsed) { u.send("%ch>BBS:%cn Usage: +bbreply <#>/<post>[=<text>]"); return; }

    const { board, error } = await findBoard(parsed.boardStr);
    if (!board) { u.send(`%ch>BBS:%cn ${error}`); return; }
    if (!(await canRead(u, board))) { u.send("%ch>BBS:%cn Access denied."); return; }
    if (board.type === "archive") { u.send("%ch>BBS:%cn Archive boards are read-only."); return; }

    const post = await getPost(board.num, parseInt(parsed.postStr, 10));
    if (!post) { u.send("%ch>BBS:%cn Post not found."); return; }

    const icTag = icSwitch ? (icSwitch as "ic" | "ooc") : undefined;

    if (eqIdx !== -1) {
      // Quick reply
      const text = u.util.stripSubs(rest.slice(eqIdx + 1).trim());
      if (!text) { u.send("%ch>BBS:%cn Reply text is required."); return; }
      const sig     = getSig(u);
      const body    = sig ? `${text}\n---\n${sig}` : text;
      const replyNum = getNextReplyNum(post);
      const reply: IReply = {
        num: replyNum, subject: `Re: ${post.subject}`, body,
        authorId: u.me.id, authorName: u.me.name ?? "Unknown",
        createdAt: Date.now(), editCount: 0, icTag,
      };
      await posts.modify({ id: post.id }, "$set", { replies: [...(post.replies ?? []), reply] });
      for (const watcherId of (post.watchers ?? [])) {
        if (watcherId === u.me.id) continue;
        u.send(`%ch>BBS:%cn New reply on %cc${board.title}%cn/${post.num} (${post.subject}) by %cc${u.me.name}%cn.`, watcherId);
      }
      u.send(`%ch>BBS:%cn Reply posted to ${board.num}/${post.num}.`);
    } else {
      // Draft reply
      await setDraft(u, { boardNum: board.num, subject: `Re: ${post.subject}`, body: "", replyToPost: post.num, icTag });
      u.send(`%ch>BBS:%cn Reply draft started for ${board.num}/${post.num}. Use +bb <text> to write, +bbpost to submit.`);
    }
  },
});

// ─── +bbtag ──────────────────────────────────────────────────────────────────

addCmd({
  name: "+bbtag",
  pattern: /^\+?bbtag\s*(.*)/i,
  lock: "connected",
  category: "BBS",
  help: `+bbtag [<tag1>[,<tag2>...]]  — Set tags on your current draft. No args clears tags.

Tags are searchable with +bbsearch <#>/tag:<name>.

Examples:
  +bbtag lore,history    Set two tags on the current draft.
  +bbtag                 Clear all tags.`,
  exec: async (u: IUrsamuSDK) => {
    const draft = getDraft(u);
    if (!draft) { u.send("%ch>BBS:%cn No active draft."); return; }
    const raw  = u.util.stripSubs((u.cmd.args[0] ?? "").trim());
    const tags = raw ? raw.split(",").map((t) => t.trim()).filter(Boolean) : [];
    await setDraft(u, { ...draft, tags });
    u.send(tags.length ? `%ch>BBS:%cn Tags set: ${tags.join(", ")}` : "%ch>BBS:%cn Tags cleared.");
  },
});

// ─── +bblink ─────────────────────────────────────────────────────────────────

addCmd({
  name: "+bblink",
  pattern: /^\+?bblink\s+(.+?)\/(\d+)(?:=(\S+))?/i,
  lock: "connected",
  category: "BBS",
  help: `+bblink <#>/<post>[=<sceneId>]  — Link or unlink a scene from a post.

No sceneId clears the link. Callers must own the post (or be staff).

Examples:
  +bblink 2/3=abc123    Link scene abc123 to board 2, post 3.
  +bblink 2/3           Remove the scene link from post 3.`,
  exec: async (u: IUrsamuSDK) => {
    const boardStr = (u.cmd.args[0] ?? "").trim();
    const postNum  = parseInt(u.cmd.args[1] ?? "", 10);
    const sceneId  = u.util.stripSubs((u.cmd.args[2] ?? "").trim()) || undefined;

    const { board, error } = await findBoard(boardStr);
    if (!board) { u.send(`%ch>BBS:%cn ${error}`); return; }
    const post = await getPost(board.num, postNum);
    if (!post) { u.send("%ch>BBS:%cn Post not found."); return; }
    if (post.authorId !== u.me.id && !canEditPost(u, post)) {
      u.send("%ch>BBS:%cn You can only link scenes to your own posts."); return;
    }
    await posts.modify({ id: post.id }, "$set", { sceneId: sceneId ?? null });
    u.send(sceneId ? `%ch>BBS:%cn Scene %cc${sceneId}%cn linked to ${board.num}/${post.num}.` : `%ch>BBS:%cn Scene link removed from ${board.num}/${post.num}.`);
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseBoardPostArg(s: string): { boardStr: string; postStr: string } | null {
  const idx = s.indexOf("/");
  if (idx === -1) return null;
  return { boardStr: s.slice(0, idx).trim(), postStr: s.slice(idx + 1).trim() };
}

function canEditPost(u: IUrsamuSDK, _post: IPost): boolean {
  return u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
}

void formatPost;
