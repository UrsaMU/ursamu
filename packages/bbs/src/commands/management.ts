import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { posts, boards } from "../db.ts";
import type { IFlag } from "../db.ts";
import { findBoard, getPost, getBoardPosts, renumberPosts } from "../query.ts";
import { canRead, isBoardMod, isStaff } from "../permissions.ts";
import { formatPost } from "../display.ts";

// ─── +bbremove ───────────────────────────────────────────────────────────────

addCmd({
  name: "+bbremove",
  pattern: /^\+?bbremove\s+(.+?)\/(.+)/i,
  lock: "connected",
  category: "BBS",
  help: `+bbremove <#>/<post[,post...]>  — Delete your own post(s). Staff and board mods can delete any post.

Examples:
  +bbremove 2/3       Delete post 3 from board 2.
  +bbremove 2/3,4,5   Delete posts 3, 4, and 5 from board 2.`,
  exec: async (u: IUrsamuSDK) => {
    const { board, error } = await findBoard((u.cmd.args[0] ?? "").trim());
    if (!board) { u.send(`%ch>BBS:%cn ${error}`); return; }
    if (!(await canRead(u, board))) { u.send("%ch>BBS:%cn Access denied."); return; }

    const nums   = (u.cmd.args[1] ?? "").split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
    const isMod  = isBoardMod(u, board);
    let removed  = 0;

    for (const num of nums) {
      const post = await getPost(board.num, num);
      if (!post) continue;
      if (post.authorId !== u.me.id && !isMod) {
        u.send(`%ch>BBS:%cn You cannot delete post ${num} (not yours).`);
        continue;
      }
      await posts.delete({ id: post.id });
      removed++;
    }

    if (removed > 0) {
      await renumberPosts(board.num);
      u.send(`%ch>BBS:%cn ${removed} post(s) deleted from %cc${board.title}%cn.`);
    } else {
      u.send("%ch>BBS:%cn No posts deleted.");
    }
  },
});

// ─── +bbmove ─────────────────────────────────────────────────────────────────

addCmd({
  name: "+bbmove",
  pattern: /^\+?bbmove\s+(.+?)\/(\d+)\s+to\s+(\S+)/i,
  lock: "connected",
  category: "BBS",
  help: `+bbmove <#>/<post> to <#>  — Move a post to a different board.

Staff and board mods only.

Examples:
  +bbmove 2/3 to 5    Move post 3 from board 2 to board 5.`,
  exec: async (u: IUrsamuSDK) => {
    const { board: src, error: e1 } = await findBoard((u.cmd.args[0] ?? "").trim());
    if (!src) { u.send(`%ch>BBS:%cn ${e1}`); return; }
    if (!isBoardMod(u, src)) { u.send("%ch>BBS:%cn Board mods or staff only."); return; }

    const postNum = parseInt(u.cmd.args[1] ?? "", 10);
    const { board: dst, error: e2 } = await findBoard((u.cmd.args[2] ?? "").trim());
    if (!dst) { u.send(`%ch>BBS:%cn ${e2}`); return; }

    const post = await getPost(src.num, postNum);
    if (!post) { u.send("%ch>BBS:%cn Post not found."); return; }
    if (dst.type === "archive" && !isStaff(u)) { u.send("%ch>BBS:%cn Cannot move posts to an archive board."); return; }

    const dstPosts = await getBoardPosts(dst.num);
    const newNum   = dstPosts.length ? Math.max(...dstPosts.map((p) => p.num)) + 1 : 1;

    await posts.create({ ...post, id: crypto.randomUUID(), boardId: dst.num, num: newNum, sticky: false });
    await posts.delete({ id: post.id });
    await renumberPosts(src.num);

    u.send(`%ch>BBS:%cn Post moved from %cc${src.title}%cn/${postNum} to %cc${dst.title}%cn/${newNum}.`);
  },
});

// ─── +bbedit ─────────────────────────────────────────────────────────────────

