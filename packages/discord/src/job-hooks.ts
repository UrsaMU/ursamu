// Job lifecycle → Discord webhooks. Soft-loads @ursamu/jobs so the
// discord package still works when jobs is not installed.

import { dbojs } from "@ursamu/mush";
import { getDiscordConfig, getWebhookUrl, getBotCredentials } from "./config.ts";
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

import { DBO } from "@ursamu/mush";

const jobThreads = new DBO<{ id: string; threadId: string }>("discord.job_threads");
const API = "https://discord.com/api/v10";

/** Post a message directly to a thread, or fallback to the main channel if thread isn't configured. */
async function postToThread(opts: {
  url: string;
  jobNumber: number;
  payload: any;
}): Promise<void> {
  const { url, jobNumber, payload } = opts;
  const cfg = await getDiscordConfig();
  const creds = await getBotCredentials();
  
  if (creds?.botToken) {
    const saved = await jobThreads.queryOne({ id: String(jobNumber) });
    if (saved?.threadId) {
      try {
        await fetch(`${API}/channels/${saved.threadId}/messages`, {
          method: "POST",
          headers: {
            Authorization: `Bot ${creds.botToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        return;
      } catch (e: unknown) {
        console.error(`[discord] Failed to post update to thread ${saved.threadId}:`, e);
      }
    }
  }

  // Fallback to standard webhook message
  postWebhook(url, payload);
}

const onJobCreated = async (job: IJob): Promise<void> => {
  const url = await getWebhookUrl("jobs");
  if (!url) return;
  const cfg = await getDiscordConfig();
  const creds = await getBotCredentials();
  
  const avatar = await resolveAvatar(
    job.submittedBy,
    job.submitterName,
    cfg.publicUrl,
  );
  const priorityNote = job.priority && job.priority !== "normal"
    ? ` • Priority: **${job.priority}**`
    : "";
  
  const payload = {
    username: clean(job.submitterName),
    ...(avatar ? { avatar_url: avatar } : {}),
    embeds: [{
      color: COLORS.green,
      title: `New Job #${job.number} — ${job.title}`,
      description: job.description.slice(0, 1024),
      footer: {
        text: `Bucket: ${bucketLabel(job)}${priorityNote}`,
      },
    }],
  };

  if (creds?.botToken) {
    try {
      // Post webhook with wait=true to get the message payload back
      const res = await fetch(`${url}?wait=true`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const msg = await res.json();
        const msgId = msg.id;
        const channelId = msg.channel_id;

        if (msgId && channelId) {
          // Start a thread on the posted message
          const threadRes = await fetch(`${API}/channels/${channelId}/messages/${msgId}/threads`, {
            method: "POST",
            headers: {
              Authorization: `Bot ${creds.botToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name: `Job #${job.number} — ${job.title.slice(0, 80)}`,
              auto_archive_duration: 10080, // 1 week
            }),
          });
          
          if (threadRes.ok) {
            const thread = await threadRes.json();
            await jobThreads.create({ id: String(job.number), threadId: thread.id });
            console.log(`[discord] Created thread ${thread.id} for Job #${job.number}`);
            return;
          }
        }
      }
    } catch (e: unknown) {
      console.error("[discord] Failed to auto-thread job creation:", e);
    }
  }

  // Fallback to normal webhook if bot credentials or threads API fails
  postWebhook(url, payload);
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
  
  await postToThread({
    url,
    jobNumber: job.number,
    payload: {
      username: "Jobs",
      embeds: [{
        color: COLORS.blue,
        title: "Job Assigned",
        description: `Assigned to **${clean(assignedName ?? "")}**`,
      }],
    }
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

  await postToThread({
    url,
    jobNumber: job.number,
    payload: {
      username: clean(comment.authorName),
      ...(avatar ? { avatar_url: avatar } : {}),
      embeds: [{
        color: COLORS.blurple,
        title: "New Comment",
        description: comment.text.slice(0, 1024),
      }],
    }
  });
};

const onJobStatusChanged = async (
  job: IJob,
  oldStatus: string,
): Promise<void> => {
  const url = await getWebhookUrl("jobs");
  if (!url) return;
  
  await postToThread({
    url,
    jobNumber: job.number,
    payload: {
      username: "Jobs",
      embeds: [{
        color: COLORS.orange,
        title: "Status Changed",
        description: `${oldStatus} → **${job.status}**`,
      }],
    }
  });
};

const onJobPriorityChanged = async (
  job: IJob,
  oldPriority: string,
): Promise<void> => {
  const url = await getWebhookUrl("jobs");
  if (!url) return;
  
  await postToThread({
    url,
    jobNumber: job.number,
    payload: {
      username: "Jobs",
      embeds: [{
        color: COLORS.yellow,
        title: "Priority Changed",
        description: `${oldPriority} → **${job.priority ?? "normal"}**`,
      }],
    }
  });
};

const onJobResolved = async (job: IJob): Promise<void> => {
  const url = await getWebhookUrl("jobs");
  if (!url) return;
  
  await postToThread({
    url,
    jobNumber: job.number,
    payload: {
      username: "Jobs",
      embeds: [{
        color: COLORS.teal,
        title: "Job Resolved",
        description: "This job has been marked resolved.",
      }],
    }
  });
};

const onJobReopened = async (job: IJob): Promise<void> => {
  const url = await getWebhookUrl("jobs");
  if (!url) return;
  
  await postToThread({
    url,
    jobNumber: job.number,
    payload: {
      username: "Jobs",
      embeds: [{
        color: COLORS.orange,
        title: "Job Reopened",
        description: "This job has been reopened.",
      }],
    }
  });
};

const onJobClosed = async (job: IJob): Promise<void> => {
  const url = await getWebhookUrl("jobs");
  if (!url) return;
  
  await postToThread({
    url,
    jobNumber: job.number,
    payload: {
      username: "Jobs",
      embeds: [{
        color: COLORS.gray,
        title: "Job Closed",
        description: "This job has been closed.",
      }],
    }
  });
};

const onJobDeleted = async (job: IJob): Promise<void> => {
  const url = await getWebhookUrl("jobs");
  if (!url) return;
  
  await postToThread({
    url,
    jobNumber: job.number,
    payload: {
      username: "Jobs",
      embeds: [{
        color: COLORS.red,
        title: "Job Deleted",
        description: "This job has been deleted.",
      }],
    }
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
