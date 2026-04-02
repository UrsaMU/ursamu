import type { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * @ltag[/remove|/list] <tagname>[=<object>]
 *
 * Personal tag: create a named alias for any object, scoped to your character.
 * You may have up to 50 personal tags. Personal tags are referenced as
 * #tagname in softcode when you are the enactor.
 *
 * Switches:
 *   /remove   Remove one of your personal tags.
 *   /list     List all your personal tags.
 *
 * Examples:
 *   @ltag home=here             Tag this room as your personal "home".
 *   @ltag/list                  List all your personal tags.
 *   @ltag/remove home           Remove your personal "home" tag.
 */
export default async (u: IUrsamuSDK) => {
  const sw  = (u.cmd.switches?.[0] ?? "").toLowerCase();
  const arg = (u.cmd.args[0] ?? "").trim();

  const { playerTags } = await import("../../src/services/Database/index.ts");

  const MAX_TAGS = 50;
  const ltagId = (name: string) => `${u.me.id}:${name}`;

  // ── /list ─────────────────────────────────────────────────────────────────
  if (sw === "list" || (!arg && sw === "")) {
    const myTags = await playerTags.find({ ownerId: u.me.id });
    if (!myTags.length) {
      u.send("You have no personal tags set.");
      return;
    }
    const lines = myTags.map(t => `  %ch${t.name}%cn → #${t.objectId}`).join("%r");
    u.send(`Your personal tags:%r${lines}`);
    return;
  }

  // ── /remove ───────────────────────────────────────────────────────────────
  if (sw === "remove") {
    if (!arg) { u.send("Usage: @ltag/remove <tagname>"); return; }
    const name = arg.toLowerCase();
    const existing = await playerTags.queryOne({ id: ltagId(name) });
    if (!existing) {
      u.send(`You have no personal tag named '${name}'.`);
      return;
    }
    await playerTags.delete({ id: ltagId(name) });
    u.send(`Personal tag '${name}' removed.`);
    return;
  }

  // ── display (no =) ────────────────────────────────────────────────────────
  if (!arg) {
    u.send("Usage: @ltag[/remove|/list] <tagname>[=<object>]");
    return;
  }

  const eqIdx = arg.indexOf("=");
  if (eqIdx === -1) {
    const name = arg.toLowerCase();
    const existing = await playerTags.queryOne({ id: ltagId(name) });
    if (!existing) {
      u.send(`You have no personal tag named '${name}'.`);
      return;
    }
    const results = await u.db.search(existing.objectId);
    const obj = results[0];
    u.send(`Tag '${name}' → ${obj ? `${obj.name}(#${existing.objectId})` : `#${existing.objectId} (not found)`}`);
    return;
  }

  // ── set ───────────────────────────────────────────────────────────────────
  const tagName = arg.slice(0, eqIdx).trim().toLowerCase();
  const objRef  = arg.slice(eqIdx + 1).trim();

  if (!tagName || !/^[a-z0-9_-]+$/.test(tagName)) {
    u.send("Tag names may only contain letters, numbers, hyphens, and underscores.");
    return;
  }
  if (!objRef) {
    u.send("Usage: @ltag <tagname>=<object>");
    return;
  }

  const results = await u.db.search(objRef);
  const target = results[0];
  if (!target) {
    u.send(`I can't find '${objRef}'.`);
    return;
  }

  const existing = await playerTags.queryOne({ id: ltagId(tagName) });

  if (!existing) {
    const myTags = await playerTags.find({ ownerId: u.me.id });
    if (myTags.length >= MAX_TAGS) {
      u.send(`You have reached the maximum of ${MAX_TAGS} personal tags.`);
      return;
    }
    await playerTags.create({
      id:        ltagId(tagName),
      name:      tagName,
      ownerId:   u.me.id,
      objectId:  target.id,
      createdAt: Date.now(),
    });
    u.send(`Personal tag '${tagName}' set → ${target.name}(#${target.id}).`);
  } else {
    await playerTags.update({ id: ltagId(tagName) }, {
      ...existing,
      objectId: target.id,
    });
    u.send(`Personal tag '${tagName}' updated → ${target.name}(#${target.id}).`);
  }
};
