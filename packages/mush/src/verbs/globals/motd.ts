/**
 * +motd — multi-entry MOTD (general + wizard scopes).
 * Distinct from @motd (single text blob via u.text).
 */
import { addCmd } from "../../commands/addCmd.ts";
import type { IUrsamuSDK } from "../../commands/types.ts";
import { header, divider, footer } from "../../format/handlers.ts";
import { isStaffFlags } from "./time-fmt.ts";
import {
  byScope,
  motdSet,
  motdDel,
  motdReset,
} from "./motd-admin.ts";

function isAdmin(u: IUrsamuSDK): boolean {
  return isStaffFlags(u.me.flags) &&
    (u.me.flags.has("admin") ||
      u.me.flags.has("wizard") ||
      u.me.flags.has("superuser"));
}

async function renderMotd(u: IUrsamuSDK): Promise<void> {
  const lines: string[] = [];
  lines.push(header("Message of the Day"));

  const general = await byScope("general");
  if (general.length === 0) {
    lines.push("  No general MOTD set.");
  } else {
    for (const e of general) {
      lines.push(`  ${e.order}. ${e.text}`);
    }
  }

  if (isAdmin(u)) {
    const wizard = await byScope("wizard");
    lines.push(divider("Staff Notes"));
    if (wizard.length === 0) {
      lines.push("  No staff MOTD set.");
    } else {
      for (const e of wizard) {
        lines.push(`  ${e.order}. ${e.text}`);
      }
    }
  }
  lines.push(footer());
  u.send(lines.join("\n"));
}

export async function execPlusMotd(u: IUrsamuSDK): Promise<void> {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const arg = (u.cmd.args[1] ?? "").trim();

  if (!sw || sw === "list") {
    await renderMotd(u);
    return;
  }

  if (!isAdmin(u)) {
    u.send("Only staff may modify MOTD.");
    return;
  }

  if (sw === "set") {
    await motdSet(u, arg);
    return;
  }
  if (sw === "del") {
    await motdDel(u, arg);
    return;
  }
  if (sw === "reset") {
    await motdReset(u, arg);
    return;
  }

  u.send("Switches: /set /del /list /reset");
}

addCmd({
  name: "+motd",
  pattern: /^\+motd(?:\/(\S+))?(?:\s+(.*))?$/i,
  lock: "connected",
  category: "Info",
  help: `+motd[/<switch>] [<args>]  — Multi-entry MOTD.

General scope is public; wizard is staff-only.
See also: @motd (single-line login MOTD).

Switches:
  /set <scope>=<text>   Append (admin+)
  /del <scope>=<n>      Remove entry #n (admin+)
  /list                 Same as bare +motd
  /reset <scope>        Wipe scope (admin+)

Examples:
  +motd
  +motd/set general=Reboot Sunday 02:00 UTC
  +motd/del general=1`,
  exec: execPlusMotd,
});
