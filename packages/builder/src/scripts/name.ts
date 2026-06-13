import type { IUrsamuSDK } from "jsr:@ursamu/ursamu";

export const aliases = ["name"];

/**
 * @name <target>=<newname>
 *
 * Renames an object. Checks for name collisions (case-insensitive).
 * Clears the moniker when a player is renamed.
 *
 * Examples:
 *   @name widget=Shiny Widget
 *   @name here=The Great Hall
 */
export default async (u: IUrsamuSDK) => {
  const input = (u.cmd.args[0] || "").trim();
  const eqIdx = input.indexOf("=");

  if (eqIdx === -1 || !input.slice(0, eqIdx).trim() || !input.slice(eqIdx + 1).trim()) {
    u.send("Usage: @name <target>=<newname>");
    return;
  }

  const targetName = input.slice(0, eqIdx).trim();
  const newName    = input.slice(eqIdx + 1).trim();

  if (newName.length > 200) { u.send("Name too long (max 200 characters)."); return; }

  const target = await u.util.target(u.me, targetName, true);
  if (!target) { u.send("I can't find that."); return; }
  if (!(await u.canEdit(u.me, target))) { u.send("Permission denied."); return; }

  // Collision check
  const esc      = newName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const existing = await u.db.search({ "data.name": new RegExp(`^${esc}$`, "i") });
  if (existing.length > 0 && existing[0].id !== target.id) {
    u.send("That name is already taken.");
    return;
  }

  if (target.flags.has("player")) {
    const aliasTaken = await u.db.search({ "data.alias": new RegExp(`^${esc}$`, "i") });
    if (aliasTaken.length > 0 && aliasTaken[0].id !== target.id) {
      u.send("That name is taken as an alias.");
      return;
    }
    // Clear moniker when name changes
    await u.db.modify(target.id, "$unset", { "data.moniker": 1 });
  }

  await u.db.modify(target.id, "$set", { "data.name": newName });
  u.send("Name set.");
};
