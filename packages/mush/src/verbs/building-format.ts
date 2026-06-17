/**
 * Presentation verbs: @moniker, @nameformat, @descformat, @conformat, @exitformat.
 */

import { addCmd } from "../commands/addCmd.ts";
import type { IUrsamuSDK } from "../commands/types.ts";

// ── @moniker ──────────────────────────────────────────────────────────────────

addCmd({
  name: "@moniker",
  pattern: /^[@+]?moniker\s+(.*)/i,
  lock: "connected admin+",
  category: "Building",
  help: `@moniker <target>=<moniker>  — Set the display name (moniker) for an object.

EXAMPLES
  @moniker Alice=%chAlicia%cn
  @moniker Alice=`,
  exec: async (u: IUrsamuSDK) => {
    const input  = (u.cmd.args[0] ?? "").trim();
    const eqIdx  = input.indexOf("=");
    if (eqIdx === -1) { u.send("Usage: @moniker <target>=<moniker>"); return; }
    const targetStr = input.slice(0, eqIdx).trim();
    const moniker   = input.slice(eqIdx + 1);
    if (!moniker.trim()) { u.send("Usage: @moniker <target>=<moniker>"); return; }
    const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
    if (!isAdmin) { u.send("Permission denied."); return; }
    const tar = await u.util.target(u.me, targetStr);
    if (!tar) { u.send("I can't find that."); return; }
    const stripped = u.util.stripSubs(moniker.trim());
    if (!stripped) { u.send("Moniker cannot be empty."); return; }
    await u.db.modify(tar.id, "$set", { "data.moniker": moniker.trim() });
    u.send(`Set moniker for ${tar.name} to ${moniker.trim()}.`);
  },
});

function addFormatCmd(cmdName: string, attrName: string): void {
  addCmd({
    name: cmdName,
    pattern: new RegExp(`^${cmdName}\\s+([^=]+)(?:\\s*=\\s*(.*))?$`, "i"),
    lock: "connected",
    category: "Building",
    help: `${cmdName} <target>[=<format>]  — Set or clear ${attrName} on an object.

EXAMPLES
  ${cmdName} here=%n [%l]
  ${cmdName} here=`,
    exec: async (u: IUrsamuSDK) => {
      const targetStr = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
      const format    = u.cmd.args[1] ?? "";
      const tar = await u.util.target(u.me, targetStr);
      if (!tar) { u.send("%chGame>%cn Target not found."); return; }
      if (!(await u.canEdit(u.me, tar))) { u.send("%chGame>%cn Permission denied."); return; }
      const attrs = (tar.state.attributes as Array<{ name: string }> | undefined ?? [])
        .filter((a) => a.name !== attrName);
      if (format) {
        attrs.push({ name: attrName, value: format, type: "attribute" } as never);
        await u.db.modify(tar.id, "$set", { "data.attributes": attrs });
        u.send(`%chGame>%cn Set ${cmdName} on ${tar.name}.`);
      } else {
        await u.db.modify(tar.id, "$set", { "data.attributes": attrs });
        u.send(`%chGame>%cn Cleared ${cmdName} on ${tar.name}.`);
      }
    },
  });
}

addFormatCmd("@nameformat", "NAMEFORMAT");
addFormatCmd("@descformat", "DESCFORMAT");
addFormatCmd("@conformat",  "CONFORMAT");
addFormatCmd("@exitformat", "EXITFORMAT");
