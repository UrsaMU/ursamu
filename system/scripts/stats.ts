import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * @stats         — server summary (object counts, connected players, uptime)
 * @stats/full    — detailed breakdown
 */
export default async (u: IUrsamuSDK) => {
  const switches = u.cmd.switches || [];
  const full = switches.includes("full");

  // Object counts
  const all = await u.db.search({});
  const rooms   = all.filter(o => o.flags.has("room")).length;
  const players = all.filter(o => o.flags.has("player")).length;
  const exits   = all.filter(o => o.flags.has("exit")).length;
  const things  = all.filter(o => !o.flags.has("room") && !o.flags.has("player") && !o.flags.has("exit")).length;
  const connected = all.filter(o => o.flags.has("connected")).length;

  // Uptime
  const uptimeMs = await u.sys.uptime();
  const uptimeSec = Math.floor(uptimeMs / 1000);
  const days    = Math.floor(uptimeSec / 86400);
  const hours   = Math.floor((uptimeSec % 86400) / 3600);
  const minutes = Math.floor((uptimeSec % 3600) / 60);
  const seconds = uptimeSec % 60;
  const uptimeStr = days > 0
    ? `${days}d ${hours}h ${minutes}m ${seconds}s`
    : hours > 0
    ? `${hours}h ${minutes}m ${seconds}s`
    : `${minutes}m ${seconds}s`;

  u.send("%ch%cy=== Server Stats ===%cn");
  u.send(`Uptime:     ${uptimeStr}`);
  u.send(`Connected:  ${connected} player${connected === 1 ? "" : "s"}`);
  u.send(`Total objs: ${all.length}`);

  if (full) {
    u.send("%ch%cy--- Object Breakdown ---%cn");
    u.send(`  Rooms:   ${rooms}`);
    u.send(`  Players: ${players}`);
    u.send(`  Exits:   ${exits}`);
    u.send(`  Things:  ${things}`);
  }

  u.send("%ch%cy===================%cn");
};
