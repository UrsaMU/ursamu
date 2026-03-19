export const VALID_BUCKETS = [
  "BUG", "BUILD", "CGEN", "SUGGESTION", "TYPO",
  "LOGS", "PLOT", "PRP", "PVP", "ROSTER", "XP",
  "WIKI", "SPHERE", "INFLUENCE",
] as const;

export type JobBucket = typeof VALID_BUCKETS[number];

export interface IJobComment {
  authorId: string;
  authorName: string;
  text: string;
  timestamp: number;
  published: boolean;       // visible to players? (default true)
}

export interface IJob {
  id: string;               // "job-1", "job-2", ...
  number: number;           // human-readable (#1, #2)
  title: string;
  bucket: JobBucket;
  status: "open" | "closed" | "cancelled";
  submittedBy: string;      // dbref
  submitterName: string;
  assignedTo?: string;      // dbref
  assigneeName?: string;
  closedByName?: string;
  description: string;
  comments: IJobComment[];
  additionalPlayers: string[];  // player dbrefs who can view
  createdAt: number;        // timestamp
  updatedAt: number;
}

export interface IJobAccess {
  id: string;               // bucket name
  staffIds: string[];       // player dbrefs with access
}
