import type { IUrsamuSDK } from "jsr:@ursamu/ursamu";

export const aliases = ["desc", "description"];

/**
 * @describe <target>=<description>
 *
 * Sets the description on an object. Aliases: @desc, @description.
 *
 * Examples:
 *   @describe here=A dimly lit room with stone walls.
 *   @desc widget=A battered old widget.
 */
export default async (u: IUrsamuSDK) => {
  const input = (u.cmd.args[0] || "").trim();
  const eqIdx = input.indexOf("=");

  if (eqIdx === -1) {
    u.send("Usage: @describe <target>=<description>");
    return;
  }

  const targetName = input.slice(0, eqIdx).trim();
  const description = input.slice(eqIdx + 1).trim();

  if (!targetName) {
    u.send("Usage: @describe <target>=<description>");
    return;
  }

  const targets = await u.db.search(targetName);
  const target  = targets[0];
  if (!target) { u.send(`I can't find "${targetName}" here.`); return; }
  if (!(await u.canEdit(u.me, target))) { u.send("Permission denied."); return; }

  if (description.length > 4096) {
    u.send("Description too long (max 4096 characters).");
    return;
  }

  await u.db.modify(target.id, "$set", { "data.description": description });
  u.send("Set.");
};
