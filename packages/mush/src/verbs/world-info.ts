import { addCmd } from "../commands/addCmd.ts";
import type { IUrsamuSDK, IGameTime } from "../commands/types.ts";

export async function execStats(u: IUrsamuSDK): Promise<void> {
  const sw   = (u.cmd.args[0] || "").toLowerCase().trim();
  const full = sw === "full";

  const connectedPlayers = await u.db.search({ flags: /connected/ });
  const connected        = connectedPlayers.length;

  let rooms = 0, players = 0, exits = 0, things = 0, totalObjs = 0;
  if (full) {
    const all = await u.db.search({});
    rooms     = all.filter((o) => o.flags.has("room")).length;
    players   = all.filter((o) => o.flags.has("player")).length;
    exits     = all.filter((o) => o.flags.has("exit")).length;
    things    = all.filter((o) => !o.flags.has("room") && !o.flags.has("player") && !o.flags.has("exit")).length;
    totalObjs = all.length;
  }

  const uptimeMs  = await u.sys.uptime();
  const uptimeSec = Math.floor(uptimeMs / 1000);
  const days      = Math.floor(uptimeSec / 86400);
  const hours     = Math.floor((uptimeSec % 86400) / 3600);
  const minutes   = Math.floor((uptimeSec % 3600) / 60);
  const seconds   = uptimeSec % 60;
  const uptimeStr = days > 0
    ? `${days}d ${hours}h ${minutes}m ${seconds}s`
    : hours > 0
    ? `${hours}h ${minutes}m ${seconds}s`
    : `${minutes}m ${seconds}s`;

  u.send("%ch%cy=== Server Stats ===%cn");
  u.send(`Uptime:     ${uptimeStr}`);
  u.send(`Connected:  ${connected} player${connected === 1 ? "" : "s"}`);
  if (full) {
    u.send(`Total objs: ${totalObjs}`);
    u.send("%ch%cy--- Object Breakdown ---%cn");
    u.send(`  Rooms:   ${rooms}`);
    u.send(`  Players: ${players}`);
    u.send(`  Exits:   ${exits}`);
    u.send(`  Things:  ${things}`);
  }
  u.send("%ch%cy===================%cn");
}

export async function execTime(u: IUrsamuSDK): Promise<void> {
  const sw     = (u.cmd.args[0] || "").toLowerCase().trim();
  const argStr = (u.cmd.args[1] || "").trim();

  if (sw === "set") {
    const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
    if (!isAdmin) { u.send("Permission denied."); return; }

    const partial: Partial<IGameTime> = {};
    const validKeys = new Set(["year", "month", "day", "hour", "minute"]);
    const RANGES: Record<string, [number, number]> = {
      year: [1, 9999], month: [1, 12], day: [1, 28], hour: [0, 23], minute: [0, 59],
    };

    for (const pair of argStr.split(/\s+/)) {
      const eqIdx = pair.indexOf("=");
      if (eqIdx === -1) continue;
      const key = pair.slice(0, eqIdx).trim().toLowerCase();
      const val = parseInt(pair.slice(eqIdx + 1).trim(), 10);
      if (!validKeys.has(key) || isNaN(val)) continue;
      const [min, max] = RANGES[key];
      if (val < min || val > max) {
        u.send(`Invalid value for ${key}: must be between ${min} and ${max}.`);
        return;
      }
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
      `Day ${merged.day}, ${String(merged.hour).padStart(2, "0")}:${String(merged.minute).padStart(2, "0")}`
    );
    await u.sys.setGameTime(merged);
    return;
  }

  const gt = await u.sys.gameTime();
  const hh = String(gt.hour).padStart(2, "0");
  const mm = String(gt.minute).padStart(2, "0");
  u.send(`Game time  : Year ${gt.year}, Month ${gt.month}, Day ${gt.day}, ${hh}:${mm}`);
  u.send(`Server time: ${new Date().toUTCString()}`);
}

addCmd({
  name: "@stats",
  pattern: /^@stats(?:\/(\S+))?$/i,
  lock: "connected",
  category: "Admin",
  help: `@stats[/full]  — Show server statistics.

Switches:
  /full   Show full object breakdown.

Examples:
  @stats
  @stats/full`,
  exec: execStats,
});

addCmd({
  name: "@time",
  pattern: /^@time(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Admin",
  help: `@time[/set <key>=<val> ...]  — Show or set game time.

Switches:
  /set   Set game time fields (admin only).

Examples:
  @time
  @time/set year=2050 month=3 day=15`,
  exec: execTime,
});
