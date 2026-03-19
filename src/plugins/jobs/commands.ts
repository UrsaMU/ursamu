import { addCmd } from "../../services/commands/cmdParser.ts";
import type { IUrsamuSDK } from "../../@types/UrsamuSDK.ts";
import { jobs, getNextJobNumber } from "./db.ts";
import type { IJob, IJobComment } from "../../@types/IJob.ts";
import { jobHooks } from "./hooks.ts";

// ─── helpers ────────────────────────────────────────────────────────────────

const VALID_CATEGORIES = ["request", "bug", "app", "complaint", "idea", "staff"];
const VALID_STATUSES = ["new", "open", "pending", "in-progress", "resolved", "closed"];
const VALID_PRIORITIES = ["low", "normal", "high", "critical"];

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
}

function statusColor(s: string): string {
  switch (s) {
    case "new":         return "%ch%cg";
    case "open":        return "%cc";
    case "pending":     return "%cy";
    case "in-progress": return "%ch%cy";
    case "resolved":    return "%cg";
    case "closed":      return "%cn";
    default:            return "%cn";
  }
}

function priorityColor(p: string): string {
  switch (p) {
    case "low":      return "%cn";
    case "normal":   return "%cw";
    case "high":     return "%ch%cy";
    case "critical": return "%ch%cr";
    default:         return "%cn";
  }
}

async function getJobByNumber(n: number): Promise<IJob | null> {
  const result = await jobs.queryOne({ number: n });
  return result || null;
}

