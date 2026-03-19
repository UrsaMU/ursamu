/**
 * Anomaly-style Jobs System — ported from Evennia
 *
 * Player commands: +request / +requests / +myjob / +myjobs
 * Staff commands:  +jobs / +job
 * Archive:         +archive
 */

import { addCmd } from "../../services/commands/cmdParser.ts";
import type { IUrsamuSDK } from "../../@types/UrsamuSDK.ts";
import { jobs, jobArchive, jobAccess, getNextJobNumber } from "./db.ts";
import type { IJob, IJobComment, IJobAccess } from "../../@types/IJob.ts";
import { VALID_BUCKETS } from "../../@types/IJob.ts";
import { jobHooks } from "./hooks.ts";
import { send as broadcastSend } from "../../services/broadcast/index.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WIDTH = 77;

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
}

function header(title: string): string {
  const t = ` ${title} `;
  const pad = Math.floor((WIDTH - t.length) / 2);
  return "=".repeat(pad) + t + "=".repeat(WIDTH - pad - t.length);
}

function divider(): string {
  return "-".repeat(WIDTH);
}

function footer(): string {
  return "=".repeat(WIDTH);
}

function formatDate(epoch: number): string {
  try {
    const d = new Date(epoch);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  } catch {
    return "???";
  }
}

function formatTimestamp(epoch: number): string {
  try {
    const d = new Date(epoch);
    return d.toISOString().slice(0, 16).replace("T", " ");
  } catch {
    return "???";
  }
}

function getEscalation(job: IJob): { color: string; label: string } {
  const ageHours = (Date.now() - job.createdAt) / 3600000;
  if (ageHours < 48) return { color: "%cg", label: "OK" };
  if (ageHours < 96) return { color: "%cy", label: "DUE" };
  return { color: "%cr", label: "OVERDUE" };
}

function isNew(job: IJob): boolean {
  return !job.comments.some((c) => c.authorId !== job.submittedBy);
}

function coloredDate(job: IJob): string {
  const { color } = getEscalation(job);
  return `${color}${formatDate(job.createdAt)}%cn`;
}

async function getJobByNumber(n: number): Promise<IJob | null> {
  const all = await jobs.find({});
  return all.find((j) => j.number === n) || null;
}

async function canStaffSeeBucket(staffId: string, bucket: string, isSuperuser: boolean): Promise<boolean> {
  if (isSuperuser) return true;
  const access = await jobAccess.queryOne({ id: bucket });
  if (!access || !access.staffIds || access.staffIds.length === 0) return true;
  return access.staffIds.includes(staffId);
}

async function notifyPlayer(u: IUrsamuSDK, playerId: string, subject: string, body: string): Promise<void> {
  try {
    // Use the mail system to send notification
    const { dbojs } = await import("../../services/Database/index.ts");
    const player = await dbojs.queryOne({ id: playerId });
    if (!player) return;

    const senderName = (u.me.state?.name as string) || u.me.name || "System";
    const mail = {
      from: u.me.id,
      fromName: senderName,
      to: [playerId],
      subject,
      body,
      date: Date.now(),
      read: false,
    };

    // Store mail on recipient
    const existing = (player.data?.mail as unknown[]) || [];
    existing.push(mail);
    await dbojs.modify({ id: playerId }, "$set", { "data.mail": existing });
  } catch {
    // Mail notification failure shouldn't break jobs
  }
}

async function broadcastToStaff(message: string, bucket: string): Promise<void> {
  try {
    const { dbojs } = await import("../../services/Database/index.ts");
    const connected = await dbojs.query({ flags: /connected/ });
    const staffPlayers = connected.filter(
      (p) => p.flags && (p.flags.includes("admin") || p.flags.includes("wizard") || p.flags.includes("superuser")),
    );

    for (const staff of staffPlayers) {
      const canSee = await canStaffSeeBucket(staff.id, bucket, staff.flags.includes("superuser"));
      if (canSee) {
        broadcastSend([staff.id], message);
      }
    }
  } catch {
    // Broadcast failure shouldn't break jobs
  }
}

// ---------------------------------------------------------------------------
// +request — Player command
// ---------------------------------------------------------------------------

