// Named job-event handlers for the discord plugin.
// All handlers are module-level consts so jobHooks.off() can de-register them
// by reference when the plugin is removed.

import type { IJob, IJobComment } from "../../@types/IJob.ts";
import { dbojs } from "../../services/Database/index.ts";
import { jobHooks } from "../jobs/hooks.ts";
import { getDiscordConfig, getWebhookUrl } from "./config.ts";
import { postWebhook } from "./webhook.ts";
import { clean, resolveAvatar, COLORS } from "./helpers.ts";

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Display the most specific bucket/category label available on a job. */
function bucketLabel(job: IJob): string {
  return job.bucket ?? job.category ?? "General";
}

// ─── handlers ────────────────────────────────────────────────────────────────

const onJobCreated = async (job: IJob): Promise<void> => {
  const url = await getWebhookUrl("jobs");
  if (!url) return;
  const cfg    = await getDiscordConfig();
  const avatar = await resolveAvatar(job.submittedBy, job.submitterName, cfg.publicUrl);
  const priorityNote = job.priority && job.priority !== "normal"
    ? ` • Priority: **${job.priority}**` : "";
  postWebhook(url, {
    username:   clean(job.submitterName),
    avatar_url: avatar,
    embeds: [{
      color:       COLORS.green,
      title:       `New Job #${job.number} — ${job.title}`,
      description: job.description.slice(0, 1024),
      footer:      { text: `Bucket: ${bucketLabel(job)}${priorityNote}` },
    }],
  });
};

const onJobAssigned = async (job: IJob): Promise<void> => {
  const url = await getWebhookUrl("jobs");
  if (!url) return;
  const assigneeObj  = job.assignedTo ? await dbojs.queryOne({ id: job.assignedTo }) : null;
  const assignedName = assigneeObj
    ? (assigneeObj.data?.name as string ?? job.assignedTo)
    : (job.assignedTo ?? "Unassigned");
  postWebhook(url, {
    username: "Jobs",
    embeds: [{
      color:       COLORS.blue,
      title:       `Job #${job.number} Assigned`,
      description: `**${job.title}** assigned to **${clean(assignedName ?? "")}**`,
    }],
  });
};

const onJobCommented = async (job: IJob, comment: IJobComment): Promise<void> => {
  const url = await getWebhookUrl("jobs");
  if (!url || comment.staffOnly) return;
  const cfg    = await getDiscordConfig();
  const avatar = await resolveAvatar(comment.authorId, comment.authorName, cfg.publicUrl);
  postWebhook(url, {
    username:   clean(comment.authorName),
    avatar_url: avatar,
    embeds: [{
      color:       COLORS.blurple,
      title:       `Comment on Job #${job.number} — ${job.title}`,
      description: comment.text.slice(0, 1024),
    }],
  });
};

const onJobStatusChanged = async (job: IJob, oldStatus: string): Promise<void> => {
  const url = await getWebhookUrl("jobs");
  if (!url) return;
  postWebhook(url, {
    username: "Jobs",
    embeds: [{
      color:       COLORS.orange,
      title:       `Job #${job.number} Status Changed`,
      description: `**${job.title}**\n${oldStatus} → **${job.status}**`,
      footer:      { text: `Bucket: ${bucketLabel(job)}` },
    }],
  });
};

const onJobPriorityChanged = async (job: IJob, oldPriority: string): Promise<void> => {
  const url = await getWebhookUrl("jobs");
  if (!url) return;
  postWebhook(url, {
    username: "Jobs",
    embeds: [{
      color:       COLORS.yellow,
      title:       `Job #${job.number} Priority Changed`,
      description: `**${job.title}**\n${oldPriority} → **${job.priority ?? "normal"}**`,
    }],
  });
};

const onJobResolved = async (job: IJob): Promise<void> => {
  const url = await getWebhookUrl("jobs");
  if (!url) return;
  postWebhook(url, {
    username: "Jobs",
    embeds: [{
      color:       COLORS.teal,
      title:       `Job #${job.number} Resolved`,
      description: `**${job.title}**`,
      footer:      { text: `Bucket: ${bucketLabel(job)}` },
    }],
  });
};

const onJobReopened = async (job: IJob): Promise<void> => {
  const url = await getWebhookUrl("jobs");
  if (!url) return;
  postWebhook(url, {
    username: "Jobs",
    embeds: [{
      color:       COLORS.orange,
      title:       `Job #${job.number} Reopened`,
      description: `**${job.title}**`,
    }],
  });
};

const onJobClosed = async (job: IJob): Promise<void> => {
  const url = await getWebhookUrl("jobs");
  if (!url) return;
  postWebhook(url, {
    username: "Jobs",
    embeds: [{
      color:       COLORS.gray,
      title:       `Job #${job.number} Closed`,
      description: `**${job.title}**`,
      footer:      { text: `Bucket: ${bucketLabel(job)}` },
    }],
  });
};

const onJobDeleted = async (job: IJob): Promise<void> => {
  const url = await getWebhookUrl("jobs");
  if (!url) return;
  postWebhook(url, {
    username: "Jobs",
    embeds: [{
      color:       COLORS.red,
      title:       `Job #${job.number} Deleted`,
      description: `**${job.title}**`,
    }],
  });
};

// ─── subscribe / unsubscribe ──────────────────────────────────────────────────

export function subscribeJobHooks(): void {
  jobHooks.on("job:created",          onJobCreated);
  jobHooks.on("job:assigned",         onJobAssigned);
  jobHooks.on("job:commented",        onJobCommented);
  jobHooks.on("job:status-changed",   onJobStatusChanged);
  jobHooks.on("job:priority-changed", onJobPriorityChanged);
  jobHooks.on("job:resolved",         onJobResolved);
  jobHooks.on("job:reopened",         onJobReopened);
  jobHooks.on("job:closed",           onJobClosed);
  jobHooks.on("job:deleted",          onJobDeleted);
}

export function unsubscribeJobHooks(): void {
  jobHooks.off("job:created",          onJobCreated);
  jobHooks.off("job:assigned",         onJobAssigned);
  jobHooks.off("job:commented",        onJobCommented);
  jobHooks.off("job:status-changed",   onJobStatusChanged);
  jobHooks.off("job:priority-changed", onJobPriorityChanged);
  jobHooks.off("job:resolved",         onJobResolved);
  jobHooks.off("job:reopened",         onJobReopened);
  jobHooks.off("job:closed",           onJobClosed);
  jobHooks.off("job:deleted",          onJobDeleted);
}