function makeCommentId(): string {
  return `jc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─── list formatting ─────────────────────────────────────────────────────────

async function listJobs(u: IUrsamuSDK): Promise<void> {
  const staff = isStaff(u);
  const all = await jobs.find({});
  const visible = all.filter(j => {
    if (staff) return true;
    if (j.staffOnly) return false;
    return j.submittedBy === u.me.id;
  });

  visible.sort((a, b) => b.number - a.number);

  if (visible.length === 0) {
    u.send("%ch+jobs:%cn No jobs found.");
    return;
  }

  const header =
    "%ch" +
    u.util.ljust("#", 4) +
    u.util.ljust("Status", 12) +
    u.util.ljust("Pri", 8) +
    u.util.ljust("Category", 12) +
    u.util.ljust("Title", 25) +
    u.util.ljust("Submitter", 16) +
    "%cn";

  u.send("%ch%cc+jobs%cn");
  u.send(header);
  u.send("%ch" + "-".repeat(77) + "%cn");

  for (const j of visible) {
    const sc = statusColor(j.status);
    const pc = priorityColor(j.priority);
    const line =
      u.util.ljust(String(j.number), 4) +
      sc + u.util.ljust(j.status, 12) + "%cn" +
      pc + u.util.ljust(j.priority, 8) + "%cn" +
      u.util.ljust(j.category, 12) +
      u.util.ljust(j.title.slice(0, 24), 25) +
      u.util.ljust(j.submitterName.slice(0, 15), 16);
    u.send(line);
  }
  u.send("%ch" + "-".repeat(77) + "%cn");
}

// ─── +job command ────────────────────────────────────────────────────────────

addCmd({
  name: "+job",
  pattern: /^\+job(?!s)(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] || "").toLowerCase().trim();
    const arg = (u.cmd.args[1] || "").trim();
    const staff = isStaff(u);

    // ── create job (no switch or category switch) ──────────────────────────
    if (!sw || VALID_CATEGORIES.includes(sw)) {
      const category = sw || "request";

      if (category === "staff" && !staff) {
        u.send("%ch+job:%cn You do not have permission to file staff-only jobs.");
        return;
      }

      const eqIdx = arg.indexOf("=");
      if (eqIdx === -1) {
        u.send("Usage: +job[/<category>] <title>=<description>");
        return;
      }

      const title       = arg.slice(0, eqIdx).trim();
      const description = arg.slice(eqIdx + 1).trim();

      if (!title || !description) {
        u.send("Usage: +job[/<category>] <title>=<description>");
        return;
      }

      const num = await getNextJobNumber();
      const now = Date.now();
      const job: IJob = {
        id:            `job-${num}`,
        number:        num,
        title,
        category,
        priority:      "normal",
        status:        "new",
        submittedBy:   u.me.id,
        submitterName: u.me.name || u.me.id,
        description,
        comments:      [],
        createdAt:     now,
        updatedAt:     now,
        staffOnly:     category === "staff",
      };

      await jobs.create(job);
      await jobHooks.emit("job:created", job);
      u.send(`%ch+job:%cn Job #${num} "${title}" submitted (${category}).`);
      return;
    }

    // ── list ───────────────────────────────────────────────────────────────
    if (sw === "list") {
      await listJobs(u);
      return;
    }

    // ── view <#> ──────────────────────────────────────────────────────────
    if (sw === "view") {
      const num = parseInt(arg, 10);
      if (isNaN(num)) { u.send("Usage: +job/view <#>"); return; }
      const job = await getJobByNumber(num);
      if (!job) { u.send(`%ch+job:%cn No job #${num} found.`); return; }

      if (!staff && (job.staffOnly || job.submittedBy !== u.me.id)) {
        u.send("%ch+job:%cn Permission denied.");
        return;
      }

      u.send(`%ch+job #${job.number}:%cn ${job.title}`);
      u.send(`  Category : ${job.category}`);
      u.send(`  Priority : ${priorityColor(job.priority)}${job.priority}%cn`);
      u.send(`  Status   : ${statusColor(job.status)}${job.status}%cn`);
      u.send(`  Submitted: ${job.submitterName} (${new Date(job.createdAt).toISOString()})`);
      if (job.assigneeName) u.send(`  Assigned : ${job.assigneeName}`);
      u.send(`  Description:`);
      u.send(`    ${job.description}`);

      const visibleComments = job.comments.filter(c => staff || !c.staffOnly);
      if (visibleComments.length > 0) {
        u.send("%ch  Comments:%cn");
        for (const c of visibleComments) {
          const tag = c.staffOnly ? " %ch%cr[staff]%cn" : "";
          u.send(`  [${c.authorName}]${tag} ${new Date(c.timestamp).toISOString()}`);
          u.send(`    ${c.text}`);
        }
      }
      return;
    }

    // ── comment <#>=<text> ────────────────────────────────────────────────
    if (sw === "comment") {
      const eqIdx = arg.indexOf("=");
      if (eqIdx === -1) { u.send("Usage: +job/comment <#>=<text>"); return; }
      const num  = parseInt(arg.slice(0, eqIdx).trim(), 10);
      const text = arg.slice(eqIdx + 1).trim();
      if (isNaN(num) || !text) { u.send("Usage: +job/comment <#>=<text>"); return; }

      const job = await getJobByNumber(num);
      if (!job) { u.send(`%ch+job:%cn No job #${num} found.`); return; }
      if (!staff && job.submittedBy !== u.me.id) { u.send("%ch+job:%cn Permission denied."); return; }

      const comment: IJobComment = {
        id:         makeCommentId(),
        authorId:   u.me.id,
        authorName: u.me.name || u.me.id,
        text,
        timestamp:  Date.now(),
        staffOnly:  false,
      };
      const updated: IJob = { ...job, comments: [...job.comments, comment], updatedAt: Date.now() };
      await jobs.update({}, updated);
      await jobHooks.emit("job:commented", updated, comment);
      u.send(`%ch+job:%cn Comment added to job #${num}.`);
      return;
    }

    // ── staffnote <#>=<text> ──────────────────────────────────────────────
    if (sw === "staffnote") {
      if (!staff) { u.send("%ch+job:%cn Permission denied."); return; }
      const eqIdx = arg.indexOf("=");
      if (eqIdx === -1) { u.send("Usage: +job/staffnote <#>=<text>"); return; }
      const num  = parseInt(arg.slice(0, eqIdx).trim(), 10);
      const text = arg.slice(eqIdx + 1).trim();
      if (isNaN(num) || !text) { u.send("Usage: +job/staffnote <#>=<text>"); return; }

      const job = await getJobByNumber(num);
      if (!job) { u.send(`%ch+job:%cn No job #${num} found.`); return; }

      const comment: IJobComment = {
        id:         makeCommentId(),
        authorId:   u.me.id,
        authorName: u.me.name || u.me.id,
        text,
        timestamp:  Date.now(),
        staffOnly:  true,
      };
      const updated: IJob = { ...job, comments: [...job.comments, comment], updatedAt: Date.now() };
      await jobs.update({}, updated);
      await jobHooks.emit("job:commented", updated, comment);
      u.send(`%ch+job:%cn Staff note added to job #${num}.`);
      return;
    }

    // ── close <#>[=<reason>] ──────────────────────────────────────────────
    if (sw === "close") {
      const eqIdx = arg.indexOf("=");
      const numStr = eqIdx !== -1 ? arg.slice(0, eqIdx).trim() : arg;
      const reason = eqIdx !== -1 ? arg.slice(eqIdx + 1).trim() : "";
      const num = parseInt(numStr, 10);
      if (isNaN(num)) { u.send("Usage: +job/close <#>[=<reason>]"); return; }

      const job = await getJobByNumber(num);
      if (!job) { u.send(`%ch+job:%cn No job #${num} found.`); return; }
      if (!staff && job.submittedBy !== u.me.id) { u.send("%ch+job:%cn Permission denied."); return; }

      const now = Date.now();
      const newComments = [...job.comments];
      if (reason) {
        newComments.push({
          id:         makeCommentId(),
          authorId:   u.me.id,
          authorName: u.me.name || u.me.id,
          text:       reason,
          timestamp:  now,
          staffOnly:  false,
        });
      }

      const updated: IJob = { ...job, status: "closed", closedAt: now, updatedAt: now, comments: newComments };
      await jobs.update({}, updated);
      await jobHooks.emit("job:closed", updated);
      u.send(`%ch+job:%cn Job #${num} closed.`);
      return;
    }

    // ── assign <#>=<name> ─────────────────────────────────────────────────
    if (sw === "assign") {
      if (!staff) { u.send("%ch+job:%cn Permission denied."); return; }
      const eqIdx = arg.indexOf("=");
      if (eqIdx === -1) { u.send("Usage: +job/assign <#>=<name>"); return; }
      const num  = parseInt(arg.slice(0, eqIdx).trim(), 10);
      const name = arg.slice(eqIdx + 1).trim();
      if (isNaN(num) || !name) { u.send("Usage: +job/assign <#>=<name>"); return; }

      const job = await getJobByNumber(num);
      if (!job) { u.send(`%ch+job:%cn No job #${num} found.`); return; }

      const target = await u.util.target(u.me, name);
      if (!target) { u.send(`%ch+job:%cn Player "${name}" not found.`); return; }

      const updated: IJob = { ...job, assignedTo: target.id, assigneeName: target.name || target.id, updatedAt: Date.now() };
      await jobs.update({}, updated);
      await jobHooks.emit("job:assigned", updated);
      u.send(`%ch+job:%cn Job #${num} assigned to ${target.name || target.id}.`);
      return;
    }

    // ── status <#>=<status> ───────────────────────────────────────────────
    if (sw === "status") {
      if (!staff) { u.send("%ch+job:%cn Permission denied."); return; }
      const eqIdx = arg.indexOf("=");
      if (eqIdx === -1) { u.send("Usage: +job/status <#>=<status>"); return; }
      const num    = parseInt(arg.slice(0, eqIdx).trim(), 10);
      const status = arg.slice(eqIdx + 1).trim().toLowerCase();
      if (isNaN(num) || !VALID_STATUSES.includes(status)) {
        u.send(`Usage: +job/status <#>=<status>  (valid: ${VALID_STATUSES.join(", ")})`);
        return;
      }

      const job = await getJobByNumber(num);
      if (!job) { u.send(`%ch+job:%cn No job #${num} found.`); return; }

      const updated: IJob = { ...job, status: status as IJob["status"], updatedAt: Date.now() };
      await jobs.update({}, updated);
      await jobHooks.emit("job:status-changed", updated, job.status);
      u.send(`%ch+job:%cn Job #${num} status set to ${status}.`);
      return;
    }

    // ── priority <#>=<priority> ───────────────────────────────────────────
    if (sw === "priority") {
      if (!staff) { u.send("%ch+job:%cn Permission denied."); return; }
      const eqIdx = arg.indexOf("=");
      if (eqIdx === -1) { u.send("Usage: +job/priority <#>=<priority>"); return; }
      const num      = parseInt(arg.slice(0, eqIdx).trim(), 10);
      const priority = arg.slice(eqIdx + 1).trim().toLowerCase();
      if (isNaN(num) || !VALID_PRIORITIES.includes(priority)) {
        u.send(`Usage: +job/priority <#>=<priority>  (valid: ${VALID_PRIORITIES.join(", ")})`);
        return;
      }

      const job = await getJobByNumber(num);
      if (!job) { u.send(`%ch+job:%cn No job #${num} found.`); return; }

      const updated: IJob = { ...job, priority: priority as IJob["priority"], updatedAt: Date.now() };
      await jobs.update({}, updated);
      await jobHooks.emit("job:priority-changed", updated, job.priority);
      u.send(`%ch+job:%cn Job #${num} priority set to ${priority}.`);
      return;
    }

    // ── complete <#>=<resolution> ─────────────────────────────────────────
    if (sw === "complete") {
      if (!staff) { u.send("%ch+job:%cn Permission denied."); return; }
      const eqIdx = arg.indexOf("=");
      if (eqIdx === -1) { u.send("Usage: +job/complete <#>=<resolution>"); return; }
      const num        = parseInt(arg.slice(0, eqIdx).trim(), 10);
      const resolution = arg.slice(eqIdx + 1).trim();
      if (isNaN(num) || !resolution) { u.send("Usage: +job/complete <#>=<resolution>"); return; }

      const job = await getJobByNumber(num);
      if (!job) { u.send(`%ch+job:%cn No job #${num} found.`); return; }

      const now = Date.now();
      const comment: IJobComment = {
        id:         makeCommentId(),
        authorId:   u.me.id,
        authorName: u.me.name || u.me.id,
        text:       resolution,
        timestamp:  now,
        staffOnly:  false,
      };
      const updated: IJob = { ...job, status: "resolved", updatedAt: now, comments: [...job.comments, comment] };
      await jobs.update({}, updated);
      await jobHooks.emit("job:resolved", updated);
      u.send(`%ch+job:%cn Job #${num} marked resolved.`);
      return;
    }

    // ── reopen <#> ────────────────────────────────────────────────────────
    if (sw === "reopen") {
      if (!staff) { u.send("%ch+job:%cn Permission denied."); return; }
      const num = parseInt(arg, 10);
      if (isNaN(num)) { u.send("Usage: +job/reopen <#>"); return; }

      const job = await getJobByNumber(num);
      if (!job) { u.send(`%ch+job:%cn No job #${num} found.`); return; }

      const updated: IJob = { ...job, status: "open", closedAt: undefined, updatedAt: Date.now() };
      await jobs.update({}, updated);
      await jobHooks.emit("job:reopened", updated);
      u.send(`%ch+job:%cn Job #${num} reopened.`);
      return;
    }

    // ── delete <#> ────────────────────────────────────────────────────────
    if (sw === "delete") {
      if (!staff) { u.send("%ch+job:%cn Permission denied."); return; }
      const num = parseInt(arg, 10);
      if (isNaN(num)) { u.send("Usage: +job/delete <#>"); return; }

      const job = await getJobByNumber(num);
      if (!job) { u.send(`%ch+job:%cn No job #${num} found.`); return; }

      await jobs.delete({ id: job.id });
      await jobHooks.emit("job:deleted", job);
      u.send(`%ch+job:%cn Job #${num} deleted.`);
      return;
    }

    // ── usage ─────────────────────────────────────────────────────────────
    u.send("%ch+job usage:%cn");
    u.send("  +job <title>=<description>            - submit a request");
    u.send("  +job/<category> <title>=<description> - submit with category");
    u.send(`    Categories: ${VALID_CATEGORIES.join(", ")}`);
    u.send("  +job/list                             - list jobs");
    u.send("  +job/view <#>                         - view a job");
    u.send("  +job/comment <#>=<text>               - add a comment");
    u.send("  +job/close <#>[=<reason>]             - close a job");
    if (isStaff(u)) {
      u.send("  +job/staffnote <#>=<text>             - add staff-only note");
      u.send("  +job/assign <#>=<name>                - assign a job");
      u.send("  +job/status <#>=<status>              - set status");
      u.send("  +job/priority <#>=<priority>          - set priority");
      u.send("  +job/complete <#>=<resolution>        - mark resolved");
      u.send("  +job/reopen <#>                       - reopen a job");
      u.send("  +job/delete <#>                       - delete a job");
    }
  },
});

// ─── +jobs command ────────────────────────────────────────────────────────────

addCmd({
  name: "+jobs",
  pattern: /^\+jobs\s*(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    await listJobs(u);
  },
});
