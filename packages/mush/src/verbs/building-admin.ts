/**
 * Admin/information world verbs: @find, @teleport, @stats, @time, @entrances.
 */

import { addCmd } from "../commands/addCmd.ts";
import type { IUrsamuSDK, IGameTime } from "../commands/types.ts";

// ── @find ─────────────────────────────────────────────────────────────────────

addCmd({
  name: "@find",
  pattern: /^@?find(?:\/(flag|type))?\s*(.*)/i,
  lock: "connected",
  category: "Building",
  help: `@find <name>        — Search objects by name.
@find/flag <flag>   — Search by flag.
@find/type <type>   — Search by type.

EXAMPLES
  @find Sword
  @find/flag admin
  @find/type room`,
  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = (u.cmd.args[1] ?? "").trim();
    if (!arg) { u.send("Usage: @find <name>  |  @find/flag <flag>  |  @find/type <type>"); return; }
    const escaped = arg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let results;
    if (sw === "flag") {
      results = await u.db.search({ flags: new RegExp(escaped, "i") });
    } else if (sw === "type") {
      results = await u.db.search({ flags: new RegExp(`\\b${escaped}\\b`, "i") });
    } else {
      results = await u.db.search({ "data.name": new RegExp(escaped, "i") });
    }
    if (!results.length) { u.send(`No objects found matching '${arg}'.`); return; }
    u.send(`%chFound ${results.length} object${results.length === 1 ? "" : "s"}:%cn`);
    for (const obj of results) {
      const name     = (obj.state?.name as string | undefined) || obj.name || "(unnamed)";
      const flagList = obj.flags instanceof Set ? [...obj.flags].join(" ") : String(obj.flags);
      u.send(`  #${obj.id}  ${name}  [${flagList}]`);
    }
  },
});

// ── @teleport ─────────────────────────────────────────────────────────────────

addCmd({
  name: "@teleport",
  pattern: /^@?teleport\s+(.*)/i,
  lock: "connected builder+",
  category: "Building",
  help: `@teleport <target>=<destination>  — Teleport an object to a destination.

EXAMPLES
  @teleport me=Lobby
  @teleport sword=#5`,
  exec: async (u: IUrsamuSDK) => {
    const input = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    const match = input.match(/^(.+?)\s*=\s*(.*)$/);
    if (!match) { u.send("Usage: @teleport <target>=<destination>"); return; }
    const targetName = match[1].trim();
    const destName   = match[2].trim();
    const results    = await u.db.search(targetName);
    const target     = results[0];
    if (!target) { u.send(`Could not find target: ${targetName}`); return; }
    if (!(await u.canEdit(u.me, target))) { u.send("Permission denied."); return; }
    const destResults   = await u.db.search(destName);
    const destination   = destResults[0];
    if (!destination) { u.send(`Could not find destination: ${destName}`); return; }
    const canEnter = (await u.canEdit(u.me, destination)) || destination.flags.has("enter_ok");
    if (!canEnter) { u.send("Permission denied (destination check)."); return; }
    u.teleport(target.id, destination.id);
    u.send(`You teleport ${u.util.displayName(target, u.me)} to ${u.util.displayName(destination, u.me)}.`);
  },
});

// ── @stats ────────────────────────────────────────────────────────────────────

