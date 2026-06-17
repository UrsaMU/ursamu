/**
 * Exit management commands: @dig, @open, @link, @unlink.
 */

import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";

// ── @dig ──────────────────────────────────────────────────────────────────────

addCmd({
  name: "@dig",
  pattern: /^@?dig(?:\/(teleport|tel))?\s+(.*)/i,
  lock: "connected builder+",
  category: "Building",
  help: `@dig[/teleport] <room>[=<to exit>[,<from exit>]]
  — Create a room and optional connecting exits.

EXAMPLES
  @dig Library
  @dig Library=North;N,South;S
  @dig/teleport Storage Room=To Storage,Back`,
  exec: async (u: IUrsamuSDK) => {
    const swtch    = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const fullArgs = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const match    = fullArgs.match(/^([^=,]+)(?:\s*=\s*([^,]+))?(?:,\s*(.*))?/i);
    if (!match || !match[1].trim()) {
      u.send("Usage: @dig[/teleport] <room>[=<to exit>[,<from exit>]]");
      return;
    }
    const roomName = match[1].trim();
    const toExit   = match[2]?.trim() ?? "";
    const fromExit = match[3]?.trim() ?? "";
    const isAdmin  = u.me.flags.has("wizard") || u.me.flags.has("admin") || u.me.flags.has("superuser");
    const cost     = 10 + (toExit ? 2 : 0) + (fromExit ? 2 : 0);
    const quota    = (u.me.state.quota as number) ?? 0;
    if (!isAdmin && quota < cost) {
      u.send(`Not enough quota. Cost: ${cost}, You have: ${quota}.`);
      return;
    }
    const room = await u.db.create({
      flags: new Set(["room"]),
      state: { name: roomName, owner: u.me.id },
      contents: [],
    });
    u.send(`Room %ch${roomName}%cn created with dbref %ch#${room.id}%cn.`);
    if (toExit) {
      const toObj = await u.db.create({
        flags: new Set(["exit"]), location: u.here.id,
        state: { name: toExit, destination: room.id, owner: u.me.id }, contents: [],
      });
      u.send(`Exit %ch${toExit.split(";")[0]}%cn created with dbref %ch#${toObj.id}%cn.`);
    }
    if (fromExit) {
      const fromObj = await u.db.create({
        flags: new Set(["exit"]), location: room.id,
        state: { name: fromExit, destination: u.here.id, owner: u.me.id }, contents: [],
      });
      u.send(`Exit %ch${fromExit.split(";")[0]}%cn created with dbref %ch#${fromObj.id}%cn.`);
    }
    if (!isAdmin) {
      await u.db.modify(u.me.id, "$inc", { "data.quota": -cost });
    }
    if (swtch === "teleport" || swtch === "tel") {
      u.teleport(u.me.id, room.id);
      u.send(`You teleport to ${roomName}.`);
    }
  },
});

// ── @open ─────────────────────────────────────────────────────────────────────

addCmd({
  name: "@open",
  pattern: /^@?open(?:\/(inventory))?\s+(.*)/i,
  lock: "connected builder+",
  category: "Building",
  help: `@open[/inventory] <name>=<room>[,<back exit>]
  — Create one or two exits to a destination.

EXAMPLES
  @open North;N=#5
  @open North;N=Library,South;S`,
  exec: async (u: IUrsamuSDK) => {
    const swtch    = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const fullArgs = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const match    = fullArgs.match(/^([^=,]+)\s*=\s*([^,]+)(?:,\s*(.*))?/i);
    if (!match) { u.send("Usage: @open[/inventory] <name>=<room>[,<back exit>]"); return; }
    const exitName     = match[1].trim();
    const destName     = match[2].trim();
    const backExitName = match[3]?.trim() ?? "";
    const results      = await u.db.search(destName);
    const dest         = results[0];
    if (!dest) { u.send(`Could not find destination room: ${destName}`); return; }
    const isAdmin = u.me.flags.has("wizard") || u.me.flags.has("admin") || u.me.flags.has("superuser");
    const cost    = 1 + (backExitName ? 1 : 0);
    const quota   = (u.me.state.quota as number) ?? 0;
    if (!isAdmin && quota < cost) {
      u.send(`Not enough quota. Cost: ${cost}, You have: ${quota}.`);
      return;
    }
    if (backExitName && !(await u.canEdit(u.me, dest))) {
      u.send("Permission denied: can't create a back exit in that room.");
      return;
    }
    const location = swtch === "inventory" ? u.me.id : u.here.id;
    const exitObj  = await u.db.create({
      flags: new Set(["exit"]), location,
      state: { name: exitName, destination: dest.id, owner: u.me.id }, contents: [],
    });
    u.send(`Exit %ch${exitName.split(";")[0]}%cn (#${exitObj.id}) opened to ${u.util.displayName(dest, u.me)}.`);
    if (backExitName) {
      const backObj = await u.db.create({
        flags: new Set(["exit"]), location: dest.id,
        state: { name: backExitName, destination: u.here.id, owner: u.me.id }, contents: [],
      });
      u.send(`Back exit %ch${backExitName.split(";")[0]}%cn (#${backObj.id}) opened to ${u.here.name}.`);
    }
    if (!isAdmin) {
      await u.db.modify(u.me.id, "$inc", { "data.quota": -cost });
    }
  },
});

// ── @link ─────────────────────────────────────────────────────────────────────

addCmd({
  name: "@link",
  pattern: /^@?link\s+(.*)/i,
  lock: "connected",
  category: "Building",
  help: `@link <target>=<destination>  — Set home or destination of an object.

EXAMPLES
  @link me=Lobby
  @link north exit=#5`,
  exec: async (u: IUrsamuSDK) => {
    const raw   = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    const eq    = raw.indexOf("=");
    if (eq === -1) { u.send("Usage: @link <target>=<destination>"); return; }
    const targetStr = raw.slice(0, eq).trim();
    const destStr   = raw.slice(eq + 1).trim();
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

// ── @unlink ───────────────────────────────────────────────────────────────────

addCmd({
  name: "@unlink",
  pattern: /^@?unlink\s+(.*)/i,
  lock: "connected",
  category: "Building",
  help: `@unlink <target>  — Remove the destination/home link from an object.

EXAMPLES
  @unlink north exit
  @unlink #7`,
  exec: async (u: IUrsamuSDK) => {
    const targetStr = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    if (!targetStr) { u.send("Usage: @unlink <target>"); return; }
    const tar = await u.util.target(u.me, targetStr);
    if (!tar) { u.send("I can't find that."); return; }
    if (!(await u.canEdit(u.me, tar))) { u.send("Permission denied."); return; }
    const field = tar.flags.has("exit") ? "data.destination" : "data.home";
    await u.db.modify(tar.id, "$unset", { [field]: "" });
    u.send(`${u.util.displayName(tar, u.me)} unlinked.`);
  },
});
