/** A single comment or staff note on a job. */
export interface IJobComment {
  id: string;
  /** Player dbref of the comment author. */
  authorId: string;
  authorName: string;
  text: string;
  timestamp: number;
  /** When `true` the comment is hidden from the original submitter. */
  staffOnly: boolean;
}

/** A player request, bug report, or staff ticket. */
export interface IJob {
  /** Stable storage key, e.g. `"job-1"`. */
  id: string;
  /** Human-readable job number shown in-game (#1, #2, …). */
  number: number;
  title: string;
  /** Category tag: `"request"`, `"bug"`, `"app"`, `"complaint"`, `"idea"`, or `"staff"`. */
  category: string;
  priority: "low" | "normal" | "high" | "critical";
  status: "new" | "open" | "pending" | "in-progress" | "resolved" | "closed";
  /** Dbref of the player who submitted the job. */
  submittedBy: string;
  submitterName: string;
  /** Dbref of the assigned staff member, if any. */
  assignedTo?: string;
  assigneeName?: string;
  description: string;
  comments: IJobComment[];
  /** Unix timestamp (ms) when the job was created. */
  createdAt: number;
  /** Unix timestamp (ms) of the last update. */
  updatedAt: number;
  closedAt?: number;
  /** When `true` this is an internal staff job not visible to regular players. */
  staffOnly: boolean;
}