addCmd({
  name: "+request",
  pattern: /^\+request(?!s)(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    // Handle "+requests" being caught
    if (u.cmd.original?.trim().match(/^\+requests?\s*$/i)) {
      // List own jobs
      const all = await jobs.find({});
      const myJobs = all.filter(
        (j) => j.submittedBy === u.me.id || j.additionalPlayers?.includes(u.me.id),
      );

      if (myJobs.length === 0) {
        u.send(">JOBS: You have no open requests.");
        return;
      }

      myJobs.sort((a, b) => a.number - b.number);
      const lines: string[] = [];
      lines.push(header("My Requests"));
      lines.push(
        `${"#".padEnd(5)}${"Bucket".padEnd(12)}${"Title".padEnd(30)}${"Date".padEnd(12)}${"Status".padEnd(10)}Esc`,
      );
      lines.push(divider());

      for (const j of myJobs) {
        const esc = getEscalation(j);
        const newTag = isNew(j) ? " NEW" : "";
        lines.push(
          `${String(j.number).padEnd(5)}${j.bucket.padEnd(12)}${j.title.slice(0, 29).padEnd(30)}${formatDate(j.createdAt).padEnd(12)}${j.status.padEnd(10)}${esc.color}${esc.label}${newTag}%cn`,
        );
      }

      lines.push(divider());
      lines.push(`${myJobs.length} request${myJobs.length === 1 ? "" : "s"}.`);
      u.send(lines.join("\n"));
      return;
    }

    const sw = (u.cmd.args[0] || "").toLowerCase().trim();
    const arg = (u.cmd.args[1] || "").trim();

    // +request <#> — view a job
    if (!sw && arg && !arg.includes("=")) {
      const num = parseInt(arg, 10);
      if (!isNaN(num)) {
        const job = await getJobByNumber(num);
        if (!job) { u.send(`>JOBS: No request #${num} found.`); return; }
        if (job.submittedBy !== u.me.id && !job.additionalPlayers?.includes(u.me.id)) {
          u.send(">JOBS: Permission denied."); return;
        }

        const esc = getEscalation(job);
        const lines: string[] = [];
        lines.push(header(`Request #${job.number}`));
        lines.push(` Title:    ${job.title}`);
        lines.push(` Bucket:   ${job.bucket}`);
        lines.push(` Created:  ${coloredDate(job)}  ${esc.color}[${esc.label}]%cn`);
        lines.push(` Handler:  ${job.assigneeName || "Unassigned"}`);
        lines.push(` Status:   ${job.status}`);
        lines.push(divider());
        lines.push(job.description);

        const pubComments = job.comments.filter((c) => c.published);
        if (pubComments.length > 0) {
          lines.push(divider());
          lines.push(header("Comments"));
          for (const c of pubComments) {
            lines.push(`[${c.authorName}] ${formatTimestamp(c.timestamp)}`);
            lines.push(`  ${c.text}`);
          }
        }

        if (job.additionalPlayers && job.additionalPlayers.length > 0) {
          lines.push(divider());
          lines.push(` Additional viewers: ${job.additionalPlayers.join(", ")}`);
        }

        lines.push(footer());
        u.send(lines.join("\n"));
        return;
      }
    }

    // +request Title=Text — create job (default bucket: SPHERE)
    if (!sw || sw === "create") {
      let bucket = "SPHERE";
      let rest = arg;

      if (sw === "create") {
        // +request/create BUCKET/Title=Text
        const slashIdx = arg.indexOf("/");
        if (slashIdx !== -1) {
          bucket = arg.slice(0, slashIdx).trim().toUpperCase();
          rest = arg.slice(slashIdx + 1);
        }
      }

      const eqIdx = rest.indexOf("=");
      if (eqIdx === -1) {
        u.send("Usage: +request <title>=<text>");
        u.send("       +request/create <bucket>/<title>=<text>");
        u.send(`Valid buckets: ${VALID_BUCKETS.join(", ")}`);
        return;
      }

      const title = rest.slice(0, eqIdx).trim();
      const text = rest.slice(eqIdx + 1).trim();
      if (!title || !text) { u.send("Usage: +request <title>=<text>"); return; }

      if (!VALID_BUCKETS.includes(bucket as typeof VALID_BUCKETS[number])) {
        u.send(`>JOBS: Invalid bucket '${bucket}'. Valid: ${VALID_BUCKETS.join(", ")}`);
        return;
      }

      const num = await getNextJobNumber();
      const now = Date.now();
      const submitterName = (u.me.state?.moniker as string) || (u.me.state?.name as string) || u.me.name || "Unknown";

      const job: IJob = {
        id: `job-${num}`,
        number: num,
        title,
        bucket: bucket as IJob["bucket"],
        status: "open",
        submittedBy: u.me.id,
        submitterName,
        description: text,
        comments: [],
        additionalPlayers: [],
        createdAt: now,
        updatedAt: now,
      };

      await jobs.create(job);
      await jobHooks.emit("job:created", job);
      u.send(`>JOBS: Request #${num} "${title}" submitted to ${bucket}.`);
      await broadcastToStaff(`>JOBS: ${submitterName} submitted Request #${num} "${title}" [${bucket}].`, bucket);
      return;
    }

    // +request/comment <#>=<text>
    if (sw === "comment") {
      const eqIdx = arg.indexOf("=");
      if (eqIdx === -1) { u.send("Usage: +request/comment <#>=<text>"); return; }
      const num = parseInt(arg.slice(0, eqIdx).trim(), 10);
      const text = arg.slice(eqIdx + 1).trim();
      if (isNaN(num) || !text) { u.send("Usage: +request/comment <#>=<text>"); return; }

      const job = await getJobByNumber(num);
      if (!job) { u.send(`>JOBS: No request #${num} found.`); return; }
      if (job.submittedBy !== u.me.id && !job.additionalPlayers?.includes(u.me.id)) {
        u.send(">JOBS: Permission denied."); return;
      }

      const authorName = (u.me.state?.moniker as string) || (u.me.state?.name as string) || u.me.name || "Unknown";
      const comment: IJobComment = {
        authorId: u.me.id,
        authorName,
        text,
        timestamp: Date.now(),
        published: true,
      };

      job.comments.push(comment);
      job.updatedAt = Date.now();
      await jobs.update({}, job);
      await jobHooks.emit("job:commented", job, comment);
      u.send(`>JOBS: Comment added to request #${num}.`);
      await broadcastToStaff(`>JOBS: ${authorName} updated Request #${num}.`, job.bucket);
      return;
    }

    // +request/cancel <#>
    if (sw === "cancel") {
      const num = parseInt(arg, 10);
      if (isNaN(num)) { u.send("Usage: +request/cancel <#>"); return; }

      const job = await getJobByNumber(num);
      if (!job) { u.send(`>JOBS: No request #${num} found.`); return; }
      if (job.submittedBy !== u.me.id) { u.send(">JOBS: You can only cancel your own requests."); return; }

      job.status = "cancelled";
      job.updatedAt = Date.now();
      const closerName = (u.me.state?.name as string) || u.me.name || "Unknown";
      job.closedByName = closerName;

      await jobArchive.create({ ...job });
      await jobs.delete({ id: job.id });
      await jobHooks.emit("job:closed", job);
      u.send(`>JOBS: Request #${num} cancelled.`);
      return;
    }

    // +request/addplayer <#>=<player>
    if (sw === "addplayer") {
      const eqIdx = arg.indexOf("=");
      if (eqIdx === -1) { u.send("Usage: +request/addplayer <#>=<player>"); return; }
      const num = parseInt(arg.slice(0, eqIdx).trim(), 10);
      const playerName = arg.slice(eqIdx + 1).trim();
      if (isNaN(num) || !playerName) { u.send("Usage: +request/addplayer <#>=<player>"); return; }

      const job = await getJobByNumber(num);
      if (!job) { u.send(`>JOBS: No request #${num} found.`); return; }
      if (job.submittedBy !== u.me.id) { u.send(">JOBS: You can only modify your own requests."); return; }

      const target = await u.util.target(u.me, playerName);
      if (!target) { u.send(`>JOBS: Player "${playerName}" not found.`); return; }

      if (!job.additionalPlayers) job.additionalPlayers = [];
      if (job.additionalPlayers.includes(target.id)) {
        u.send(`>JOBS: ${target.name} is already added to request #${num}.`);
        return;
      }

      job.additionalPlayers.push(target.id);
      job.updatedAt = Date.now();
      await jobs.update({}, job);
      u.send(`>JOBS: ${target.name} added to request #${num}.`);
      await notifyPlayer(u, target.id, `Added to Request #${num}`, `You have been added as a viewer to Request #${num}: ${job.title}`);
      return;
    }

    // Usage
    u.send(">JOBS: Usage:");
    u.send("  +request                            - list your requests");
    u.send("  +request <#>                        - view a request");
    u.send("  +request <title>=<text>             - submit a request");
    u.send("  +request/create <bucket>/<title>=<text> - submit to specific bucket");
    u.send("  +request/comment <#>=<text>         - add a comment");
    u.send("  +request/cancel <#>                 - cancel your request");
    u.send("  +request/addplayer <#>=<player>     - add a viewer");
    u.send(`  Valid buckets: ${VALID_BUCKETS.join(", ")}`);
  },
});

