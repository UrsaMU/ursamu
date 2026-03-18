import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

export const aliases = ["chandestroy", "@chandestroy"];

/**
 * System Script: chandestroy.ts
 * Destroys an existing channel. Admin/wizard only.
 * Usage: @chandestroy <name>
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;

  if (!actor.flags.has("admin") && !actor.flags.has("wizard") && !actor.flags.has("superuser")) {
    u.send("Permission denied.");
    return;
  }

  const name = (u.cmd.args[0] || "").trim().toLowerCase();

  if (!name) {
    u.send("Usage: @chandestroy <name>");
    return;
  }

  const result = await u.chan.destroy(name) as { error?: string };

  if (result?.error) {
    u.send(result.error);
    return;
  }

  u.send(`Channel %ch${name}%cn has been destroyed.`);
};