addCmd({
  name: "@stats",
  pattern: /^@?stats(?:\/(full))?\s*$/i,
  lock: "connected",
  category: "Information",
  help: `@stats       — Show server summary.
@stats/full  — Show detailed object breakdown.

EXAMPLES
  @stats
  @stats/full`,
  exec: async (u: IUrsamuSDK) => {
    const sw   = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const full = sw === "full";
    const connectedPlayers = await u.db.search({ flags: /connected/ });
    const connected        = connectedPlayers.length;
    let rooms = 0, players = 0, exits = 0, things = 0, total = 0;
    if (full) {
      const all = await u.db.search({});
      total   = all.length;
      rooms   = all.filter((o) => o.flags.has("room")).length;
      players = all.filter((o) => o.flags.has("player")).length;
      exits   = all.filter((o) => o.flags.has("exit")).length;
      things  = all.filter((o) => !o.flags.has("room") && !o.flags.has("player") && !o.flags.has("exit")).length;
    }
    const uptimeMs  = await u.sys.uptime();
    const uptimeSec = Math.floor(uptimeMs / 1000);
    const days    = Math.floor(uptimeSec / 86400);
    const hours   = Math.floor((uptimeSec % 86400) / 3600);
    const minutes = Math.floor((uptimeSec % 3600) / 60);
    const seconds = uptimeSec % 60;
    const uptimeStr = days > 0
      ? `${days}d ${hours}h ${minutes}m ${seconds}s`
      : hours > 0 ? `${hours}h ${minutes}m ${seconds}s` : `${minutes}m ${seconds}s`;
    u.send("%ch%cy=== Server Stats ===%cn");
    u.send(`Uptime:     ${uptimeStr}`);
    u.send(`Connected:  ${connected} player${connected === 1 ? "" : "s"}`);
    if (full) {
      u.send(`Total objs: ${total}`);
      u.send("%ch%cy--- Object Breakdown ---%cn");
      u.send(`  Rooms:   ${rooms}`);
      u.send(`  Players: ${players}`);
      u.send(`  Exits:   ${exits}`);
      u.send(`  Things:  ${things}`);
    }
    u.send("%ch%cy===================%cn");
  },
});

// ── @time ─────────────────────────────────────────────────────────────────────

addCmd({
  name: "@time",
  pattern: /^@?time(?:\/(set))?\s*(.*)?$/i,
  lock: "connected",
  category: "Information",
  help: `@time                 — Display current game and server time.
@time/set key=val ...  — Set game clock fields (admin+).

Valid keys: year (1-9999), month (1-12), day (1-28), hour (0-23), minute (0-59)

EXAMPLES
  @time
  @time/set year=5 month=3 day=1 hour=12 minute=0`,
  exec: async (u: IUrsamuSDK) => {
    const sw     = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const argStr = (u.cmd.args[1] ?? "").trim();
    if (sw === "set") {
      const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
      if (!isAdmin) { u.send("Permission denied."); return; }
      const RANGES: Record<string, [number, number]> = {
        year: [1, 9999], month: [1, 12], day: [1, 28], hour: [0, 23], minute: [0, 59],
      };
      const partial: Partial<IGameTime> = {};
      for (const pair of argStr.split(/\s+/)) {
        const idx = pair.indexOf("=");
        if (idx === -1) continue;
        const key = pair.slice(0, idx).trim().toLowerCase();
        const val = parseInt(pair.slice(idx + 1).trim(), 10);
        if (!(key in RANGES) || isNaN(val)) continue;
        const [min, max] = RANGES[key];
        if (val < min || val > max) { u.send(`Invalid value for ${key}: must be between ${min} and ${max}.`); return; }
        (partial as Record<string, number>)[key] = val;
      }
      if (Object.keys(partial).length === 0) {
        u.send("Usage: @time/set year=<n> month=<n> day=<n> hour=<n> minute=<n>");
        return;
      }
      const current = await u.sys.gameTime();
      const merged: IGameTime = { ...current, ...partial };
      u.send(
        `%chGame>%cn Setting game time to: Year ${merged.year}, Month ${merged.month}, ` +
        `Day ${merged.day}, ${String(merged.hour).padStart(2, "0")}:${String(merged.minute).padStart(2, "0")}`,
      );
      await u.sys.setGameTime(merged);
      return;
    }
    const gt = await u.sys.gameTime();
    const hh = String(gt.hour).padStart(2, "0");
    const mm = String(gt.minute).padStart(2, "0");
    u.send(`Game time  : Year ${gt.year}, Month ${gt.month}, Day ${gt.day}, ${hh}:${mm}`);
    u.send(`Server time: ${new Date().toUTCString()}`);
  },
});

// @entrances lives in building-query.ts