// Aliases for +request
addCmd({
  name: "+requests",
  pattern: /^\+requests\s*$/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    // Delegate to +request list
    const all = await jobs.find({});
    const myJobs = all.filter(
      (j) => j.submittedBy === u.me.id || j.additionalPlayers?.includes(u.me.id),
    );
    if (myJobs.length === 0) { u.send(">JOBS: You have no open requests."); return; }
    myJobs.sort((a, b) => a.number - b.number);
    const lines: string[] = [];
    lines.push(header("My Requests"));
    lines.push(`${"#".padEnd(5)}${"Bucket".padEnd(12)}${"Title".padEnd(30)}${"Date".padEnd(12)}${"Status".padEnd(10)}Esc`);
    lines.push(divider());
    for (const j of myJobs) {
      const esc = getEscalation(j);
      const newTag = isNew(j) ? " NEW" : "";
      lines.push(`${String(j.number).padEnd(5)}${j.bucket.padEnd(12)}${j.title.slice(0, 29).padEnd(30)}${formatDate(j.createdAt).padEnd(12)}${j.status.padEnd(10)}${esc.color}${esc.label}${newTag}%cn`);
    }
    lines.push(divider());
    lines.push(`${myJobs.length} request${myJobs.length === 1 ? "" : "s"}.`);
    u.send(lines.join("\n"));
  },
});

