import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * @bbpost <board>=<subject>/<body>     — create a post
 * @bbpost/edit <board>/<num>=<body>    — edit an existing post (author or admin)
 * @bbpost/delete <board>/<num>         — delete a post (author or admin)
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;
  const isAdmin = actor.flags.has("admin") || actor.flags.has("wizard") || actor.flags.has("superuser");
  const switches = u.cmd.switches || [];
  const arg = (u.cmd.args[0] || "").trim();

  if (switches.includes("edit")) {
    // @bbpost/edit <board>/<num>=<body>
    const eqIdx = arg.indexOf("=");
    if (eqIdx === -1) {
      u.send("Usage: @bbpost/edit <board>/<num>=<new body>");
      return;
    }
    const ref = arg.slice(0, eqIdx).trim();
    const body = arg.slice(eqIdx + 1).trim();
    const slashIdx = ref.lastIndexOf("/");
    if (slashIdx === -1) {
      u.send("Usage: @bbpost/edit <board>/<num>=<new body>");
      return;
    }
    const boardId = ref.slice(0, slashIdx).toLowerCase().replace(/\s+/g, "-");
    const postNum = parseInt(ref.slice(slashIdx + 1), 10);
    if (isNaN(postNum) || !body) {
      u.send("Usage: @bbpost/edit <board>/<num>=<new body>");
      return;
    }
    await u.bb.editPost(boardId, postNum, body);
    u.send(`Post ${boardId}/${postNum} updated.`);
    return;
  }

  if (switches.includes("delete")) {
    // @bbpost/delete <board>/<num>
    const slashIdx = arg.lastIndexOf("/");
    if (slashIdx === -1) {
      u.send("Usage: @bbpost/delete <board>/<num>");
      return;
    }
    const boardId = arg.slice(0, slashIdx).toLowerCase().replace(/\s+/g, "-");
    const postNum = parseInt(arg.slice(slashIdx + 1), 10);
    if (isNaN(postNum)) {
      u.send("Usage: @bbpost/delete <board>/<num>");
      return;
    }
    await u.bb.deletePost(boardId, postNum);
    u.send(`Post ${boardId}/${postNum} deleted.`);
    return;
  }

  // @bbpost <board>=<subject>/<body>
  const eqIdx = arg.indexOf("=");
  if (eqIdx === -1) {
    u.send("Usage: @bbpost <board>=<subject>/<body>");
    return;
  }
  const boardId = arg.slice(0, eqIdx).trim().toLowerCase().replace(/\s+/g, "-");
  const rest = arg.slice(eqIdx + 1);
  const slashIdx = rest.indexOf("/");
  if (slashIdx === -1) {
    u.send("Usage: @bbpost <board>=<subject>/<body>");
    return;
  }
  const subject = rest.slice(0, slashIdx).trim();
  const body = rest.slice(slashIdx + 1).trim();

  if (!boardId || !subject || !body) {
    u.send("Usage: @bbpost <board>=<subject>/<body>");
    return;
  }

  const result = await u.bb.post(boardId, subject, body) as { id?: string; error?: string };
  if (result?.error) {
    u.send(`Error: ${result.error}`);
    return;
  }

  u.send(`Posted to ${boardId}: "${subject}"`);
  void isAdmin; // suppress unused warning
};
