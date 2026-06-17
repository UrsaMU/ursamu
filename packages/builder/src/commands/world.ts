/**
 * Object lifecycle commands: @create, @destroy/@dest, @clone, @chown.
 */

import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";

// ── @create ───────────────────────────────────────────────────────────────────

addCmd({
  name: "@create",
  pattern: /^@?create\s+(.*)/i,
  lock: "connected builder+",
  category: "Building",
  help: `@create <name>[=<cost>]  — Create a new thing in your inventory.

EXAMPLES
  @create Widget
  @create Fancy Sword=10`,
  exec: async (u: IUrsamuSDK) => {
    const raw    = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    const eqIdx  = raw.indexOf("=");
    const name   = (eqIdx >= 0 ? raw.slice(0, eqIdx) : raw).trim();
    const costStr = eqIdx >= 0 ? raw.slice(eqIdx + 1).trim() : "0";
    if (!name) { u.send("Usage: @create <name>"); return; }
    const cost   = Math.max(0, parseInt(costStr, 10) || 0);
    const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
    const quota  = (u.me.state.quota as number) ?? 0;
    if (!isAdmin && quota < 1) {
      u.send("You don't have enough quota to create objects.");
      return;
    }
    const obj = await u.db.create({
      flags: new Set(["thing"]),
      location: u.me.id,
      name,
      state: { name, owner: u.me.id, cost },
      contents: [],
    });
    if (!isAdmin) {
      await u.db.modify(u.me.id, "$inc", { "data.quota": -1 });
    }
    u.send(`Created ${name} (#${obj.id}).`);
  },
});

// ── @destroy / @dest ──────────────────────────────────────────────────────────

addCmd({
  name: "@destroy",
  pattern: /^@?(?:dest(?:roy)?)(?:\/(\w+))?\s+(.*)/i,
  lock: "connected",
  category: "Building",
  help: `@destroy <target>  — Destroy an object permanently.

EXAMPLES
  @destroy Widget
  @dest #15`,
  exec: async (u: IUrsamuSDK) => {
    const targetStr = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    if (!targetStr) { u.send("Usage: @destroy <target>"); return; }
    const tar = await u.util.target(u.me, targetStr);
    if (!tar) { u.send("I can't find that."); return; }
    if (tar.flags.has("player")) { u.send("You can't destroy players."); return; }
    if (!(await u.canEdit(u.me, tar))) { u.send("Permission denied."); return; }
    const name = u.util.displayName(tar, u.me);
    await u.db.destroy(tar.id);
    u.send(`${name} destroyed.`);
  },
});

// ── @clone ────────────────────────────────────────────────────────────────────

addCmd({
  name: "@clone",
  pattern: /^@?clone\s+(.*)/i,
  lock: "connected builder+",
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

// ── @chown ────────────────────────────────────────────────────────────────────

addCmd({
  name: "@chown",
  pattern: /^@?chown\s+(.*)/i,
  lock: "connected admin+",
  category: "Building",
  help: `@chown <target>=<player>  — Transfer ownership (admin+).

EXAMPLES
  @chown Widget=Alice
  @chown #12=Bob`,
  exec: async (u: IUrsamuSDK) => {
    const raw   = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    const eq    = raw.indexOf("=");
    if (eq === -1) { u.send("Usage: @chown <target>=<player>"); return; }
    const targetStr = raw.slice(0, eq).trim();
    const playerStr = raw.slice(eq + 1).trim();
    if (!playerStr) { u.send("Usage: @chown <target>=<player>"); return; }
    const tar = await u.util.target(u.me, targetStr, true);
    if (!tar) { u.send("I can't find that."); return; }
    if (tar.flags.has("player")) { u.send("You can't @chown players."); return; }
    const newOwner = await u.util.target(u.me, playerStr, true);
    if (!newOwner) { u.send(`I can't find player '${playerStr}'.`); return; }
    if (!newOwner.flags.has("player")) { u.send(`${u.util.displayName(newOwner, u.me)} is not a player.`); return; }
    await u.db.modify(tar.id, "$set", { "data.owner": newOwner.id });
    u.send(`${u.util.displayName(tar, u.me)} transferred to ${u.util.displayName(newOwner, u.me)}.`);
  },
});
