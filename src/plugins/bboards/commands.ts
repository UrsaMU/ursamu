import { addCmd } from "../../services/commands/cmdParser.ts";
import type { IUrsamuSDK } from "../../@types/UrsamuSDK.ts";

function isAdmin(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
}

// ─── +bblist ─────────────────────────────────────────────────────────────────

addCmd({
  name: "+bblist",
  pattern: /^\+bblist\s*$/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    const boards = await u.bb.listBoards();

    if (!boards.length) {
      u.send("No bulletin boards have been created yet.");
      return;
    }

    const header = u.util.ljust("Board", 20) + u.util.rjust("Posts", 7) + u.util.rjust("New", 6);
    u.send("%ch%cy" + header + "%cn");
    u.send("%ch%cy" + "-".repeat(33) + "%cn");

    for (const b of boards) {
      const nameCol = u.util.ljust(b.name, 20);
      const postCol = u.util.rjust(String(b.postCount), 7);
      const newCol  = b.newCount > 0
        ? u.util.rjust(`%ch%cy${b.newCount}%cn`, 6)
        : u.util.rjust("0", 6);
      u.send(nameCol + postCol + newCol);
    }

    u.send('Use "+bbread <board>" to read posts.');
  },
});

// ─── +bbread ─────────────────────────────────────────────────────────────────

addCmd({
  name: "+bbread",
  pattern: /^\+bbread\s*(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    const arg = (u.cmd.args[0] || "").trim();

    if (!arg) {
      u.send("Usage: +bbread <board>  or  +bbread <board>/<num>");
      return;
    }

    const slashIdx = arg.indexOf("/");
    const boardId  = (slashIdx === -1 ? arg : arg.slice(0, slashIdx))
      .toLowerCase().replace(/\s+/g, "-");
    const postNum  = slashIdx !== -1 ? parseInt(arg.slice(slashIdx + 1), 10) : NaN;

    if (slashIdx !== -1 && !isNaN(postNum)) {
      const post = await u.bb.readPost(boardId, postNum);
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
      await u.bb.markRead(boardId);
      return;
    }

    const posts = await u.bb.listPosts(boardId);
    if (!posts.length) {
      u.send(`No posts on board '${boardId}'.`);
      return;
    }

    u.send(`%ch%cy--- ${boardId} ---%cn`);
    u.send(u.util.rjust("#", 4) + "  " + u.util.ljust("Subject", 40) + u.util.ljust("Author", 16) + "Date");
    u.send("-".repeat(72));
    for (const p of posts) {
      const dateStr = new Date(p.date).toLocaleDateString();
      u.send(
        u.util.rjust(String(p.num), 4) + "  " +
        u.util.ljust(p.subject, 40) +
        u.util.ljust(p.authorName, 16) +
        dateStr
      );
    }
    u.send('Use "+bbread <board>/<num>" to read a post.');
  },
});

// ─── +bbpost ──────────────────────────────────────────────────────────────────

addCmd({
  name: "+bbpost",
  pattern: /^\+bbpost(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] || "").toLowerCase().trim();
    const arg = (u.cmd.args[1] || "").trim();

    if (sw === "edit") {
      const eqIdx = arg.indexOf("=");
      if (eqIdx === -1) { u.send("Usage: +bbpost/edit <board>/<num>=<new body>"); return; }
      const ref      = arg.slice(0, eqIdx).trim();
      const body     = arg.slice(eqIdx + 1).trim();
      const slashIdx = ref.lastIndexOf("/");
      if (slashIdx === -1 || !body) { u.send("Usage: +bbpost/edit <board>/<num>=<new body>"); return; }
      const boardId = ref.slice(0, slashIdx).toLowerCase().replace(/\s+/g, "-");
      const postNum = parseInt(ref.slice(slashIdx + 1), 10);
      if (isNaN(postNum)) { u.send("Usage: +bbpost/edit <board>/<num>=<new body>"); return; }
      await u.bb.editPost(boardId, postNum, body);
      u.send(`Post ${boardId}/${postNum} updated.`);
      return;
    }

    if (sw === "delete") {
      const slashIdx = arg.lastIndexOf("/");
      if (slashIdx === -1) { u.send("Usage: +bbpost/delete <board>/<num>"); return; }
      const boardId = arg.slice(0, slashIdx).toLowerCase().replace(/\s+/g, "-");
      const postNum = parseInt(arg.slice(slashIdx + 1), 10);
      if (isNaN(postNum)) { u.send("Usage: +bbpost/delete <board>/<num>"); return; }
      await u.bb.deletePost(boardId, postNum);
      u.send(`Post ${boardId}/${postNum} deleted.`);
      return;
    }

    // +bbpost <board>=<subject>/<body>
    const eqIdx = arg.indexOf("=");
    if (eqIdx === -1) { u.send("Usage: +bbpost <board>=<subject>/<body>"); return; }
    const boardId = arg.slice(0, eqIdx).trim().toLowerCase().replace(/\s+/g, "-");
    const rest    = arg.slice(eqIdx + 1);
    const slashIdx = rest.indexOf("/");
    if (slashIdx === -1) { u.send("Usage: +bbpost <board>=<subject>/<body>"); return; }
    const subject = rest.slice(0, slashIdx).trim();
    const body    = rest.slice(slashIdx + 1).trim();
    if (!boardId || !subject || !body) { u.send("Usage: +bbpost <board>=<subject>/<body>"); return; }

    const result = await u.bb.post(boardId, subject, body);
    if (result?.error) {
      u.send(`Error: ${result.error}`);
      return;
    }
    u.send(`Posted to ${boardId}: "${subject}"`);
  },
});

// ─── +bbcreate ────────────────────────────────────────────────────────────────

addCmd({
  name: "+bbcreate",
  pattern: /^\+bbcreate\s*(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    if (!isAdmin(u)) { u.send("Permission denied."); return; }

    const arg = (u.cmd.args[0] || "").trim();
    if (!arg) { u.send("Usage: +bbcreate <name>[=<description>]"); return; }

    const eqIdx      = arg.indexOf("=");
    const name       = (eqIdx === -1 ? arg : arg.slice(0, eqIdx)).trim();
    const description = eqIdx !== -1 ? arg.slice(eqIdx + 1).trim() : undefined;

    if (!name) { u.send("Usage: +bbcreate <name>[=<description>]"); return; }

    const result = await u.bb.createBoard(name, description ? { description } : undefined);
    if (result?.error) {
      u.send(`Error: ${result.error}`);
      return;
    }
    u.send(`Board '${result.name}' created.`);
  },
});

// ─── +bbdestroy ───────────────────────────────────────────────────────────────

addCmd({
  name: "+bbdestroy",
  pattern: /^\+bbdestroy\s*(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    if (!isAdmin(u)) { u.send("Permission denied."); return; }

    const arg = (u.cmd.args[0] || "").trim();
    if (!arg) { u.send("Usage: +bbdestroy <board>"); return; }

    const boardId = arg.toLowerCase().replace(/\s+/g, "-");
    await u.bb.destroyBoard(boardId);
    u.send(`Board '${boardId}' and all its posts have been deleted.`);
  },
});
