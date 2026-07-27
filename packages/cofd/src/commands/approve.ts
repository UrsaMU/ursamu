// +approve -- promote chargen draft to live sheet; complete CGEN job.
// Player always gets a live send and @mail.

import { header, footer, type IUrsamuSDK } from "@ursamu/ursamu";
import type { CofdCgState } from "../chargen/index.ts";
import { sendCofdMail } from "../integrations/mail.ts";
import { syncSightFlags } from "../support/sight.ts";
import {
  parseTargetAndNotes,
  completeCgenJob,
  type JobTouchResult,
} from "./approve_job.ts";
export { denyExec, unapproveExec } from "./deny.ts";

function jobLines(job: JobTouchResult): string[] {
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

  const name = u.util.displayName(target, u.me);
  const cgState = target.state?.cofd_cg as CofdCgState | undefined;
  if (!cgState?.sheet) {
    u.send(
      `${name} has no chargen draft to approve. ` +
        `They need to finish +cg first.`,
    );
    return;
  }

  const sheet = { ...cgState.sheet };
  if (!sheet.specialties) sheet.specialties = {};

  await u.db.modify(target.id, "$set", { "data.cofd": sheet });
  await u.db.modify(target.id, "$unset", { "data.cofd_cg": "" });
  target.state = { ...target.state, cofd: sheet };
  delete target.state.cofd_cg;
  // approved flag locks non-staff out of +cg
  if (u.setFlags) {
    await u.setFlags(target.id, "approved");
    target.flags?.add("approved");
  }
  await syncSightFlags(u, target, sheet);

  const staffName = u.util.displayName(u.me, u.me);
  const job = await completeCgenJob(
    cgState.submittedJob,
    target.id,
    u.me.id,
    staffName,
    notes,
  );

  const lines = [
    await header("Character Approved"),
    `${name}'s sheet is now live.`,
    ...jobLines(job),
  ];
  if (notes) lines.push(`Notes: ${notes}`);
  lines.push(await footer());
  u.send(lines.join("\n"));

  u.send(
    `%chYour Chronicles of Darkness sheet has been ` +
      `approved by ${staffName}.%cn` +
      (notes ? ` Notes: ${notes}` : "") +
      `  Use %ch+sheet%cn to view it.`,
    target.id,
  );

  await sendCofdMail({
    to: target.id,
    subject: `Character approved: ${name}`,
    body: [
      `Your Chronicles of Darkness character sheet ` +
        `was approved by ${staffName}.`,
      job.number != null
        ? `CGEN job: #${job.number} (completed)`
        : "",
      notes ? `\nStaff notes:\n${notes}` : "",
      ``,
      `Your live sheet is active. Use +sheet to view it.`,
    ].filter(Boolean).join("\n"),
  });
}
