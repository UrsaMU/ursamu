/**
 * Core building verbs: @desc, @parent, @link, @clone, @dest/@destroy, @name,
 * @moniker, @nameformat, @descformat, @conformat, @exitformat.
 */

import { addCmd } from "../commands/addCmd.ts";
import type { IUrsamuSDK } from "../commands/types.ts";

// ── shared helpers ────────────────────────────────────────────────────────────

async function setAttr(
  u: IUrsamuSDK,
  attrKey: string,
  usage: string,
): Promise<void> {
  const raw    = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
  const eqIdx  = raw.indexOf("=");
  if (eqIdx === -1) { u.send(`Usage: ${usage}`); return; }
  const targetStr = raw.slice(0, eqIdx).trim();
  const value     = (u.cmd.args[0] ?? "").slice(eqIdx + 1);
  const tar       = await u.util.target(u.me, targetStr);
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
    const raw    = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    const eqIdx  = raw.indexOf("=");
    if (eqIdx === -1) { u.send("Usage: @parent <target>=<parent>"); return; }
    const targetStr = raw.slice(0, eqIdx).trim();
    const parentStr = raw.slice(eqIdx + 1).trim();
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

// ── @link ─────────────────────────────────────────────────────────────────────

addCmd({
  name: "@link",
  pattern: /^@?link\s+(.*)/i,
  lock: "connected",
  category: "Building",
  help: `@link <target>=<destination>  — Set the home/destination of an object or exit.

EXAMPLES
  @link me=Lobby
  @link north exit=#5`,
  exec: async (u: IUrsamuSDK) => {
    const raw    = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    const eqIdx  = raw.indexOf("=");
    if (eqIdx === -1) { u.send("Usage: @link <target>=<destination>"); return; }
    const targetStr = raw.slice(0, eqIdx).trim();
    const destStr   = raw.slice(eqIdx + 1).trim();
    const tar = await u.util.target(u.me, targetStr);
    if (!tar) { u.send("I can't find that."); return; }
    if (!(await u.canEdit(u.me, tar))) { u.send("Permission denied."); return; }
    if (!destStr) {
      await u.db.modify(tar.id, "$unset", { "data.home": "" });
      u.send(`Link cleared on ${u.util.displayName(tar, u.me)}.`);
      return;
    }
    const dest = await u.util.target(u.me, destStr);
    if (!dest) { u.send(`I can't find '${destStr}'.`); return; }
    const field = tar.flags.has("exit") ? "data.destination" : "data.home";
    await u.db.modify(tar.id, "$set", { [field]: dest.id });
    u.send(`${u.util.displayName(tar, u.me)} linked to ${u.util.displayName(dest, u.me)}.`);
  },
});

// ── @clone ────────────────────────────────────────────────────────────────────

addCmd({
  name: "@clone",
  pattern: /^@?clone\s+(.*)/i,
  lock: "connected",
  category: "Building",
  help: `@clone <target>[=<new name>]  — Clone an object with all attributes.

EXAMPLES
  @clone Sword
  @clone #5=Vorpal Sword`,
  exec: async (u: IUrsamuSDK) => {
    const raw     = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    const eqIdx   = raw.indexOf("=");
    const srcStr  = eqIdx >= 0 ? raw.slice(0, eqIdx).trim() : raw;
    const newName = eqIdx >= 0 ? raw.slice(eqIdx + 1).trim() : "";
    const src     = await u.util.target(u.me, srcStr);
    if (!src) { u.send("I can't find that."); return; }
    if (src.flags.has("player")) { u.send("You can't clone players."); return; }
    if (!(await u.canEdit(u.me, src))) { u.send("Permission denied."); return; }
    const cloneName  = newName || src.name || "Clone";
    const cloneState = { ...(src.state as Record<string, unknown>), name: cloneName, owner: u.me.id };
    delete (cloneState as Record<string, unknown>).lock;
    const clone = await u.db.create({
      flags: src.flags, location: u.me.id,
      state: cloneState, name: cloneName, contents: [],
    });
    u.send(`Cloned ${u.util.displayName(src, u.me)} as ${cloneName} (#${clone.id}).`);
  },
});

// ── @dest / @destroy ──────────────────────────────────────────────────────────

addCmd({
  name: "@dest",
  pattern: /^@?dest(?:ruct)?(?:\/(\w+))?\s+(.*)/i,
  lock: "connected",
  category: "Building",
  help: `@dest <target>  — Destroy an object immediately.

EXAMPLES
  @dest #15
  @dest/instant BadObject`,
  exec: async (u: IUrsamuSDK) => {
    const targetStr = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    if (!targetStr) { u.send("Usage: @dest <target>"); return; }
    const tar = await u.util.target(u.me, targetStr);
    if (!tar) { u.send("I can't find that."); return; }
    if (tar.flags.has("player")) { u.send("You can't destroy players."); return; }
    if (!(await u.canEdit(u.me, tar))) { u.send("Permission denied."); return; }
    const name = u.util.displayName(tar, u.me);
    await u.db.destroy(tar.id);
    u.send(`${name} destroyed.`);
  },
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
    if (!(await u.canEdit(u.me, tar))) { u.send("I can't find that."); return; }
    await u.db.modify(tar.id, "$set", { "data.name": newName });
    await u.db.modify(tar.id, "$unset", { "data.moniker": "" });
    u.send("Name set.");
  },
});

// @moniker and format commands live in building-format.ts
