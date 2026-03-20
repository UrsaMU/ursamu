import { IUrsamuSDK } from "../../@types/UrsamuSDK.ts";

/**
 * Rhost Vision: emit.ts
 * @emit <message> — broadcasts to current room (no room target needed).
 * Staff only (admin/wizard/superuser).
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;
  if (!actor.flags.has("admin") && !actor.flags.has("wizard") && !actor.flags.has("superuser")) {
    u.send("Permission denied.");
    return;
  }

  const message = (u.cmd.args[0] || "").trim();

  if (!message) {
    u.send("Usage: @emit <message>");
    return;
  }

  u.here.broadcast(message);
};