addCmd({
  name: "+myjobs",
  pattern: /^\+myjobs?\s*(.*)$/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    // Same as +requests
    const all = await jobs.find({});
    const myJobs = all.filter(
      (j) => j.submittedBy === u.me.id || j.additionalPlayers?.includes(u.me.id),
    );
    if (myJobs.length === 0) { u.send(">JOBS: You have no open requests."); return; }
    myJobs.sort((a, b) => a.number - b.number);
    const lines: string[] = [];
    lines.push(header("My Requests"));
    lines.push(`${"#".padEnd(5)}${"Bucket".padEnd(12)}${"Title".padEnd(30)}${"Date".padEnd(12)}${"Status".padEnd(10)}Esc`);
    lines.push(divider());
    for (const j of myJobs) {
      const esc = getEscalation(j);
      const newTag = isNew(j) ? " NEW" : "";
      lines.push(`${String(j.number).padEnd(5)}${j.bucket.padEnd(12)}${j.title.slice(0, 29).padEnd(30)}${formatDate(j.createdAt).padEnd(12)}${j.status.padEnd(10)}${esc.color}${esc.label}${newTag}%cn`);
    }
    lines.push(divider());
    lines.push(`${myJobs.length} request${myJobs.length === 1 ? "" : "s"}.`);
    u.send(lines.join("\n"));
  },
});

// ---------------------------------------------------------------------------
// +jobs — Staff command
// ---------------------------------------------------------------------------

