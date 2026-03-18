import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * @wall <message>  — broadcast a message to all connected players
 * Superuser/admin/wizard only.
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;

  if (!actor.flags.has("superuser") && !actor.flags.has("admin") && !actor.flags.has("wizard")) {
    u.send("Permission denied.");
    return;
  }

  const message = (u.cmd.args[0] || "").trim();

  if (!message) {
    u.send("Usage: @wall <message>");
    return;
  }

  const actorName = (actor.state.moniker as string) || (actor.state.name as string) || actor.name || "Staff";
  u.broadcast(`%ch%cy[WALL]%cn ${actorName}: ${message}`);
  u.send("Message broadcast to all connected players.");
};
