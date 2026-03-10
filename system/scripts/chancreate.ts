import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

export const aliases = ["chancreate", "@chancreate"];

/**
 * System Script: chancreate.ts
 * Creates a new channel. Admin/wizard only.
 * Usage: @chancreate <name>[=<header>]
 *        @chancreate/hidden <name>[=<header>]
 *        @chancreate/lock <name>=<lock expression>
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;

  if (!actor.flags.has("admin") && !actor.flags.has("wizard") && !actor.flags.has("superuser")) {
    u.send("Permission denied.");
    return;
  }

  const input = u.cmd.args.join(" ").trim();
  if (!input) {
    u.send("Usage: @chancreate <name>[=<header>]");
    return;
  }

  const [namePart, headerPart] = input.split("=").map(s => s.trim());
  const name = namePart.toLowerCase();
  const header = headerPart || `[${name.toUpperCase()}]`;
  const hidden = (u.cmd.switches || []).includes("hidden");
  const lock = (u.cmd.switches || []).includes("lock") ? headerPart || "" : "";

  const result = await u.chan.create(name, { header, lock, hidden }) as { error?: string };

  if (result?.error) {
    u.send(result.error);
    return;
  }

  u.send(`Channel %ch${name}%cn created with header "${header}".`);
};