addCmd({
  name: "+job",
  pattern: /^\+job(?!s)(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    // Handle "+jobs" being caught by "+job"
    if (u.cmd.original?.trim().match(/^\+jobs\s*$/i)) {
      await listStaffJobs(u);
      return;
    }

    if (!isStaff(u)) { u.send(">JOBS: Staff only."); return; }

    const sw = (u.cmd.args[0] || "").toLowerCase().trim();
    const arg = (u.cmd.args[1] || "").trim();

    // +job <#> — view a job (staff sees all comments)
    if (!sw && arg && !arg.includes("=")) {
      const num = parseInt(arg, 10);
      if (!isNaN(num)) {
        const job = await getJobByNumber(num);
        if (!job) { u.send(`>JOBS: No job #${num} found.`); return; }

        const canSee = await canStaffSeeBucket(u.me.id, job.bucket, u.me.flags.has("superuser"));
        if (!canSee) { u.send(">JOBS: You don't have access to that bucket."); return; }

        const esc = getEscalation(job);
        const lines: string[] = [];
        lines.push(header(`Job #${job.number}`));
        lines.push(` Title:     ${job.title}`);
        lines.push(` Bucket:    ${job.bucket}`);
        lines.push(` Submitted: ${job.submitterName} on ${coloredDate(job)}  ${esc.color}[${esc.label}]%cn`);
        lines.push(` Handler:   ${job.assigneeName || "Unassigned"}`);
        lines.push(` Status:    ${job.status}`);
        lines.push(divider());
        lines.push(job.description);

        if (job.comments.length > 0) {
          lines.push(divider());
          lines.push(header("Comments"));
          for (let i = 0; i < job.comments.length; i++) {
            const c = job.comments[i];
            const pubTag = c.published ? "" : " %ch%cr[unpublished]%cn";
            lines.push(`[${i}] [${c.authorName}]${pubTag} ${formatTimestamp(c.timestamp)}`);
            lines.push(`  ${c.text}`);
          }
        }

        if (job.additionalPlayers && job.additionalPlayers.length > 0) {
          lines.push(divider());
          lines.push(` Additional viewers: ${job.additionalPlayers.join(", ")}`);
        }

        lines.push(footer());
        u.send(lines.join("\n"));
        return;
      }
    }

    // +job/bucket <bucket> — filter by bucket
    if (sw === "bucket") {
      const bucket = arg.toUpperCase();
      if (!VALID_BUCKETS.includes(bucket as typeof VALID_BUCKETS[number])) {
        u.send(`>JOBS: Invalid bucket. Valid: ${VALID_BUCKETS.join(", ")}`);
        return;
      }
      await listStaffJobs(u, bucket);
      return;
    }

    // +job/comment <#>=<text>
    if (sw === "comment") {
      const eqIdx = arg.indexOf("=");
      if (eqIdx === -1) { u.send("Usage: +job/comment <#>=<text>"); return; }
      const num = parseInt(arg.slice(0, eqIdx).trim(), 10);
      const text = arg.slice(eqIdx + 1).trim();
      if (isNaN(num) || !text) { u.send("Usage: +job/comment <#>=<text>"); return; }

      const job = await getJobByNumber(num);
      if (!job) { u.send(`>JOBS: No job #${num} found.`); return; }

      const authorName = (u.me.state?.moniker as string) || (u.me.state?.name as string) || u.me.name || "Unknown";
      const comment: IJobComment = {
        authorId: u.me.id,
        authorName,
        text,
        timestamp: Date.now(),
        published: true,
      };

      job.comments.push(comment);
      job.updatedAt = Date.now();
      await jobs.update({}, job);
      await jobHooks.emit("job:commented", job, comment);
      u.send(`>JOBS: Comment added to job #${num}.`);

      // Notify creator and additional players
      const notifyIds = [job.submittedBy, ...(job.additionalPlayers || [])];
      for (const pid of notifyIds) {
        if (pid !== u.me.id) {
          await notifyPlayer(u, pid, `Job #${num} Updated`, `${authorName} commented on your request #${num}: ${text}`);
        }
      }
      return;
    }

    // +job/assign <#>=<staff>
    if (sw === "assign") {
      const eqIdx = arg.indexOf("=");
      if (eqIdx === -1) { u.send("Usage: +job/assign <#>=<staff>"); return; }
      const num = parseInt(arg.slice(0, eqIdx).trim(), 10);
      const name = arg.slice(eqIdx + 1).trim();
      if (isNaN(num) || !name) { u.send("Usage: +job/assign <#>=<staff>"); return; }

      const job = await getJobByNumber(num);
      if (!job) { u.send(`>JOBS: No job #${num} found.`); return; }

      const target = await u.util.target(u.me, name);
      if (!target) { u.send(`>JOBS: Player "${name}" not found.`); return; }

      job.assignedTo = target.id;
      job.assigneeName = (target.state?.moniker as string) || (target.state?.name as string) || target.name || "Unknown";
      job.updatedAt = Date.now();
      await jobs.update({}, job);
      await jobHooks.emit("job:assigned", job);
      u.send(`>JOBS: Job #${num} assigned to ${job.assigneeName}.`);
      return;
    }

    // +job/close <#>[=<comment>]
    if (sw === "close") {
      const eqIdx = arg.indexOf("=");
      const numStr = eqIdx !== -1 ? arg.slice(0, eqIdx).trim() : arg;
      const reason = eqIdx !== -1 ? arg.slice(eqIdx + 1).trim() : "";
      const num = parseInt(numStr, 10);
      if (isNaN(num)) { u.send("Usage: +job/close <#>[=<comment>]"); return; }

      const job = await getJobByNumber(num);
      if (!job) { u.send(`>JOBS: No job #${num} found.`); return; }

      const closerName = (u.me.state?.name as string) || u.me.name || "Unknown";

      if (reason) {
        job.comments.push({
          authorId: u.me.id,
          authorName: closerName,
          text: reason,
          timestamp: Date.now(),
          published: true,
        });
      }

      job.status = "closed";
      job.closedByName = closerName;
      job.updatedAt = Date.now();

      await jobArchive.create({ ...job });
      await jobs.delete({ id: job.id });
      await jobHooks.emit("job:closed", job);
      u.send(`>JOBS: Job #${num} closed and archived.`);

      // Notify creator and additional players
      const notifyIds = [job.submittedBy, ...(job.additionalPlayers || [])];
      for (const pid of notifyIds) {
        if (pid !== u.me.id) {
          const closeMsg = reason ? `Closed with comment: ${reason}` : "Closed.";
          await notifyPlayer(u, pid, `Request #${num} Closed`, `Your request #${num} "${job.title}" has been closed by ${closerName}. ${closeMsg}`);
        }
      }
      return;
    }

    // +job/addplayer <player> to <#>
    if (sw === "addplayer") {
      const toMatch = arg.match(/^(.+?)\s+to\s+(\d+)\s*$/i);
      if (!toMatch) { u.send("Usage: +job/addplayer <player> to <#>"); return; }
      const playerName = toMatch[1].trim();
      const num = parseInt(toMatch[2], 10);

      const job = await getJobByNumber(num);
      if (!job) { u.send(`>JOBS: No job #${num} found.`); return; }

      const target = await u.util.target(u.me, playerName);
      if (!target) { u.send(`>JOBS: Player "${playerName}" not found.`); return; }

      if (!job.additionalPlayers) job.additionalPlayers = [];
      if (job.additionalPlayers.includes(target.id)) {
        u.send(`>JOBS: ${target.name} already added to job #${num}.`);
        return;
      }

      job.additionalPlayers.push(target.id);
      job.updatedAt = Date.now();
      await jobs.update({}, job);
      u.send(`>JOBS: ${target.name} added to job #${num}.`);
      await notifyPlayer(u, target.id, `Added to Job #${num}`, `You have been added as a viewer to Job #${num}: ${job.title}`);
      return;
    }

    // +job/addaccess <bucket>=<staff>
    if (sw === "addaccess") {
      if (!u.me.flags.has("superuser")) { u.send(">JOBS: Superuser only."); return; }
      const eqIdx = arg.indexOf("=");
      if (eqIdx === -1) { u.send("Usage: +job/addaccess <bucket>=<staff>"); return; }
      const bucket = arg.slice(0, eqIdx).trim().toUpperCase();
      const staffName = arg.slice(eqIdx + 1).trim();

      if (!VALID_BUCKETS.includes(bucket as typeof VALID_BUCKETS[number])) {
        u.send(`>JOBS: Invalid bucket. Valid: ${VALID_BUCKETS.join(", ")}`);
        return;
      }

      const target = await u.util.target(u.me, staffName);
      if (!target) { u.send(`>JOBS: Staff "${staffName}" not found.`); return; }

      let access = await jobAccess.queryOne({ id: bucket });
      if (!access) {
        await jobAccess.create({ id: bucket, staffIds: [target.id] });
      } else {
        if (!access.staffIds.includes(target.id)) {
          access.staffIds.push(target.id);
          await jobAccess.update({}, access);
        }
      }
      u.send(`>JOBS: ${target.name} granted access to ${bucket} bucket.`);
      return;
    }

    // +job/removeaccess <bucket>=<staff>
    if (sw === "removeaccess") {
      if (!u.me.flags.has("superuser")) { u.send(">JOBS: Superuser only."); return; }
      const eqIdx = arg.indexOf("=");
      if (eqIdx === -1) { u.send("Usage: +job/removeaccess <bucket>=<staff>"); return; }
      const bucket = arg.slice(0, eqIdx).trim().toUpperCase();
      const staffName = arg.slice(eqIdx + 1).trim();

      const target = await u.util.target(u.me, staffName);
      if (!target) { u.send(`>JOBS: Staff "${staffName}" not found.`); return; }

      const access = await jobAccess.queryOne({ id: bucket });
      if (access && access.staffIds.includes(target.id)) {
        access.staffIds = access.staffIds.filter((id: string) => id !== target.id);
        await jobAccess.update({}, access);
      }
      u.send(`>JOBS: ${target.name} removed from ${bucket} bucket.`);
      return;
    }

    // +job/listaccess
    if (sw === "listaccess") {
      if (!u.me.flags.has("superuser")) { u.send(">JOBS: Superuser only."); return; }
      const allAccess = await jobAccess.find({});
      const lines: string[] = [];
      lines.push(header("Bucket Access"));
      for (const bucket of VALID_BUCKETS) {
        const entry = allAccess.find((a: IJobAccess) => a.id === bucket);
        const staffList = entry && entry.staffIds.length > 0 ? entry.staffIds.join(", ") : "(all staff)";
        lines.push(` ${bucket.padEnd(14)} ${staffList}`);
      }
      lines.push(footer());
      u.send(lines.join("\n"));
      return;
    }

    // +job/renumber
    if (sw === "renumber") {
      if (!u.me.flags.has("superuser")) { u.send(">JOBS: Superuser only."); return; }
      const allJobs = await jobs.find({});
      allJobs.sort((a, b) => a.number - b.number);
      let newNum = 1;
      for (const j of allJobs) {
        j.number = newNum++;
        j.id = `job-${j.number}`;
        await jobs.update({}, j);
      }
      u.send(`>JOBS: ${allJobs.length} jobs renumbered.`);
      return;
    }

    // Usage
    u.send(">JOBS: Staff commands:");
    u.send("  +jobs                               - list all open jobs");
    u.send("  +job <#>                            - view a job");
    u.send("  +job/bucket <bucket>                - filter by bucket");
    u.send("  +job/comment <#>=<text>             - add comment");
    u.send("  +job/assign <#>=<staff>             - assign job");
    u.send("  +job/close <#>[=<comment>]          - close and archive");
    u.send("  +job/addplayer <player> to <#>      - add viewer");
    u.send("  +job/addaccess <bucket>=<staff>     - grant bucket access");
    u.send("  +job/removeaccess <bucket>=<staff>  - revoke access");
    u.send("  +job/listaccess                     - show access map");
    u.send("  +job/renumber                       - resequence IDs");
  },
});

