// ─── Player commands: +request / +requests / +myjobs ─────────────────────────

import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { jobs, jobArchive, getNextJobNumber, isValidBucket, getAllBuckets } from "./db.ts";
import { jobHooks } from "./hooks.ts";
import type { IJob, IJobComment } from "./types.ts";
import { jobHeader, jobFooter, jobDivider, formatTimeFull, formatTimeShort, getEscalation, isNew, formatJobList } from "./format.ts";
import { getJobByNumber } from "./job-utils.ts";
import { sendJobMail } from "./mail.ts";

/**
 * Returns the best available display name for the calling player.
 * Preference order: moniker → state.name → db name → "Unknown".
 */
function callerName(u: IUrsamuSDK): string {
  return (u.me.state?.moniker as string) || (u.me.state?.name as string) || u.me.name || "Unknown";
}

/**
 * Sends a formatted view of a single job to the calling player.
 * Only published comments are shown (staff-only comments are hidden).
 *
 * @param u   UrsaMU SDK context — used for `u.send()` and formatting helpers.
 * @param job The job to display.
 */
function showRequest(u: IUrsamuSDK, job: IJob): void {
  const esc = getEscalation(job);
  const bucket = job.bucket || job.category || "???";
  const statusLabel = esc.label ? `${esc.color}${esc.label}%cn` : "";
  const newTag = isNew(job) ? " (NEW)" : "";
  const lines: string[] = [];
  lines.push(jobHeader(`Job ${job.number}`));
  lines.push(`${"Job Title:".padEnd(38)} ${"Requester:".padEnd(15)}${job.submitterName}`);
  lines.push(`${("%ch%cw" + job.title + "%cn").padEnd(38)}`);
  lines.push(`${"Category:".padEnd(38)} ${"Status:".padEnd(15)}${statusLabel}${newTag}`);
  lines.push(`${bucket.padEnd(38)} ${"Handler:".padEnd(15)}${job.assigneeName || "-----"}`);
  lines.push(`${"Created:".padEnd(38)}`);
  lines.push(formatTimeFull(job.createdAt));
  lines.push(`Additional Players: ${job.additionalPlayers?.join(", ") || ""}`);
  lines.push(jobDivider());
  lines.push(job.description);
  const pubComments = job.comments.filter((c) => c.published);
  if (pubComments.length > 0) {
    lines.push("");
    for (const c of pubComments) {
      lines.push(`%ch%cy${c.authorName}%cn [${formatTimeShort(c.timestamp)}]: ${c.text}`);
    }
  }
  lines.push(jobFooter("End Job"));
  u.send(lines.join("\n"));
}

