import type { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * @tag[/remove] <tagname>[=<object>]
 *
 * Wizard-only command to create or remove a global named tag pointing to a
 * specific object. Tags can then be referenced anywhere as #tagname in softcode
 * or via the tag() / istag() / listtags() functions.
 *
 * Switches:
 *   /remove   Remove a previously set tag.
 *
 * Examples:
 *   @tag citygate=here          Tag this room as "citygate".
 *   @tag vault=#142             Tag object #142 as "vault".
 *   @tag/remove citygate        Remove the "citygate" tag.
 *
 * Only wizards and admins may use @tag. Personal tags use @ltag.
 */
export default async (u: IUrsamuSDK) => {
  const isAdmin = u.me.flags.has("wizard") || u.me.flags.has("admin") || u.me.flags.has("superuser");
  if (!isAdmin) {
    u.send("Permission denied. @tag requires wizard or admin privileges.");
    return;
  }

  const sw  = (u.cmd.switches?.[0] ?? "").toLowerCase();
  const arg = (u.cmd.args[0] ?? "").trim();

  const { serverTags } = await import("../../src/services/Database/index.ts");

  // ── /remove ──────────────────────────────────────────────────────────────
  if (sw === "remove") {
    if (!arg) { u.send("Usage: @tag/remove <tagname>"); return; }
    const name = arg.toLowerCase();
    const existing = await serverTags.queryOne({ id: name });
    if (!existing) {
      u.send(`No tag named '${name}' exists.`);
      return;
    }
    await serverTags.delete({ id: name });
    u.send(`Tag '${name}' removed.`);
    return;
  }

  // ── display (no =) ────────────────────────────────────────────────────────
  if (!arg) {
    u.send("Usage: @tag[/remove] <tagname>[=<object>]");
    return;
  }

  const eqIdx = arg.indexOf("=");
  if (eqIdx === -1) {
    const name = arg.toLowerCase();
    const existing = await serverTags.queryOne({ id: name });
    if (!existing) {
      u.send(`No tag named '${name}' is set.`);
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
    u.send("Usage: @tag <tagname>=<object>");
    return;
  }

  const results = await u.db.search(objRef);
  const target = results[0];
  if (!target) {
    u.send(`I can't find '${objRef}'.`);
    return;
  }

  const existing = await serverTags.queryOne({ id: tagName });
  if (existing) {
    await serverTags.update({ id: tagName }, {
      ...existing,
      objectId:  target.id,
      setterId:  u.me.id,
      createdAt: existing.createdAt,
    });
    u.send(`Tag '${tagName}' updated → ${target.name}(#${target.id}).`);
  } else {
    await serverTags.create({
      id:        tagName,
      name:      tagName,
      objectId:  target.id,
      setterId:  u.me.id,
      createdAt: Date.now(),
    });
    u.send(`Tag '${tagName}' set → ${target.name}(#${target.id}).`);
  }
};
