/**
 * +staff — online, non-dark, on-duty staff roster.
 */
import { addCmd } from "../../commands/addCmd.ts";
import type { IUrsamuSDK, IDBObj } from "../../commands/types.ts";
import { header, divider, footer } from "../../format/handlers.ts";
import { fmtIdle, fmtOnFor, isStaffFlags } from "./time-fmt.ts";

const NW = 24;
const OW = 10;
const IW = 6;

function displayName(p: IDBObj): string {
  return String(
    p.state.moniker || p.state.name || p.name || "Unknown",
  );
}

function isOffDuty(p: IDBObj): boolean {
  return !!p.state.offduty;
}

export async function execStaff(u: IUrsamuSDK): Promise<void> {
  const staff = (await u.db.search({ flags: /connected/i })).filter(
    (p) =>
      p.flags.has("player") &&
      !p.flags.has("dark") &&
      !isOffDuty(p) &&
      isStaffFlags(p.flags),
  );

  staff.sort(
    (a, b) =>
      ((b.state.lastLogin as number) || 0) -
      ((a.state.lastLogin as number) || 0),
  );

  const lines: string[] = [];
  lines.push(header("Staff Online"));
  lines.push(
    `${"Player Name".padEnd(NW)}  ` +
      `${"On For".padStart(OW)}  ` +
      `${"Idle".padStart(IW)}  Doing`,
  );
  lines.push(divider());

  if (staff.length === 0) {
    lines.push("  No staff are currently online.");
  } else {
    for (const p of staff) {
      const name = displayName(p).slice(0, NW).padEnd(NW);
      const onFor = fmtOnFor(p.state.lastLogin).padStart(OW);
      const idle = fmtIdle(p.state.lastCommand).padStart(IW);
      const doing = String(p.state.doing || "").slice(0, 28);
      lines.push(`${name}  ${onFor}  ${idle}  ${doing}`);
    }
  }

  lines.push(divider());
  const n = staff.length;
  lines.push(
    `  ${n} staff member${n === 1 ? "" : "s"} online.`,
  );
  lines.push(footer());
  u.send(lines.join("\n"));
}

addCmd({
  name: "+staff",
  pattern: /^\+staff$/i,
  lock: "connected",
  category: "Social",
  help: `+staff  — List online, on-duty staff.

Shows admin/wizard/superuser/staff who are connected,
not dark, and not off-duty (+duty).

Examples:
  +staff`,
  exec: execStaff,
});
