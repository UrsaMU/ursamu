/**
 * +uptime — boot time, current time, runtime panel.
 */
import { addCmd } from "../../commands/addCmd.ts";
import type { IUrsamuSDK } from "../../commands/types.ts";
import { header, footer } from "../../format/handlers.ts";
import { fmtDurationMs } from "./time-fmt.ts";

export async function execUptime(u: IUrsamuSDK): Promise<void> {
  const upMs = await u.sys.uptime();
  const now = new Date();
  const boot = new Date(now.getTime() - upMs);

  const lines: string[] = [];
  lines.push(header("Server Uptime"));
  lines.push(`  Booted at   : ${boot.toUTCString()}`);
  lines.push(`  Current     : ${now.toUTCString()}`);
  lines.push(`  In operation: ${fmtDurationMs(upMs)}`);
  lines.push(footer());
  u.send(lines.join("\n"));
}

addCmd({
  name: "+uptime",
  pattern: /^\+uptime$/i,
  lock: "connected",
  category: "Info",
  help: `+uptime  — Show server boot time and runtime.

Examples:
  +uptime`,
  exec: execUptime,
});
