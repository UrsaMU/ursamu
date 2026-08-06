// +cg/wipe — staff full character reset (sheet + chargen + approval).

import { header, footer, type IUrsamuSDK } from "@ursamu/ursamu";
import { wipeCharacter } from "../chargen/wipe_core.ts";
import { parseTargetAndNotes } from "./approve_job.ts";

function isStaff(u: IUrsamuSDK): boolean {
  const f = u.me.flags;
  if (!f) return false;
  return (
    f.has("staff") ||
    f.has("storyteller") ||
    f.has("wizard") ||
    f.has("admin") ||
    f.has("superuser")
  );
}

export async function wipeExec(u: IUrsamuSDK): Promise<void> {
  if (!isStaff(u)) {
    u.send("Permission denied. Staff only.");
    return;
  }

  const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
  const { who, notes } = parseTargetAndNotes(arg);

  if (!who) {
    u.send(
      "Usage: %ch+cg/wipe <player>[=<reason>]%cn\n" +
        "Fully clears live sheet, chargen draft, approved " +
        "flag, and fae/forsaken. Seeds a fresh +cg draft.\n" +
        "Reason is required when wiping another player.",
    );
    return;
  }

  const target = await u.util.target(u.me, who, true);
  if (!target) {
    u.send(`No player matches '${who}'.`);
    return;
  }

  const self = target.id === u.me.id;
  if (!self && !notes) {
    u.send(
      "A reason is required: " +
        "%ch+cg/wipe <player>=<reason>%cn",
    );
    return;
  }

  if (
    !self &&
    !(await u.canEdit(u.me, target))
  ) {
    u.send("Permission denied on that target.");
    return;
  }

  const staffName = u.util.displayName(u.me, u.me);
  const result = await wipeCharacter({
    playerId: target.id,
    staffId: u.me.id,
    staffName,
    reason: notes || undefined,
    startDraft: true,
    notify: !self,
  });

  if (!result.ok) {
    u.send(`%cr${result.error}%cn`);
    return;
  }

  if (self && target.state) {
    delete target.state.cofd;
    target.flags?.delete("approved");
    target.flags?.delete("fae");
    target.flags?.delete("forsaken");
  }

  const bits: string[] = [];
  if (result.hadLive) bits.push("live sheet");
  if (result.hadDraft) bits.push("chargen draft");
  if (result.wasApproved) bits.push("approved");
  bits.push("sight flags");

  const lines = [
    await header("Character Wiped"),
    `${result.name} — full reset.`,
    `Cleared: ${bits.join(", ")}.`,
    `Fresh +cg draft seeded.`,
  ];
  if (result.job?.number != null) {
    lines.push(
      result.job.commented
        ? `Comment left on CGEN job #${result.job.number}.`
        : `CGEN job #${result.job.number} noted.`,
    );
  }
  if (notes) lines.push(`Reason: ${notes}`);
  lines.push(await footer());
  u.send(lines.join("\n"));
}
