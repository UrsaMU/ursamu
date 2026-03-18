import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * @password <oldpass>=<newpass>         — change your own password
 * @password <player>=<newpass>          — superuser/admin: set someone's password
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;
  const input = (u.cmd.args[0] || "").trim();
  const isStaff = actor.flags.has("superuser") || actor.flags.has("admin") || actor.flags.has("wizard");

  const eqIdx = input.indexOf("=");
  if (eqIdx === -1 || !input) {
    if (isStaff) {
      u.send("Usage: @password <oldpass>=<newpass>  OR  @password <player>=<newpass>");
    } else {
      u.send("Usage: @password <oldpass>=<newpass>");
    }
    return;
  }

  const left = input.slice(0, eqIdx).trim();
  const newPass = input.slice(eqIdx + 1).trim();

  if (!newPass) {
    u.send("New password cannot be empty.");
    return;
  }

  if (newPass.length < 5) {
    u.send("Password must be at least 5 characters.");
    return;
  }

  // Staff: check if left side is a player name (not a password)
  if (isStaff) {
    const results = await u.db.search(left);
    const target = results.find(obj => obj.flags.has("player"));

    if (target && target.id !== actor.id) {
      // Staff setting someone else's password
      await u.auth.setPassword(target.id, newPass);
      u.send(`Password for ${target.name || target.id} has been changed.`);
      u.send(`Your password has been changed by staff.`, target.id);
      return;
    }
  }

  // Self-service: left side is old password
  const oldPass = left;
  const match = await u.auth.verify(actor.state.name as string, oldPass);

  if (!match) {
    u.send("Incorrect old password.");
    return;
  }

  await u.auth.setPassword(actor.id, newPass);
  u.send("Your password has been changed.");
};
