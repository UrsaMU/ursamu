import { addCmd } from "../services/commands/index.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

export async function execMoniker(u: IUrsamuSDK): Promise<void> {
  const input = (u.cmd.args[0] || "").trim();
  const eqIdx = input.indexOf("=");
  if (eqIdx === -1) { u.send("Usage: @moniker <target>=<moniker>"); return; }

  const name = input.slice(0, eqIdx).trim();
  const moniker = input.slice(eqIdx + 1);

  if (!moniker.trim()) { u.send("Usage: @moniker <target>=<moniker>"); return; }

  const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
  if (!isAdmin) { u.send("Permission denied."); return; }

  const tar = await u.util.target(u.me, name);
  if (!tar) { u.send("I can't find that."); return; }

  const stripped = u.util.stripSubs(moniker.trim());
  if (!stripped) { u.send("Moniker cannot be empty."); return; }

  await u.db.modify(tar.id, "$set", { "data.moniker": moniker.trim() });
  u.send(`Set moniker for ${tar.name} to ${moniker.trim()}.`);
}

export default () =>
  addCmd({
    name: "@moniker",
    pattern: /^[@+]?moniker\s+(.*)/i,
    lock: "connected & admin+",
    help: `@moniker <target>=<moniker>  — Set the display name (moniker) for an object.

Examples:
  @moniker Alice=%chAlicia%cn`,
    exec: execMoniker,
  });
