import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * @cemit <channel>=<message>
 *
 * Sends a raw, unattributed message to a channel — no sender name or header
 * is prepended. Admin/wizard only.
 *
 * @cemit Public=The server will restart in 5 minutes.
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;
  if (!actor.flags.has("admin") && !actor.flags.has("wizard") && !actor.flags.has("superuser")) {
    u.send("Permission denied.");
    return;
  }

  const arg = (u.cmd.args[0] || "").trim();
  const eqIdx = arg.indexOf("=");
  if (eqIdx === -1) { u.send("Usage: @cemit <channel>=<message>"); return; }

  const chanName = arg.slice(0, eqIdx).trim();
  const message  = arg.slice(eqIdx + 1).trim();
  if (!chanName || !message) { u.send("Usage: @cemit <channel>=<message>"); return; }

  const channels = await u.chan.list() as Array<{ name: string }>;
  const found = channels.find(c => c.name.toLowerCase() === chanName.toLowerCase());
  if (!found) { u.send(`No channel named "${chanName}".`); return; }

  // Broadcast raw — no header, no name
  u.broadcast(`[${found.name}] ${message}`);
  u.send(`Emitted to channel ${found.name}.`);
};
