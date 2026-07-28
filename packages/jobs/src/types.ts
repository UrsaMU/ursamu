// ─── Jobs domain types — source of truth (severed from engine) ────────────────

export const VALID_BUCKETS = [
  "BUG", "BUILD", "CGEN", "SUGGESTION", "TYPO",
  "LOGS", "PLOT", "PRP", "PVP", "ROSTER", "XP",
  "WIKI", "SPHERE", "INFLUENCE",
] as const;

export type JobBucket = typeof VALID_BUCKETS[number];

/** A single comment or staff note on a job. */
export interface IJobComment {
  /** Unique comment ID (e.g. `"jc-1234-abc"`). */
  id?: string;
  authorId: string;
  authorName: string;
  text: string;
  timestamp: number;
  /**
   * When `true`, this comment is visible only to staff.
   * Prefer `staffOnly` for new code; `published` (`!staffOnly`) is kept for
   * backwards compatibility with older records.
   */
  staffOnly?: boolean;
  /** @deprecated Use `staffOnly` instead (`published === !staffOnly`). */
  published?: boolean;
  /** Anomaly action code (ADD, APR, DNY, COM, …). */
  action?: string;
}

/** Anomaly-style progress / hold ladder. */
export type JobProgress =
  | "new"
  | "underway"
  | "hold"
  | "25"
  | "50"
  | "75"
  | "100";

/** Explicit escalation color (Anomaly green/yellow/red). */
export type JobEsc = "green" | "yellow" | "red";

/** A player request, bug report, or staff ticket. */
export interface IJob {
  /** Stable storage key, e.g. `"job-1"`. */
  id: string;
  /** Human-readable job number shown in-game (#1, #2, …). */
  number: number;
  title: string;
  /**
   * In-game job-queue bucket (e.g. `"BUG"`, `"CGEN"`). Optional for jobs
   * created via the REST API that use the freeform `category` field instead.
   */
  bucket?: JobBucket | string;
  /**
   * Job lifecycle status.
   * - `"new"` — just submitted, not yet triaged
   * - `"open"` — acknowledged and in progress
   * - `"closed"` — resolved and closed by staff
   * - `"cancelled"` — cancelled by submitter or staff
   * - `"resolved"` — marked resolved (terminal, distinct from closed)
   */
  status: "new" | "open" | "closed" | "cancelled" | "resolved";
  /** Anomaly-style progress ladder (optional). */
  progress?: JobProgress;
  /**
   * REST API category label (e.g. `"request"`, `"bug"`). Optional — the
   * in-game `bucket` field is the canonical grouping; `category` is used by
   * external API consumers that prefer a freeform string.
   */
  category?: string;
  /** Priority level, used for escalation colouring in the +jobs list. */
  priority?: "low" | "normal" | "high" | "critical";
  /** Explicit esc color; overrides time-based getEscalation when set. */
  esc?: JobEsc;
  /** Due date (unix ms). Overdue when now > dueAt and still open. */
  dueAt?: number;
  /** Staff tags (names or ids) for +job/tag and +jobs/mine. */
  tags?: string[];
  /** Optional freeform summary line for select summary= and reports. */
  summary?: string;
  /** When `true`, this job is only visible to staff (not the submitter). */
  staffOnly?: boolean;
  /** Published for player myjobs visibility (default true). */
  published?: boolean;
  /** Dbref of the player who submitted the job. */
  submittedBy: string;
  submitterName: string;
  /** Dbref of the assigned staff member, if any. */
  assignedTo?: string;
  assigneeName?: string;
  closedByName?: string;
  description: string;
  comments: IJobComment[];
  /** Player dbrefs who can view this job in addition to the submitter. */
  additionalPlayers?: string[];
  /** Unix timestamp (ms) when the job was created. */
  createdAt: number;
  /** Unix timestamp (ms) of the last update. */
  updatedAt: number;
}

/** Per-bucket staff access control. */
export interface IJobAccess {
  /** Bucket name (e.g. "BUG", "CGEN"). */
  id: string;
  /** Player dbrefs with access to this bucket. Empty = all staff. */
  staffIds: string[];
}
