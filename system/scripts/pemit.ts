import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * @pemit <player>=<message>
 * Send a private message to any connected player, globally. Admin/wizard only.
 * No attribution — message appears as raw text.
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;
  if (!actor.flags.has("admin") && !actor.flags.has("wizard") && !actor.flags.has("superuser")) {
    u.send("Permission denied.");
    return;
  }

  const arg = u.cmd.args[0] || "";
  const eqIdx = arg.indexOf("=");
  if (eqIdx === -1) {
    u.send("Usage: @pemit <player>=<message>");
    return;
  }

  const playerRef = arg.slice(0, eqIdx).trim();
  const message = arg.slice(eqIdx + 1);

  if (!playerRef || !message) {
    u.send("Usage: @pemit <player>=<message>");
    return;
  }

  const results = await u.db.search(playerRef);
  const target = results[0];
  if (!target) {
    u.send(`I can't find a player called '${playerRef}'.`);
    return;
  }

  if (!target.flags.has("connected")) {
    u.send(`${u.util.displayName(target, actor)} is not connected.`);
    return;
  }

  u.send(message, target.id);
  u.send(`Message sent to ${u.util.displayName(target, actor)}.`);
};
