/** Pure format helpers for the jobs → BBS bridge. */

export interface IBridgeJob {
  number: number;
  title: string;
  description: string;
  status: string;
  bucket?: string;
  category?: string;
  priority?: string;
  submitterName: string;
  assigneeName?: string;
  closedByName?: string;
}

export interface IBridgeComment {
  authorName: string;
  text: string;
  staffOnly?: boolean;
}

export function jobTag(num: number): string {
  return `job:${num}`;
}

export function bucketLabel(job: IBridgeJob): string {
  return job.bucket ?? job.category ?? "General";
}

export function formatCreatedSubject(job: IBridgeJob): string {
  return `#${job.number} — ${job.title}`.slice(0, 120);
}

export function formatCreatedBody(job: IBridgeJob): string {
  return [
    `Submitted by: ${job.submitterName}`,
    `Bucket: ${bucketLabel(job)}`,
    `Priority: ${job.priority ?? "normal"}`,
    `Status: ${job.status}`,
    "",
    job.description.slice(0, 4000),
  ].join("\n");
}