addCmd({
  name: "+request",
  pattern: /^\+request(?!s)(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  help: `+request[/<switch>] [<args>]  — Submit and manage player requests.

Switches:
  /create <bucket>/<title>=<text>   Submit to a specific bucket.
  /comment <#>=<text>               Add a comment to your request.
  /cancel <#>                       Cancel your own request.
  /addplayer <#>=<player>           Add a viewer to your request.

Examples:
  +request My Issue=Please help with X.   Submit a request to the default bucket.
  +request 3                              View request #3.
  +request/comment 3=Thanks for looking.  Comment on request #3.
  +request/cancel 3                       Cancel request #3.`,
  exec: async (u: IUrsamuSDK) => {
    if (u.cmd.original?.trim().match(/^\+requests?\s*$/i)) {
      const myJobs = (await jobs.find({})).filter(
        (j) => j.submittedBy === u.me.id || j.additionalPlayers?.includes(u.me.id),
      );
      if (myJobs.length === 0) { u.send(">JOBS: You have no open requests."); return; }
      myJobs.sort((a, b) => a.number - b.number);
      u.send(formatJobList(myJobs, "POP Jobs").join("\n"));
      return;
    }

    const sw  = (u.cmd.args[0] || "").toLowerCase().trim();
    const arg = (u.cmd.args[1] || "").trim();

    if (!sw && arg && !arg.includes("=")) {
      const num = parseInt(arg, 10);
      if (!isNaN(num)) {
        const job = await getJobByNumber(num);
        if (!job) { u.send(`>JOBS: No request #${num} found.`); return; }
        if (job.submittedBy !== u.me.id && !job.additionalPlayers?.includes(u.me.id)) {
          u.send(">JOBS: Permission denied."); return;
        }
        await showRequest(u, job);
        return;
      }
    }

    if (!sw || sw === "create") {
      let bucket = "SPHERE";
      let rest = arg;
      if (sw === "create") {
        const slash = arg.indexOf("/");
        if (slash !== -1) { bucket = arg.slice(0, slash).trim().toUpperCase(); rest = arg.slice(slash + 1); }
      }
      const eq = rest.indexOf("=");
      if (eq === -1) {
        u.send("Usage: +request <title>=<text>");
        u.send("       +request/create <bucket>/<title>=<text>");
        u.send(`Valid buckets: ${getAllBuckets().join(", ")}`);
        return;
      }
      const title = rest.slice(0, eq).trim();
      const text  = rest.slice(eq + 1).trim();
      if (!title || !text) { u.send("Usage: +request <title>=<text>"); return; }
      if (!isValidBucket(bucket)) {
        u.send(`>JOBS: Invalid bucket '${bucket}'. Valid: ${getAllBuckets().join(", ")}`);
        return;
      }
      const num = await getNextJobNumber();
      const now = Date.now();
      const job: IJob = {
        id: `job-${num}`, number: num, title,
        bucket: bucket as IJob["bucket"], status: "open",
        submittedBy: u.me.id, submitterName: callerName(u),
        description: text, comments: [], additionalPlayers: [],
        createdAt: now, updatedAt: now,
      };
      await jobs.create(job);
      await jobHooks.emit("job:created", job);
      u.send(`>JOBS: Request #${num} "${title}" submitted to ${bucket}.`);
      return;
    }

    if (sw === "comment") {
      const eq = arg.indexOf("=");
      if (eq === -1) { u.send("Usage: +request/comment <#>=<text>"); return; }
      const num  = parseInt(arg.slice(0, eq).trim(), 10);
      const text = arg.slice(eq + 1).trim();
      if (isNaN(num) || !text) { u.send("Usage: +request/comment <#>=<text>"); return; }
      const job = await getJobByNumber(num);
      if (!job) { u.send(`>JOBS: No request #${num} found.`); return; }
      if (job.submittedBy !== u.me.id && !job.additionalPlayers?.includes(u.me.id)) {
        u.send(">JOBS: Permission denied."); return;
      }
      const comment: IJobComment = { authorId: u.me.id, authorName: callerName(u), text, timestamp: Date.now(), published: true };
      job.comments.push(comment);
      job.updatedAt = Date.now();
      await jobs.update({ id: job.id }, job);
      await jobHooks.emit("job:commented", job, comment);
      u.send(`>JOBS: Comment added to request #${num}.`);
      return;
    }

    if (sw === "cancel") {
      const num = parseInt(arg, 10);
      if (isNaN(num)) { u.send("Usage: +request/cancel <#>"); return; }
      const job = await getJobByNumber(num);
      if (!job) { u.send(`>JOBS: No request #${num} found.`); return; }
      if (job.submittedBy !== u.me.id) { u.send(">JOBS: You can only cancel your own requests."); return; }
      job.status = "cancelled"; job.updatedAt = Date.now(); job.closedByName = callerName(u);
      await jobArchive.create({ ...job });
      await jobs.delete({ id: job.id });
      await jobHooks.emit("job:closed", job);
      u.send(`>JOBS: Request #${num} cancelled.`);
      return;
    }

    if (sw === "addplayer") {
      const eq = arg.indexOf("=");
      if (eq === -1) { u.send("Usage: +request/addplayer <#>=<player>"); return; }
      const num        = parseInt(arg.slice(0, eq).trim(), 10);
      const playerName = arg.slice(eq + 1).trim();
      if (isNaN(num) || !playerName) { u.send("Usage: +request/addplayer <#>=<player>"); return; }
      const job = await getJobByNumber(num);
      if (!job) { u.send(`>JOBS: No request #${num} found.`); return; }
      if (job.submittedBy !== u.me.id) { u.send(">JOBS: You can only modify your own requests."); return; }
      const target = await u.util.target(u.me, playerName);
      if (!target) { u.send(`>JOBS: Player "${playerName}" not found.`); return; }
      if (!job.additionalPlayers) job.additionalPlayers = [];
      if (job.additionalPlayers.includes(target.id)) { u.send(`>JOBS: ${target.name} already added.`); return; }
      job.additionalPlayers.push(target.id);
      job.updatedAt = Date.now();
      await jobs.update({ id: job.id }, job);
      u.send(`>JOBS: ${target.name} added to request #${num}.`);
      await sendJobMail(u.me.id, target.id, `Added to Request #${num}`, `You have been added as a viewer to Request #${num}: ${job.title}`);
      return;
    }

    u.send(">JOBS: Usage:");
    u.send("  +request / +requests             - list your requests");
    u.send("  +request <#>                     - view a request");
    u.send("  +request <title>=<text>          - submit a request");
    u.send("  +request/create <b>/<title>=<t>  - submit to specific bucket");
    u.send("  +request/comment <#>=<text>      - add a comment");
    u.send("  +request/cancel <#>              - cancel your request");
    u.send("  +request/addplayer <#>=<player>  - add a viewer");
    u.send(`  Valid buckets: ${getAllBuckets().join(", ")}`);
  },
});

addCmd({
  name: "+requests",
  pattern: /^\+requests\s*$/i,
  lock: "connected",
  help: `+requests  — List all of your open requests.

Examples:
  +requests   Show all open requests you submitted.
  +requests   Also shows requests you were added to as a viewer.`,
  exec: async (u: IUrsamuSDK) => {
    const myJobs = (await jobs.find({})).filter(
      (j) => j.submittedBy === u.me.id || j.additionalPlayers?.includes(u.me.id),
    );
    if (myJobs.length === 0) { u.send(">JOBS: You have no open requests."); return; }
    myJobs.sort((a, b) => a.number - b.number);
    u.send(formatJobList(myJobs, "POP Jobs").join("\n"));
  },
});

addCmd({
  name: "+myjobs",
  pattern: /^\+myjobs?\s*(.*)$/i,
  lock: "connected",
  help: `+myjobs  — List your open requests (alias for +requests). Superusers see all jobs.

Examples:
  +myjobs   Show your open requests (same as +requests).
  +myjobs   Superusers: shows all open jobs across all players.`,
  exec: async (u: IUrsamuSDK) => {
    const all = await jobs.find({});
    if (u.me.flags.has("superuser")) {
      if (all.length === 0) { u.send(">JOBS: No open jobs."); return; }
      all.sort((a, b) => a.number - b.number);
      u.send(formatJobList(all, "POP Jobs").join("\n"));
      return;
    }
    const myJobs = all.filter(
      (j) => j.submittedBy === u.me.id || j.additionalPlayers?.includes(u.me.id),
    );
    if (myJobs.length === 0) { u.send(">JOBS: You have no open requests."); return; }
    myJobs.sort((a, b) => a.number - b.number);
    u.send(formatJobList(myJobs, "POP Jobs").join("\n"));
  },
});
