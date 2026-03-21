import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

export const aliases = ["chantranscript", "+channel/transcript"];

/**
 * System Script: chantranscript.ts
 * Exports the last N lines of a channel's history as plain text.
 * Usage: +channel/transcript <name>=<lines>
 */
export default async (u: IUrsamuSDK) => {
  const input = (u.cmd.args[0] || "").trim();
  const match = input.match(/^([^=]+)=(\d+)$/);
  if (!match) {
    u.send("Usage: +channel/transcript <name>=<lines>");
    return;
  }

  const name = match[1].trim().toLowerCase();
  const lines = Math.min(parseInt(match[2]) || 20, 500);

  const history = await u.chan.history(name, lines);

  if (!Array.isArray(history) || (history as { error?: string }).error) {
    u.send(`Channel not found: ${name}`);
    return;
  }

  if (history.length === 0) {
    u.send(`No history available for channel %ch${name}%cn.`);
    return;
  }

  u.send(`--- Transcript: ${name} (${history.length} lines) ---`);
  for (const entry of history) {
    const time = new Date(entry.timestamp).toISOString();
    u.send(`[${time}] ${entry.message}`);
  }
  u.send("--- End Transcript ---");
};
