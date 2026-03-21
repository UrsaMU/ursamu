import { IUrsamuSDK, IGameTime } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: time.ts
 * @time              — Display current game time and server time.
 * @time/set key=val  — (admin/wizard/superuser) Set one or more fields of
 *                      the in-game clock. Accepted keys: year, month, day,
 *                      hour, minute.
 *
 * Example: @time/set year=5 month=3 day=1 hour=12 minute=0
 */
export default async (u: IUrsamuSDK) => {
  const switches = u.cmd.switches ?? [];
  const isSet = switches.includes("set");

  if (isSet) {
    // Admin-only branch
    if (
      !u.me.flags.has("admin") &&
      !u.me.flags.has("wizard") &&
      !u.me.flags.has("superuser")
    ) {
      u.send("Permission denied.");
      return;
    }

    // Parse "key=value" pairs from the args string
    const argStr = (u.cmd.args ?? []).join(" ").trim();
    const partial: Partial<IGameTime> = {};
    const validKeys = new Set(["year", "month", "day", "hour", "minute"]);

    for (const pair of argStr.split(/\s+/)) {
      const eqIdx = pair.indexOf("=");
      if (eqIdx === -1) continue;
      const key = pair.slice(0, eqIdx).trim().toLowerCase();
      const val = parseInt(pair.slice(eqIdx + 1).trim(), 10);
      if (validKeys.has(key) && !isNaN(val)) {
        (partial as Record<string, number>)[key] = val;
      }
    }

    if (Object.keys(partial).length === 0) {
      u.send("Usage: @time/set year=<n> month=<n> day=<n> hour=<n> minute=<n>");
      return;
    }

    const current = await u.sys.gameTime();
    const merged: IGameTime = { ...current, ...partial };

    u.send(
      `%chGame>%cn Setting game time to: Year ${merged.year}, Month ${merged.month}, Day ${merged.day}, ` +
      `${String(merged.hour).padStart(2, "0")}:${String(merged.minute).padStart(2, "0")}`
    );
    await u.sys.setGameTime(merged);
    return;
  }

  // Normal display branch
  const gt = await u.sys.gameTime();
  const hh = String(gt.hour).padStart(2, "0");
  const mm = String(gt.minute).padStart(2, "0");
  const gameStr = `Year ${gt.year}, Month ${gt.month}, Day ${gt.day}, ${hh}:${mm}`;
  const serverStr = new Date().toUTCString();

  u.send(`Game time  : ${gameStr}`);
  u.send(`Server time: ${serverStr}`);
};