// +jobs list
addCmd({
  name: "+jobs",
  pattern: /^\+jobs\s*$/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    await listStaffJobs(u);
  },
});

async function listStaffJobs(u: IUrsamuSDK, filterBucket?: string): Promise<void> {
  if (!isStaff(u)) { u.send(">JOBS: Staff only."); return; }

  const allJobs = await jobs.find({});
  const isSU = u.me.flags.has("superuser");

  let visible: IJob[] = [];
  for (const j of allJobs) {
    if (filterBucket && j.bucket !== filterBucket) continue;
    const canSee = await canStaffSeeBucket(u.me.id, j.bucket, isSU);
    if (canSee) visible.push(j);
  }

  visible.sort((a, b) => a.number - b.number);

  if (visible.length === 0) {
    u.send(filterBucket ? `>JOBS: No open jobs in ${filterBucket}.` : ">JOBS: No open jobs.");
    return;
  }

  const lines: string[] = [];
  lines.push(header(filterBucket ? `Jobs — ${filterBucket}` : "Jobs"));
  lines.push(
    `${"#".padEnd(5)}${"Bucket".padEnd(12)}${"Title".padEnd(25)}${"Submitter".padEnd(16)}${"Date".padEnd(12)}Esc`,
  );
  lines.push(divider());

  for (const j of visible) {
    const esc = getEscalation(j);
    const newTag = isNew(j) ? " NEW" : "";
    lines.push(
      `${String(j.number).padEnd(5)}${j.bucket.padEnd(12)}${j.title.slice(0, 24).padEnd(25)}${j.submitterName.slice(0, 15).padEnd(16)}${coloredDate(j).padEnd(12)}${esc.color}${esc.label}${newTag}%cn`,
    );
  }

  lines.push(divider());
  lines.push(`${visible.length} job${visible.length === 1 ? "" : "s"}.`);
  u.send(lines.join("\n"));
}

