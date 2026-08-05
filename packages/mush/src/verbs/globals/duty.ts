/**
 * +duty — staff on/off-duty toggle (hides from +staff when off).
 */
import { addCmd } from "../../commands/addCmd.ts";
import type { IUrsamuSDK } from "../../commands/types.ts";
import { isStaffFlags } from "./time-fmt.ts";

export async function execDuty(u: IUrsamuSDK): Promise<void> {
  if (!isStaffFlags(u.me.flags)) {
    u.send("Only staff may use +duty.");
    return;
  }

  const off = !!u.me.state.offduty;
  if (off) {
    await u.db.modify(u.me.id, "$unset", { "data.offduty": 1 });
    u.send("You are now on-duty.");
    return;
  }
  await u.db.modify(u.me.id, "$set", { "data.offduty": true });
  u.send(
    "You are now off-duty. You won't appear in +staff.",
  );
}

addCmd({
  name: "+duty",
  pattern: /^\+duty$/i,
  lock: "connected",
  category: "Staff",
  help: `+duty  — Toggle staff on/off-duty status.

Off-duty staff stay connected but are hidden from +staff.

Examples:
  +duty`,
  exec: execDuty,
});
