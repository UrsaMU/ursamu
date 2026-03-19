export const VALID_BUCKETS = [
  "BUG", "BUILD", "CGEN", "SUGGESTION", "TYPO",
  "LOGS", "PLOT", "PRP", "PVP", "ROSTER", "XP",
  "WIKI", "SPHERE", "INFLUENCE",
] as const;

export type JobBucket = typeof VALID_BUCKETS[number];

/** A single comment or staff note on a job. */
export interface IJobComment {
  authorId: string;
  authorName: string;
  text: string;
  timestamp: number;
  /** When `true`, visible to players. When `false`, staff-only. */
  published: boolean;
}

/** A player request, bug report, or staff ticket. */
export interface IJob {
  /** Stable storage key, e.g. `"job-1"`. */
  id: string;
  /** Human-readable job number shown in-game (#1, #2, …). */
  number: number;
  title: string;
  bucket: JobBucket;
  status: "open" | "closed" | "cancelled";
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
  additionalPlayers: string[];
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
