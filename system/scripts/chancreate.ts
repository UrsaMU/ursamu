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

  const input = (u.cmd.args[0] || "").trim();
  if (!input) {
    u.send("Usage: @chancreate <name>[=<header>]");
    return;
  }

  const eqIdx = input.indexOf("=");
  const namePart = eqIdx >= 0 ? input.slice(0, eqIdx).trim() : input.trim();
  const valuePart = eqIdx >= 0 ? input.slice(eqIdx + 1).trim() : "";
  const name = namePart.toLowerCase();
  const switches = u.cmd.switches || [];
  const isLockSwitch = switches.includes("lock");
  const hidden = switches.includes("hidden");
  const header = isLockSwitch ? `[${name.toUpperCase()}]` : (valuePart || `[${name.toUpperCase()}]`);
  const lock = isLockSwitch ? valuePart : "";

  const result = await u.chan.create(name, { header, lock, hidden }) as { error?: string };

  if (result?.error) {
    u.send(result.error);
    return;
  }

  let msg = `Channel %ch${name}%cn created with header "${header}".`;
  if (lock) msg += ` Lock: ${lock}`;
  if (hidden) msg += ` (hidden)`;
  u.send(msg);
};
