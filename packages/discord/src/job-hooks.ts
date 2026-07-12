// Job lifecycle → Discord webhooks. Soft-loads @ursamu/jobs so the
// discord package still works when jobs is not installed.

import { dbojs } from "@ursamu/mush";
import { getDiscordConfig, getWebhookUrl } from "./config.ts";
import { postWebhook } from "./webhook.ts";
import { clean, resolveAvatar, COLORS } from "./helpers.ts";

// Minimal shapes — avoid hard type dep on @ursamu/jobs for JSR publish.
interface IJob {
  number: number;
  title: string;
  description: string;
  status: string;
  bucket?: string;
  category?: string;
  priority?: string;
  submittedBy: string;
  submitterName: string;
  assignedTo?: string;
  assigneeName?: string;
}

interface IJobComment {
  authorId: string;
  authorName: string;
  text: string;
  staffOnly?: boolean;
}

// deno-lint-ignore no-explicit-any
type JobHandler = (...args: any[]) => void | Promise<void>;

interface IJobHooksApi {
  on(event: string, handler: JobHandler): void;
  off(event: string, handler: JobHandler): void;
}

function bucketLabel(job: IJob): string {
  return job.bucket ?? job.category ?? "General";
}

const onJobCreated = async (job: IJob): Promise<void> => {
  const url = await getWebhookUrl("jobs");
  if (!url) return;
  const cfg = await getDiscordConfig();
  const avatar = await resolveAvatar(
    job.submittedBy,
    job.submitterName,
    cfg.publicUrl,
  );
  const priorityNote = job.priority && job.priority !== "normal"
    ? ` • Priority: **${job.priority}**`
    : "";
  postWebhook(url, {
    username: clean(job.submitterName),
    avatar_url: avatar,
    embeds: [{
      color: COLORS.green,
      title: `New Job #${job.number} — ${job.title}`,
      description: job.description.slice(0, 1024),
      footer: {
        text: `Bucket: ${bucketLabel(job)}${priorityNote}`,
      },
    }],
  });
};

const onJobAssigned = async (job: IJob): Promise<void> => {
  const url = await getWebhookUrl("jobs");
  if (!url) return;
  const assigneeObj = job.assignedTo
    ? await dbojs.queryOne({ id: job.assignedTo })
    : null;
  const assignedName = assigneeObj
    ? ((assigneeObj.data?.name as string | undefined) ?? job.assignedTo)
    : (job.assignedTo ?? "Unassigned");
  postWebhook(url, {
    username: "Jobs",
    embeds: [{
      color: COLORS.blue,
      title: `Job #${job.number} Assigned`,
      description:
        `**${job.title}** assigned to **${clean(assignedName ?? "")}**`,
    }],
  });
};

const onJobCommented = async (
  job: IJob,
  comment: IJobComment,
): Promise<void> => {
  const url = await getWebhookUrl("jobs");
  if (!url || comment.staffOnly) return;
  const cfg = await getDiscordConfig();
  const avatar = await resolveAvatar(
    comment.authorId,
    comment.authorName,
    cfg.publicUrl,
  );
  postWebhook(url, {
    username: clean(comment.authorName),
    avatar_url: avatar,
    embeds: [{
      color: COLORS.blurple,
      title: `Comment on Job #${job.number} — ${job.title}`,
      description: comment.text.slice(0, 1024),
    }],
  });
};

const onJobStatusChanged = async (
  job: IJob,
  oldStatus: string,
): Promise<void> => {
  const url = await getWebhookUrl("jobs");
  if (!url) return;
  postWebhook(url, {
    username: "Jobs",
    embeds: [{
      color: COLORS.orange,
      title: `Job #${job.number} Status Changed`,
      description: `**${job.title}**\n${oldStatus} → **${job.status}**`,
      footer: { text: `Bucket: ${bucketLabel(job)}` },
    }],
  });
};

const onJobPriorityChanged = async (
  job: IJob,
  oldPriority: string,
): Promise<void> => {
  const url = await getWebhookUrl("jobs");
  if (!url) return;
  postWebhook(url, {
    username: "Jobs",
    embeds: [{
      color: COLORS.yellow,
      title: `Job #${job.number} Priority Changed`,
      description:
        `**${job.title}**\n${oldPriority} → **${job.priority ?? "normal"}**`,
    }],
  });
};

const onJobResolved = async (job: IJob): Promise<void> => {
  const url = await getWebhookUrl("jobs");
  if (!url) return;
  postWebhook(url, {
    username: "Jobs",
    embeds: [{
      color: COLORS.teal,
      title: `Job #${job.number} Resolved`,
      description: `**${job.title}**`,
      footer: { text: `Bucket: ${bucketLabel(job)}` },
    }],
  });
};

const onJobReopened = async (job: IJob): Promise<void> => {
  const url = await getWebhookUrl("jobs");
  if (!url) return;
  postWebhook(url, {
    username: "Jobs",
    embeds: [{
      color: COLORS.orange,
      title: `Job #${job.number} Reopened`,
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
      color: COLORS.gray,
      title: `Job #${job.number} Closed`,
      description: `**${job.title}**`,
      footer: { text: `Bucket: ${bucketLabel(job)}` },
    }],
  });
};

const onJobDeleted = async (job: IJob): Promise<void> => {
  const url = await getWebhookUrl("jobs");
  if (!url) return;
  postWebhook(url, {
    username: "Jobs",
    embeds: [{
      color: COLORS.red,
      title: `Job #${job.number} Deleted`,
      description: `**${job.title}**`,
    }],
  });
};

const BINDINGS: Array<[string, JobHandler]> = [
  ["job:created", onJobCreated],
  ["job:assigned", onJobAssigned],
  ["job:commented", onJobCommented],
  ["job:status-changed", onJobStatusChanged],
  ["job:priority-changed", onJobPriorityChanged],
  ["job:resolved", onJobResolved],
  ["job:reopened", onJobReopened],
  ["job:closed", onJobClosed],
  ["job:deleted", onJobDeleted],
];

let _hooks: IJobHooksApi | null = null;

export function subscribeJobHooks(): void {
  // Soft-load via package name only (JSR-safe; no relative monorepo paths)
  void (async () => {
    try {
      let mod: { jobHooks?: IJobHooksApi } | null = null;
      try {
        mod = await import("@ursamu/jobs");
      } catch {
        console.log(
          "[discord] Jobs package not found — job webhooks skipped.",
        );
        return;
      }
      if (!mod?.jobHooks) return;
      _hooks = mod.jobHooks;
      for (const [ev, h] of BINDINGS) _hooks.on(ev, h);
      console.log("[discord] Job webhooks subscribed.");
    } catch (e: unknown) {
      console.error("[discord] Job hooks wire failed:", e);
    }
  })();
}

export function unsubscribeJobHooks(): void {
  if (!_hooks) return;
  for (const [ev, h] of BINDINGS) _hooks.off(ev, h);
  _hooks = null;
}