// ---------------------------------------------------------------------------
// +archive — Staff command
// ---------------------------------------------------------------------------

addCmd({
  name: "+archive",
  pattern: /^\+archive(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    if (!isStaff(u)) { u.send(">JOBS: Staff only."); return; }

    const sw = (u.cmd.args[0] || "").toLowerCase().trim();
    const arg = (u.cmd.args[1] || "").trim();

    // +archive — list
    if (!sw && !arg) {
      const archived = await jobArchive.find({});
      if (archived.length === 0) { u.send(">JOBS: No archived jobs."); return; }
      archived.sort((a, b) => b.number - a.number);

      const lines: string[] = [];
      lines.push(header("Archived Jobs"));
      lines.push(`${"#".padEnd(5)}${"Bucket".padEnd(12)}${"Title".padEnd(30)}${"Status".padEnd(12)}Date`);
      lines.push(divider());

      for (const j of archived) {
        lines.push(
          `${String(j.number).padEnd(5)}${j.bucket.padEnd(12)}${j.title.slice(0, 29).padEnd(30)}${j.status.padEnd(12)}${formatDate(j.updatedAt)}`,
        );
      }
      lines.push(divider());
      lines.push(`${archived.length} archived job${archived.length === 1 ? "" : "s"}.`);
      u.send(lines.join("\n"));
      return;
    }

    // +archive <#> or +archive/read <#>
    if ((!sw && arg) || sw === "read") {
      const num = parseInt(sw === "read" ? arg : arg, 10);
      if (isNaN(num)) { u.send("Usage: +archive <#>"); return; }

      const archived = await jobArchive.find({});
      const job = archived.find((j) => j.number === num);
      if (!job) { u.send(`>JOBS: No archived job #${num} found.`); return; }

      const lines: string[] = [];
      lines.push(header(`Archived Job #${job.number}`));
      lines.push(` Title:     ${job.title}`);
      lines.push(` Bucket:    ${job.bucket}`);
      lines.push(` Submitted: ${job.submitterName} on ${formatDate(job.createdAt)}`);
      lines.push(` Closed by: ${job.closedByName || "Unknown"}`);
      lines.push(` Status:    ${job.status}`);
      lines.push(divider());
      lines.push(job.description);

      if (job.comments.length > 0) {
        lines.push(divider());
        lines.push(header("Comments"));
        for (const c of job.comments) {
          const pubTag = c.published ? "" : " [unpublished]";
          lines.push(`[${c.authorName}]${pubTag} ${formatTimestamp(c.timestamp)}`);
          lines.push(`  ${c.text}`);
        }
      }
      lines.push(footer());
      u.send(lines.join("\n"));
      return;
    }

    // +archive/purge <#>
    if (sw === "purge") {
      if (!u.me.flags.has("superuser")) { u.send(">JOBS: Superuser only."); return; }
      const num = parseInt(arg, 10);
      if (isNaN(num)) { u.send("Usage: +archive/purge <#>"); return; }

      const archived = await jobArchive.find({});
      const job = archived.find((j) => j.number === num);
      if (!job) { u.send(`>JOBS: No archived job #${num} found.`); return; }

      await jobArchive.delete({ id: job.id });
      u.send(`>JOBS: Archived job #${num} permanently deleted.`);
      return;
    }

    // +archive/purgeall CONFIRM
    if (sw === "purgeall") {
      if (!u.me.flags.has("superuser")) { u.send(">JOBS: Superuser only."); return; }
      if (arg !== "CONFIRM") {
        u.send(">JOBS: Type '+archive/purgeall CONFIRM' to delete ALL archived jobs.");
        return;
      }

      const archived = await jobArchive.find({});
      for (const j of archived) {
        await jobArchive.delete({ id: j.id });
      }
      u.send(`>JOBS: ${archived.length} archived jobs permanently deleted.`);
      return;
    }

    u.send(">JOBS: Archive commands:");
    u.send("  +archive             - list archived jobs");
    u.send("  +archive <#>         - view archived job");
    u.send("  +archive/purge <#>   - delete archived job");
    u.send("  +archive/purgeall CONFIRM - delete all archived jobs");
  },
});
