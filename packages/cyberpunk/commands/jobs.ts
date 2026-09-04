/**
 * +gig -- Jobs Board and Mission System
 */
import { addCmd, DBO } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import type { ICPRCharacter, IJob } from "../db/schemas.ts";
import { JOB_TEMPLATES } from "../data/jobs-templates.ts";
import { priceToEB } from "../engine/dice.ts";
import { emitJobPosted, emitJobTaken, emitJobCompleted, emitJobAbandoned } from "../engine/emitters.ts";
import { parsePositiveInt } from "../engine/validation.ts";
import { bar, div, hdr, lbl, val, acc, dim, ARR, ERR, OK, row, wrap, grid } from "./chargen.ts";

const jobDB = new DBO<IJob>("cpr.jobs");

addCmd({
  name: "+gig",
  pattern: /^\+gig(?:\/(list|post|take|complete|abandon|view|payout))?\s*(.*)/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+gig[/<switch>] [<argument>]  -- Datahaven job board and mission tracker.

Switches:
  /list                  Browse available jobs.
  /view <id>             Pull full job details.
  /post                  (Fixer/Admin) Post a job from templates.
  /take <id>             Accept a job.
  /complete <id>         Mark a job done and claim your payout.
  /abandon <id>          Walk away from an active job.
  /payout <id> <amount>  (Admin) Issue custom payout.

Examples:
  +gig/list              Browse the board.
  +gig/view abc123       Pull the details on a posting.
  +gig/take abc123       Accept this job.
  +gig/complete abc123   Claim your eddies.`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "list").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }

    if (sw === "list") { await listJobs(u, cpr); return; }
    if (sw === "view") { await viewJob(u, arg); return; }
    if (sw === "post") { await postJob(u, cpr, arg); return; }
    if (sw === "take") { await takeJob(u, cpr, arg); return; }
    if (sw === "complete") { await completeJob(u, cpr, arg); return; }
    if (sw === "abandon") { await abandonJob(u, cpr, arg); return; }
    if (sw === "payout") { await adminPayout(u, arg); return; }
    u.send(`${ERR}Unknown switch ${val('"/' + sw + '"')}.`);
  },
});

async function listJobs(u: IUrsamuSDK, cpr: ICPRCharacter): Promise<void> {
  const jobs   = await jobDB.find({ status: "open" });
  const myJobs = await jobDB.find({ takenById: u.me.id, status: "active" });

  const lines: string[] = [
    bar(),
    hdr("JOBS BOARD"),
    bar(),
  ];

  if (myJobs.length > 0) {
    lines.push(`  ${lbl("-- ACTIVE CONTRACTS --")}`);
    for (const j of myJobs) {
      lines.push(row(
        dim(j.id.slice(0, 8)),
        `${acc(j.title)}  ${val((j.payoutEb ?? j.payAmount).toLocaleString())} ${dim("eb")}`,
      ));
    }
    lines.push(div());
  }

  if (jobs.length === 0) {
    lines.push(`  ${dim("No postings available. Check back later.")}`);
  } else {
    lines.push(`  ${lbl("-- AVAILABLE --")}`);
    for (const j of jobs) {
      const diff = dim("[" + j.difficulty + "]");
      lines.push(row(
        dim(j.id.slice(0, 8)),
        `${diff}  ${acc(j.title)}  ${val((j.payoutEb ?? j.payAmount).toLocaleString())} ${dim("eb")}`,
      ));
    }
  }

  lines.push(div());
  lines.push(`  ${ARR}${val("+gig/view <id>")} ${dim("for details.")}  ${val("+gig/take <id>")} ${dim("to accept.")}`);
  lines.push(bar());
  u.send(lines.join("\r\n"));
}

async function viewJob(u: IUrsamuSDK, idPrefix: string): Promise<void> {
  if (!idPrefix) { u.send(`${ARR}Provide job ID: ${val("+gig/view <id>")}`); return; }
  const jobs = await jobDB.find({});
  const job = jobs.find((j) => j.id.startsWith(idPrefix));
  if (!job) { u.send(`${ERR}No posting found with ID ${val('"' + idPrefix + '"')}.`); return; }

  const lines: string[] = [
    bar(),
    hdr("JOB POSTING"),
    bar(),
    row("TITLE",      acc(job.title)),
    row("ID",         dim(job.id.slice(0, 8))),
    row("DIFFICULTY", val(job.difficulty)),
    row("STATUS",     val(job.status)),
    row("PAYOUT",     `${val((job.payoutEb ?? job.payAmount).toLocaleString())} ${dim("eb")}`),
    row("POSTED BY",  dim(job.postedByName)),
    div(),
  ];

  lines.push(`  ${lbl("DESCRIPTION")}`);
  lines.push(...wrap(job.description, 74, "  "));
  lines.push("");
  lines.push(`  ${lbl("OBJECTIVES")}`);
  for (const o of job.objectives) {
    lines.push(...wrap("* " + o, 74, "  "));
  }

  if (job.expiresAt) {
    lines.push(div());
    lines.push(row("EXPIRES", dim(new Date(job.expiresAt).toLocaleDateString())));
  }

  lines.push(div());
  lines.push(`  ${ARR}${val("+gig/take " + job.id.slice(0, 8))} ${dim("-- accept this contract")}`);
  lines.push(bar());
  u.send(lines.join("\r\n"));
}

async function postJob(u: IUrsamuSDK, cpr: ICPRCharacter, arg: string): Promise<void> {
  const canPost = cpr.role === "fixer" || u.me.flags.has("admin") || u.me.flags.has("wizard");
  if (!canPost) { u.send(`${ERR}Only Fixers or admins can post jobs.`); return; }

  const templateNum = parseInt(arg, 10);
  if (isNaN(templateNum) || templateNum < 1 || templateNum > JOB_TEMPLATES.length) {
    const lines: string[] = [
      bar(),
      hdr("JOB TEMPLATES"),
      bar(),
      `  ${dim("Usage:")} ${val("+gig/post <number>")}`,
      div(),
    ];
    JOB_TEMPLATES.forEach((t, i) => {
      lines.push(row(
        val(String(i + 1)),
        `${dim("[" + t.difficulty + "]")}  ${acc(t.title)}  ${dim("~" + t.payoutCategory)}`,
      ));
    });
    lines.push(bar());
    u.send(lines.join("\r\n")); return;
  }

  const template = JOB_TEMPLATES[templateNum - 1];
  const payoutEb = priceToEB(template.payoutCategory) + Math.floor(Math.random() * 500);

  const job: IJob = {
    id: crypto.randomUUID(),
    title: template.title,
    description: template.description,
    objectives: template.objectives,
    difficulty: template.difficulty,
    payoutEb,
    postedById: u.me.id,
    postedByName: u.util.displayName(u.me, u.me),
    takenById: null,
    takenByName: null,
    status: "open",
    postedAt: Date.now(),
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    completedAt: null,
  };

  await jobDB.create(job);
  await emitJobPosted(u.me, job);

  u.send([
    div(),
    `  ${OK}Contract posted to the board.`,
    row("TITLE",  acc(job.title)),
    row("PAYOUT", `${val((job.payoutEb ?? job.payAmount).toLocaleString())} ${dim("eb")}`),
    row("ID",     dim(job.id.slice(0, 8))),
    div(),
  ].join("\r\n"));
  u.here.broadcast?.(
    `${ARR}New contract on the board: ${acc(job.title)} ${dim("(" + (job.payoutEb ?? job.payAmount).toLocaleString() + " eb)")}`,
    u.me.id,
  );
}

async function takeJob(u: IUrsamuSDK, cpr: ICPRCharacter, idPrefix: string): Promise<void> {
  if (!idPrefix) { u.send(`${ARR}Specify job ID: ${val("+gig/take <id>")}`); return; }
  const jobs = await jobDB.find({ status: "open" });
  const job = jobs.find((j) => j.id.startsWith(idPrefix));
  if (!job) { u.send(`${ERR}No open posting found with ID ${val('"' + idPrefix + '"')}.`); return; }

  await jobDB.update({ id: job.id }, {
    status: "active",
    takenById: u.me.id,
    takenByName: u.util.displayName(u.me, u.me),
  });
  await emitJobTaken(u.me, job);

  const lines: string[] = [
    div(),
    `  ${OK}Contract accepted.`,
    row("TITLE",  acc(job.title)),
    row("PAYOUT", `${val((job.payoutEb ?? job.payAmount).toLocaleString())} ${dim("eb")} ${dim("on completion")}`),
    div(),
    `  ${lbl("OBJECTIVES")}`,
  ];
  for (const o of job.objectives) {
    lines.push(...wrap("* " + o, 74, "  "));
  }
  lines.push(div());
  u.send(lines.join("\r\n"));
}

async function completeJob(u: IUrsamuSDK, cpr: ICPRCharacter, idPrefix: string): Promise<void> {
  if (!idPrefix) { u.send(`${ARR}Specify job ID: ${val("+gig/complete <id>")}`); return; }
  const jobs = await jobDB.find({ takenById: u.me.id, status: "active" });
  const job = jobs.find((j) => j.id.startsWith(idPrefix));
  if (!job) { u.send(`${ERR}No active contract found with ID ${val('"' + idPrefix + '"')}.`); return; }

  await jobDB.update({ id: job.id }, { status: "completed", completedAt: Date.now() });
  await u.db.modify(u.me.id, "$inc", { "state.cpr.eurodollars": (job.payoutEb ?? job.payAmount) });
  const newRep = Math.min(10, cpr.reputation + 1);
  await u.db.modify(u.me.id, "$set", { "state.cpr.reputation": newRep });
  await emitJobCompleted(u.me, job);

  u.send([
    bar(),
    hdr("CONTRACT COMPLETE"),
    bar(),
    row("JOB",        acc(job.title)),
    row("PAYOUT",     `${OK}${val("+" + (job.payoutEb ?? job.payAmount).toLocaleString())} ${dim("eb")}`),
    row("REPUTATION", `${val(String(newRep))} ${dim("(+1)")}`),
    bar(),
  ].join("\r\n"));
}

async function abandonJob(u: IUrsamuSDK, cpr: ICPRCharacter, idPrefix: string): Promise<void> {
  if (!idPrefix) { u.send(`${ARR}Specify job ID: ${val("+gig/abandon <id>")}`); return; }
  const jobs = await jobDB.find({ takenById: u.me.id, status: "active" });
  const job = jobs.find((j) => j.id.startsWith(idPrefix));
  if (!job) { u.send(`${ERR}No active contract found with ID ${val('"' + idPrefix + '"')}.`); return; }

  await jobDB.update({ id: job.id }, { status: "open", takenById: null, takenByName: null });
  await emitJobAbandoned(u.me, job);
  u.send(`${ARR}Contract abandoned: ${acc(job.title)}. ${dim("It's back on the board.")}`);
}

async function adminPayout(u: IUrsamuSDK, arg: string): Promise<void> {
  const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard");
  if (!isAdmin) { u.send(`${ERR}Admin only.`); return; }
  const parts = arg.split(" ");
  if (parts.length < 2) {
    u.send(`${ERR}Usage: ${val("+gig/payout <target> <amount>")}`); return;
  }
  const target = await u.util.target(u.me, parts[0], true);
  if (!target) { u.send(`${ERR}Target not found.`); return; }
  const amount = parsePositiveInt(parts[1] ?? "");
  if (amount === null) { u.send(`${ERR}Amount must be a positive integer.`); return; }
  await u.db.modify(target.id, "$inc", { "state.cpr.eurodollars": amount });
  u.send(`${OK}Issued ${val(amount.toLocaleString())} ${dim("eb")} to ${acc(u.util.displayName(target, u.me))}.`);
  u.send(`${OK}${val("+" + amount.toLocaleString())} ${dim("eb")} issued by ${acc(u.util.displayName(u.me, target))}.`, target.id);
}
