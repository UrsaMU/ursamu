export interface IJobComment {
  id: string;
  authorId: string;        // player dbref
  authorName: string;
  text: string;
  timestamp: number;
  staffOnly: boolean;      // hidden from submitter if true
}

export interface IJob {
  id: string;              // "job-1", "job-2", ...
  number: number;          // human-readable (#1, #2)
  title: string;
  category: string;        // "request" | "bug" | "app" | "complaint" | "idea" | "staff"
  priority: "low" | "normal" | "high" | "critical";
  status: "new" | "open" | "pending" | "in-progress" | "resolved" | "closed";
  submittedBy: string;     // dbref
  submitterName: string;
  assignedTo?: string;     // dbref
  assigneeName?: string;
  description: string;
  comments: IJobComment[];
  createdAt: number;       // timestamp
  updatedAt: number;
  closedAt?: number;
  staffOnly: boolean;      // internal staff jobs not visible to players
}
