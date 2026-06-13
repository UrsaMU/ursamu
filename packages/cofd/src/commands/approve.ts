// +approve / +unapprove -- staff close-out of a pending CGEN job.

import { header, footer, type IUrsamuSDK } from "@ursamu/ursamu";
import { jobs, type IJobComment } from "@ursamu/jobs-plugin";
import type { CofdCgState } from "../chargen/index.ts";
import { sendCofdMail } from "../integrations/mail.ts";

function parseTargetAndNotes(arg: string): { who: string; notes: string } {
  const eq = arg.indexOf("=");
  if (eq < 0) return { who: arg.trim(), notes: "" };
  return { who: arg.slice(0, eq).trim(), notes: arg.slice(eq + 1).trim() };
}

export async function approveExec(u: IUrsamuSDK) {
  const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
  const { who, notes } = parseTargetAndNotes(arg);

  if (!who) {
    u.send("Usage: +approve <player>[=<notes>]");
    return;
  }

  const target = await u.util.target(u.me, who, true);
  if (!target) {
    u.send(`No player matches '${who}'.`);
    return;
  }

  const cgState = target.state?.cofd_cg as CofdCgState | undefined;
  if (!cgState || !cgState.submittedJob) {
    u.send(`${u.util.displayName(target, u.me)} has no submitted character pending approval.`);
    return;
  }

  const job = await jobs.findOne({ number: cgState.submittedJob });
  if (!job) {
    u.send(`Job #${cgState.submittedJob} is missing from the queue; sheet cannot be approved cleanly.`);
    return;
  }
  if (job.status !== "new" && job.status !== "open") {
    u.send(`Job #${job.number} is already ${job.status}; nothing to approve.`);
    return;
  }

  const sheet = cgState.sheet;
  if (!sheet.specialties) sheet.specialties = {};

  // Order matters: write sheet first, then clear cg state, then close job.
  await u.db.modify(target.id, "$set", { "data.cofd": sheet });
  await u.db.modify(target.id, "$unset", { "data.cofd_cg": "" });

  const staffName = u.util.displayName(u.me, u.me);
  const now = Date.now();
  const comment: IJobComment = {
    authorId: u.me.id,
    authorName: staffName,
    text: notes ? `Approved by ${staffName}: ${notes}` : `Approved by ${staffName}.`,
    timestamp: now,
    staffOnly: false,
  };
  await jobs.update({ id: job.id }, {
    ...job,
    status: "closed",
    closedByName: staffName,
    assignedTo: u.me.id,
    assigneeName: staffName,
    comments: [...job.comments, comment],
    updatedAt: now,
  });

  const lines: string[] = [];
  lines.push(await header("Character Approved"));
  lines.push(`${u.util.displayName(target, u.me)}'s sheet is now active. Job #${job.number} closed.`);
  if (notes) lines.push(`Notes: ${notes}`);
  lines.push(await footer());
  u.send(lines.join("\n"));

  u.send(
    `%chYour Chronicles of Darkness sheet has been approved by ${staffName}.%cn` +
      (notes ? ` Notes: ${notes}` : ""),
    target.id,
  );

  await sendCofdMail({
    to: target.id,
    subject: `Character approved: ${u.util.displayName(target, u.me)}`,
    body: [
      `Your Chronicles of Darkness character sheet was approved by ${staffName}.`,
      `CGEN job: #${job.number}`,
      notes ? `\nStaff notes:\n${notes}` : "",
      ``,
      `Your live sheet is now active. Use +sheet to view it.`,
    ].filter(Boolean).join("\n"),
  });
}

export async function unapproveExec(u: IUrsamuSDK) {
  const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
  const { who, notes } = parseTargetAndNotes(arg);

  if (!who) {
    u.send("Usage: +unapprove <player>=<reason>");
    return;
  }
  if (!notes) {
    u.send("A reason is required when returning a submission: +unapprove <player>=<reason>");
    return;
  }

  const target = await u.util.target(u.me, who, true);
  if (!target) {
    u.send(`No player matches '${who}'.`);
    return;
  }

  const cgState = target.state?.cofd_cg as CofdCgState | undefined;
  if (!cgState || !cgState.submittedJob) {
    u.send(`${u.util.displayName(target, u.me)} has no submitted character to return.`);
    return;
  }

  const job = await jobs.findOne({ number: cgState.submittedJob });
  if (!job) {
    u.send(`Job #${cgState.submittedJob} is missing from the queue.`);
    return;
  }
  if (job.status !== "new" && job.status !== "open") {
    u.send(`Job #${job.number} is already ${job.status}; cannot return.`);
    return;
  }

  const staffName = u.util.displayName(u.me, u.me);
  const now = Date.now();
  const comment: IJobComment = {
    authorId: u.me.id,
    authorName: staffName,
    text: `Returned by ${staffName}: ${notes}`,
    timestamp: now,
    staffOnly: false,
  };
  await jobs.update({ id: job.id }, {
    ...job,
    status: "open",
    assignedTo: u.me.id,
    assigneeName: staffName,
    comments: [...job.comments, comment],
    updatedAt: now,
  });

  const cleared: CofdCgState = { ...cgState };
  delete cleared.submittedJob;
  delete cleared.submittedAt;
  await u.db.modify(target.id, "$set", { "data.cofd_cg": cleared });

  const lines: string[] = [];
  lines.push(await header("Character Returned"));
  lines.push(`${u.util.displayName(target, u.me)}'s submission was returned. Job #${job.number} remains open.`);
  lines.push(`Reason: ${notes}`);
  lines.push(await footer());
  u.send(lines.join("\n"));

  u.send(
    `%chYour Chronicles of Darkness sheet was returned for revision by ${staffName}.%cn\n` +
      `Reason: ${notes}\n` +
      `Use %ch+cg%cn to make changes and %ch+cg/submit%cn to resubmit.`,
    target.id,
  );

  await sendCofdMail({
    to: target.id,
    subject: `Character returned for revision: ${u.util.displayName(target, u.me)}`,
    body: [
      `Your Chronicles of Darkness submission was returned by ${staffName}.`,
      `CGEN job: #${job.number} (reopened)`,
      ``,
      `Reason:`,
      notes,
      ``,
      `Use +cg to make changes and +cg/submit to resubmit.`,
    ].join("\n"),
  });
}
