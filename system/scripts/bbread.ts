import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * @bbread <board>        — list posts on a board
 * @bbread <board>/<num>  — read a specific post
 */
export default async (u: IUrsamuSDK) => {
  const arg = (u.cmd.args[0] || "").trim();

  if (!arg) {
    u.send("Usage: @bbread <board>  or  @bbread <board>/<num>");
    return;
  }

  const slashIdx = arg.indexOf("/");
  const boardId = (slashIdx === -1 ? arg : arg.slice(0, slashIdx)).toLowerCase().replace(/\s+/g, "-");
  const postNum = slashIdx !== -1 ? parseInt(arg.slice(slashIdx + 1), 10) : NaN;

  if (slashIdx !== -1 && !isNaN(postNum)) {
    // Read a specific post
    const post = await u.bb.readPost(boardId, postNum) as { id: string; subject: string; body: string; authorName: string; date: number; edited?: number } | null;
    if (!post) {
      u.send(`No post #${postNum} found on board '${boardId}'.`);
      return;
    }

    const dateStr = new Date(post.date).toLocaleDateString();
    u.send(`%ch%cy[${boardId}/${postNum}] ${post.subject}%cn`);
    u.send(`Posted by ${post.authorName} on ${dateStr}${post.edited ? " (edited)" : ""}`);
    u.send("-".repeat(60));
    u.send(post.body);
    u.send("-".repeat(60));

    // Mark this board as read up to this post
    await u.bb.markRead(boardId);
    return;
  }

  // List posts on the board
  const posts = await u.bb.listPosts(boardId) as Array<{ id: string; num: number; subject: string; authorName: string; date: number }>;
  if (!posts.length) {
    u.send(`No posts on board '${boardId}'.`);
    return;
  }

  u.send(`%ch%cy--- ${boardId} ---%cn`);
  u.send(u.util.rjust("#", 4) + "  " + u.util.ljust("Subject", 40) + u.util.ljust("Author", 16) + "Date");
  u.send("-".repeat(72));
  for (const p of posts) {
    const dateStr = new Date(p.date).toLocaleDateString();
    u.send(u.util.rjust(String(p.num), 4) + "  " + u.util.ljust(p.subject, 40) + u.util.ljust(p.authorName, 16) + dateStr);
  }
  u.send('Use "@bbread <board>/<num>" to read a post.');
};
