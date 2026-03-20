import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * @stats         — server summary (object counts, connected players, uptime)
 * @stats/full    — detailed breakdown
 */
export default async (u: IUrsamuSDK) => {
  const switches = u.cmd.switches || [];
  const full = switches.includes("full");

  // Connected player count (only fetch connected players, not all objects)
  const connectedPlayers = await u.db.search({ flags: /connected/ });
  const connected = connectedPlayers.length;

  // Object counts — only fetch full list for @stats/full
  let all: Awaited<ReturnType<typeof u.db.search>> | undefined;
  let rooms = 0, players = 0, exits = 0, things = 0, totalObjs = 0;

  if (full) {
    all = await u.db.search({});
    rooms   = all.filter(o => o.flags.has("room")).length;
    players = all.filter(o => o.flags.has("player")).length;
    exits   = all.filter(o => o.flags.has("exit")).length;
    things  = all.filter(o => !o.flags.has("room") && !o.flags.has("player") && !o.flags.has("exit")).length;
    totalObjs = all.length;
  }

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
  if (full) u.send(`Total objs: ${totalObjs}`);

  if (full) {
    u.send("%ch%cy--- Object Breakdown ---%cn");
    u.send(`  Rooms:   ${rooms}`);
    u.send(`  Players: ${players}`);
    u.send(`  Exits:   ${exits}`);
    u.send(`  Things:  ${things}`);
  }

  u.send("%ch%cy===================%cn");
};
