/**
 * Display attribute commands: @desc, @name, @parent, @moniker, format attrs.
 */

import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";

// ── shared helper ─────────────────────────────────────────────────────────────

async function setAttr(u: IUrsamuSDK, attrKey: string, usage: string): Promise<void> {
  const raw   = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
  const eq    = raw.indexOf("=");
  if (eq === -1) { u.send(`Usage: ${usage}`); return; }
  const targetStr = raw.slice(0, eq).trim();
  const value     = (u.cmd.args[0] ?? "").slice(eq + 1);
  const tar = await u.util.target(u.me, targetStr);
  if (!tar) { u.send("I can't find that."); return; }
  if (!(await u.canEdit(u.me, tar))) { u.send("Permission denied."); return; }
  await u.db.modify(tar.id, "$set", { [`data.${attrKey}`]: value });
  u.send(`${attrKey.toUpperCase()} set on ${u.util.displayName(tar, u.me)}.`);
}

// ── @desc ─────────────────────────────────────────────────────────────────────

addCmd({
  name: "@desc",
  pattern: /^@?desc(?:ribe)?\s+(.*)/i,
  lock: "connected",
  category: "Building",
  help: `@desc <target>=<description>  — Set the description of an object.

EXAMPLES
  @desc me=A tall figure in dark robes.
  @desc here=A cozy room lit by firelight.`,
  exec: (u) => setAttr(u, "description", "@desc <target>=<description>"),
});

// ── @name ─────────────────────────────────────────────────────────────────────

addCmd({
  name: "@name",
  pattern: /^[@/+]?name\s+(.*)\s*=\s*(.*)/i,
  lock: "connected",
  category: "Building",
  help: `@name <target>=<new name>  — Rename an object.

EXAMPLES
  @name me=Galadriel
  @name #5=Shiny Sword`,
  exec: async (u: IUrsamuSDK) => {
    const targetStr = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    const newName   = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    if (!targetStr || !newName) { u.send("Usage: @name <target>=<new name>"); return; }
    const tar = await u.util.target(u.me, targetStr, true);
    if (!tar) { u.send("I can't find that."); return; }
    if (!(await u.canEdit(u.me, tar))) { u.send("Permission denied."); return; }
    await u.db.modify(tar.id, "$set", { "data.name": newName });
    await u.db.modify(tar.id, "$unset", { "data.moniker": "" });
    u.send("Name set.");
  },
});

// ── @parent ───────────────────────────────────────────────────────────────────

addCmd({
  name: "@parent",
  pattern: /^@?parent\s+(.*)/i,
  lock: "connected",
  category: "Building",
  help: `@parent <target>=<parent>  — Set parent object for attribute inheritance.

EXAMPLES
  @parent #5=#10
  @parent widget=ParentObj`,
  exec: async (u: IUrsamuSDK) => {
    const raw   = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    const eq    = raw.indexOf("=");
    if (eq === -1) { u.send("Usage: @parent <target>=<parent>"); return; }
    const targetStr = raw.slice(0, eq).trim();
    const parentStr = raw.slice(eq + 1).trim();
    const tar = await u.util.target(u.me, targetStr);
    if (!tar) { u.send("I can't find that."); return; }
    if (!(await u.canEdit(u.me, tar))) { u.send("Permission denied."); return; }
    if (!parentStr) {
      await u.db.modify(tar.id, "$unset", { "data.parent": "" });
      u.send(`Parent cleared on ${u.util.displayName(tar, u.me)}.`);
      return;
    }
    const parent = await u.util.target(u.me, parentStr);
    if (!parent) { u.send(`I can't find parent '${parentStr}'.`); return; }
    await u.db.modify(tar.id, "$set", { "data.parent": parent.id });
    u.send(`Parent of ${u.util.displayName(tar, u.me)} set to ${u.util.displayName(parent, u.me)}.`);
  },
});

// ── @moniker ──────────────────────────────────────────────────────────────────

addCmd({
  name: "@moniker",
  pattern: /^[@+]?moniker\s+(.*)/i,
  lock: "connected admin+",
  category: "Building",
  help: `@moniker <target>=<moniker>  — Set display name for an object (admin+).

EXAMPLES
  @moniker Alice=%chAlicia%cn
  @moniker #5=The Old Wizard`,
  exec: async (u: IUrsamuSDK) => {
    const input  = (u.cmd.args[0] ?? "").trim();
    const eq     = input.indexOf("=");
    if (eq === -1) { u.send("Usage: @moniker <target>=<moniker>"); return; }
    const targetStr = input.slice(0, eq).trim();
    const moniker   = input.slice(eq + 1);
    const stripped  = u.util.stripSubs(moniker.trim());
    if (!stripped) { u.send("Moniker cannot be empty."); return; }
    const tar = await u.util.target(u.me, targetStr);
    if (!tar) { u.send("I can't find that."); return; }
    await u.db.modify(tar.id, "$set", { "data.moniker": moniker.trim() });
    u.send(`Set moniker for ${tar.name} to ${moniker.trim()}.`);
  },
});

// ── format attribute commands ─────────────────────────────────────────────────

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
