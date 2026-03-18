import type { IJob, IJobComment } from "../../@types/IJob.ts";

// ─── hook type map ────────────────────────────────────────────────────────────

export type JobHookMap = {
  /** A new job was submitted. */
  "job:created":          (job: IJob) => void | Promise<void>;
  /** A comment or staff note was added. */
  "job:commented":        (job: IJob, comment: IJobComment) => void | Promise<void>;
  /** Status was changed. `oldStatus` is the previous value. */
  "job:status-changed":   (job: IJob, oldStatus: string) => void | Promise<void>;
  /** Job was assigned to a staff member. */
  "job:assigned":         (job: IJob) => void | Promise<void>;
  /** Priority was changed. `oldPriority` is the previous value. */
  "job:priority-changed": (job: IJob, oldPriority: string) => void | Promise<void>;
  /** Job was closed. */
  "job:closed":           (job: IJob) => void | Promise<void>;
  /** Job was marked resolved. */
  "job:resolved":         (job: IJob) => void | Promise<void>;
  /** A closed/resolved job was reopened. */
  "job:reopened":         (job: IJob) => void | Promise<void>;
  /** Job was permanently deleted. */
  "job:deleted":          (job: IJob) => void | Promise<void>;
};

type HandlerList = { [K in keyof JobHookMap]: JobHookMap[K][] };

// ─── registry ─────────────────────────────────────────────────────────────────

const _handlers: HandlerList = {
  "job:created":          [],
  "job:commented":        [],
  "job:status-changed":   [],
  "job:assigned":         [],
  "job:priority-changed": [],
  "job:closed":           [],
  "job:resolved":         [],
  "job:reopened":         [],
  "job:deleted":          [],
};

// ─── public API ───────────────────────────────────────────────────────────────

export const jobHooks = {
  /**
   * Register a handler for a job lifecycle event.
   *
   * @example
   * ```ts
   * import { jobHooks } from "@ursamu/ursamu/plugins/jobs";
   *
   * jobHooks.on("job:created", (job) => {
   *   console.log(`New job #${job.number}: ${job.title}`);
   * });
   * ```
   */
  on<K extends keyof JobHookMap>(event: K, handler: JobHookMap[K]): void {
    (_handlers[event] as JobHookMap[K][]).push(handler);
  },

  /** Remove a previously registered handler. */
  off<K extends keyof JobHookMap>(event: K, handler: JobHookMap[K]): void {
    const list = _handlers[event] as JobHookMap[K][];
    const idx = list.indexOf(handler);
    if (idx !== -1) list.splice(idx, 1);
  },

  /** Fire all registered handlers for an event (errors are caught and logged). */
  async emit<K extends keyof JobHookMap>(
    event: K,
    ...args: Parameters<JobHookMap[K]>
  ): Promise<void> {
    for (const handler of [...(_handlers[event] as ((...a: Parameters<JobHookMap[K]>) => void | Promise<void>)[])]) {
      try {
        await (handler as (...a: Parameters<JobHookMap[K]>) => void | Promise<void>)(...args);
      } catch (e) {
        console.error(`[jobs] Uncaught error in hook "${event}":`, e);
      }
    }
  },
};
