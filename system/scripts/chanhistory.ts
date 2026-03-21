import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

export const aliases = ["chanhistory", "+channel/history"];

/**
 * System Script: chanhistory.ts
 * Retrieves recent channel history.
 * Usage: +channel/history <name>[=<lines>]
 */
export default async (u: IUrsamuSDK) => {
  const input = (u.cmd.args[0] || "").trim();
  if (!input) {
    u.send("Usage: +channel/history <name>[=<lines>]");
    return;
  }

  const [chanName, limitStr] = input.split("=");
  const name = chanName.trim().toLowerCase();
  const limit = Math.min(parseInt(limitStr || "20") || 20, 500);

  const history = await u.chan.history(name, limit);

  if (!Array.isArray(history) || (history as { error?: string }).error) {
    u.send(`Channel not found: ${name}`);
    return;
  }

  if (history.length === 0) {
    u.send(`No history available for channel %ch${name}%cn.`);
    return;
  }

  u.send(`--- Channel History: ${name} (last ${history.length}) ---`);
  for (const entry of history) {
    const time = new Date(entry.timestamp).toUTCString();
    u.send(`[${time}] ${entry.message}`);
  }
  u.send("---");
};