addCmd({
  name: "+bbedit",
  pattern: /^\+?bbedit\s+(.+?)\/(\d+)(?:\.(\d+))?(?:=(.+?)\/(.+))?/i,
  lock: "connected",
  category: "BBS",
  help: `+bbedit <#>/<post>[.<reply>][=<old>/<new>]  — Inline edit a post or reply.

No <old>/<new>: load the post into your draft for editing.

Examples:
  +bbedit 2/3=typo/fixed       Replace "typo" with "fixed" in post 3.
  +bbedit 2/3.1=typo/fixed     Replace text in reply 1 of post 3.
  +bbedit 2/3                  Load post 3 into draft for editing.`,
  exec: async (u: IUrsamuSDK) => {
    const { board, error } = await findBoard((u.cmd.args[0] ?? "").trim());
    if (!board) { u.send(`%ch>BBS:%cn ${error}`); return; }

    const postNum  = parseInt(u.cmd.args[1] ?? "", 10);
    const replyNum = u.cmd.args[2] ? parseInt(u.cmd.args[2], 10) : undefined;
    const oldText  = u.cmd.args[3] ?? "";
    const newText  = u.cmd.args[4] ?? "";

    const post = await getPost(board.num, postNum);
    if (!post) { u.send("%ch>BBS:%cn Post not found."); return; }

    const isOwner = post.authorId === u.me.id;
    const canEditPost = isOwner || isBoardMod(u, board);
    if (!canEditPost) { u.send("%ch>BBS:%cn You can only edit your own posts."); return; }

    // No find/replace: load into draft
    if (!oldText) {
      const { setDraft } = await import("../tracking.ts");
      await setDraft(u, { boardNum: board.num, subject: post.subject, body: post.body, editingPost: post.num });
      u.send(`%ch>BBS:%cn Post ${board.num}/${post.num} loaded into draft. Use +bb to append, +bbpost to save.`);
      return;
    }

    if (replyNum !== undefined) {
      const replies = post.replies ?? [];
      const ri = replies.findIndex((r) => r.num === replyNum);
      if (ri === -1) { u.send("%ch>BBS:%cn Reply not found."); return; }
      if (replies[ri].authorId !== u.me.id && !isBoardMod(u, board)) {
        u.send("%ch>BBS:%cn You can only edit your own replies."); return;
      }
      if (!replies[ri].body.includes(oldText)) { u.send("%ch>BBS:%cn Text not found in reply."); return; }
      replies[ri] = { ...replies[ri], body: replies[ri].body.replace(oldText, newText), editCount: (replies[ri].editCount ?? 0) + 1 };
      await posts.modify({ id: post.id }, "$set", { replies });
    } else {
      if (!post.body.includes(oldText)) { u.send("%ch>BBS:%cn Text not found in post."); return; }
      await posts.modify({ id: post.id }, "$set", { body: post.body.replace(oldText, newText), editCount: post.editCount + 1 });
    }
    u.send(`%ch>BBS:%cn Post ${board.num}/${postNum}${replyNum !== undefined ? `.${replyNum}` : ""} edited.`);
  },
});

// ─── +bbsticky ───────────────────────────────────────────────────────────────

addCmd({
  name: "+bbsticky",
  pattern: /^\+?bbsticky\s+(.+?)\/(\d+)/i,
  lock: "connected",
  category: "BBS",
  help: `+bbsticky <#>/<post>  — Toggle sticky on a post (board mods and staff only).

Sticky posts are always listed first.

Examples:
  +bbsticky 2/3    Pin or unpin post 3 on board 2.`,
  exec: async (u: IUrsamuSDK) => {
    const { board, error } = await findBoard((u.cmd.args[0] ?? "").trim());
    if (!board) { u.send(`%ch>BBS:%cn ${error}`); return; }
    if (!isBoardMod(u, board)) { u.send("%ch>BBS:%cn Board mods or staff only."); return; }

    const post = await getPost(board.num, parseInt(u.cmd.args[1] ?? "", 10));
    if (!post) { u.send("%ch>BBS:%cn Post not found."); return; }

    const nowSticky = !post.sticky;
    await posts.modify({ id: post.id }, "$set", { sticky: nowSticky });
    u.send(`%ch>BBS:%cn Post ${board.num}/${post.num} is now ${nowSticky ? "%ch%cySTICKY%cn" : "unstickied"}.`);
  },
});

// ─── +bbflag ─────────────────────────────────────────────────────────────────

addCmd({
  name: "+bbflag",
  pattern: /^\+?bbflag\s+(.+?)\/(\d+)(?:=(.+))?/i,
  lock: "connected",
  category: "BBS",
  help: `+bbflag <#>/<post>[=<reason>]  — Flag a post for moderator review.

Flagged posts remain visible. Mods review them with +bbreview.

Examples:
  +bbflag 2/3=Spam content    Flag post 3 as spam.
  +bbflag 2/3                 Flag post 3 with no reason.`,
  exec: async (u: IUrsamuSDK) => {
    const { board, error } = await findBoard((u.cmd.args[0] ?? "").trim());
    if (!board) { u.send(`%ch>BBS:%cn ${error}`); return; }
    if (!(await canRead(u, board))) { u.send("%ch>BBS:%cn Access denied."); return; }

    const post = await getPost(board.num, parseInt(u.cmd.args[1] ?? "", 10));
    if (!post) { u.send("%ch>BBS:%cn Post not found."); return; }

    const reason  = u.util.stripSubs((u.cmd.args[2] ?? "").trim());
    const flags   = post.flags ?? [];

    if (flags.some((f: IFlag) => f.playerId === u.me.id)) {
      u.send("%ch>BBS:%cn You have already flagged this post."); return;
    }
    // stripSubs on playerName: a player's display name may contain MUSH codes
    const flag: IFlag = { playerId: u.me.id, playerName: u.util.stripSubs(u.me.name ?? "Unknown"), reason, createdAt: Date.now() };
    await posts.modify({ id: post.id }, "$set", { flags: [...flags, flag] });
    u.send(`%ch>BBS:%cn Post ${board.num}/${post.num} flagged for review.`);
  },
});

void boards;
void formatPost;
