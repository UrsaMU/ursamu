// +deny -- return chargen draft; comment on open CGEN job.
// +unapprove is an alias. Player gets live send and @mail.

import { header, footer, type IUrsamuSDK } from "@ursamu/ursamu";
import type { CofdCgState } from "../chargen/index.ts";
import { sendCofdMail } from "../integrations/mail.ts";
import {
  parseTargetAndNotes,
  commentCgenJob,
  type JobTouchResult,
} from "./approve_job.ts";

function jobLines(job: JobTouchResult): string[] {
  if (job.commented && job.number != null) {
    return [`Comment left on open CGEN job #${job.number}.`];
  }
  if (job.error) return [`%crJob: ${job.error}%cn`];
  if (job.number != null) {
    return [
      `%crCGEN job #${job.number} was not updated.%cn ` +
        `Use %ch+job/comment ${job.number}=…%cn.`,
    ];
  }
  return [`%cyNo open CGEN job found to comment on.%cn`];
}

export async function denyExec(u: IUrsamuSDK) {
  const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
  const { who, notes } = parseTargetAndNotes(arg);

  if (!who) {
    u.send("Usage: +deny <player>=<reason>");
    u.send("Review first with +sheet <player>.");
    return;
  }
  if (!notes) {
    u.send("A reason is required: +deny <player>=<reason>");
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
      `${name} has no chargen draft to deny. ` +
        `Nothing to return.`,
    );
    return;
  }

  const staffName = u.util.displayName(u.me, u.me);
  const job = await commentCgenJob(
    cgState.submittedJob,
    target.id,
    u.me.id,
    staffName,
    notes,
  );

  const cleared: CofdCgState = {
    ...cgState,
    isSubmitted: false,
  };
  delete cleared.submittedAt;
  if (job.number != null) cleared.submittedJob = job.number;
  await u.db.modify(target.id, "$set", {
    "data.cofd_cg": cleared,
  });

  const lines = [
    await header("Character Denied"),
    `${name}'s draft was returned for revision.`,
    ...jobLines(job),
    `Reason: ${notes}`,
    await footer(),
  ];
  u.send(lines.join("\n"));

  u.send(
    `%chYour Chronicles of Darkness sheet was returned ` +
      `for revision by ${staffName}.%cn\n` +
      `Reason: ${notes}\n` +
      `Use %ch+cg%cn to fix it, then %ch+cg/submit%cn ` +
      `when ready.`,
    target.id,
  );

  await sendCofdMail({
    to: target.id,
    subject: `Character denied: ${name}`,
    body: [
      `Your Chronicles of Darkness submission was ` +
        `returned by ${staffName}.`,
      job.number != null
        ? `CGEN job: #${job.number} (still open)`
        : "",
      ``,
      `Reason:`,
      notes,
      ``,
      `Use +cg to make changes and +cg/submit to resubmit.`,
    ].filter(Boolean).join("\n"),
  });
}

/** @deprecated Prefer +deny — kept as alias. */
export const unapproveExec = denyExec;
