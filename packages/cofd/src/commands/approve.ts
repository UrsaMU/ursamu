// +approve -- promote chargen draft to live sheet; complete CGEN job.
// Player always gets a live send and @mail.

import { header, footer, type IUrsamuSDK } from "@ursamu/ursamu";
import { approvePlayer } from "../chargen/approve_core.ts";
import {
  parseTargetAndNotes,
  type JobTouchResult,
} from "./approve_job.ts";
export { denyExec, unapproveExec } from "./deny.ts";

function jobLines(job: JobTouchResult | null): string[] {
  if (!job) return [];
  if (job.completed && job.number != null) {
    return [`CGEN job #${job.number} completed and archived.`];
  }
  if (job.error) return [`%crJob: ${job.error}%cn`];
  if (job.number != null) {
    return [
      `%crCGEN job #${job.number} was not closed.%cn ` +
        `Use %ch+job/close ${job.number}%cn.`,
    ];
  }
  return [
    `%cyNo open CGEN job found.%cn ` +
      `Sheet is live; close leftovers with +job/close.`,
  ];
}

export async function approveExec(u: IUrsamuSDK) {
  const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
  const { who, notes } = parseTargetAndNotes(arg);

  if (!who) {
    u.send("Usage: +approve <player>[=<notes>]");
    u.send("Review first with +sheet <player>.");
    return;
  }

  const target = await u.util.target(u.me, who, true);
  if (!target) {
    u.send(`No player matches '${who}'.`);
    return;
  }

  const staffName = u.util.displayName(u.me, u.me);
  const result = await approvePlayer({
    playerId: target.id,
    staffId: u.me.id,
    staffName,
    notes,
    completeJob: true,
  });

  if (!result.ok) {
    u.send(`%cr${result.error}%cn`);
    return;
  }

  if (result.already) {
    u.send(
      `${result.name} is already approved with a live sheet.`,
    );
    return;
  }

  const lines = [
    await header("Character Approved"),
    `${result.name}'s sheet is now live.`,
    ...jobLines(result.job),
  ];
  if (result.dormId) {
    lines.push(
      `Home set to freehold dorm (#${result.dormId}). ` +
        `They can type %chhome%cn anytime.`,
    );
  }
  if (notes) lines.push(`Notes: ${notes}`);
  lines.push(await footer());
  u.send(lines.join("\n"));
}
