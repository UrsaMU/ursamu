import type { Job, JobPriority, JobStatus } from "@/api/types";

export const JOB_STATUSES: JobStatus[] = [
  "new",
  "open",
  "resolved",
  "closed",
  "cancelled",
];

export const JOB_PRIORITIES: JobPriority[] = [
  "low",
  "normal",
  "high",
  "critical",
];

export function isOpenJob(status: string): boolean {
  return status !== "closed" &&
    status !== "resolved" &&
    status !== "cancelled";
}

export function formatJobWhen(ts?: number): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function jobBucket(j: Job): string {
  return String(j.bucket || j.category || "—").toUpperCase();
}

export function priorityClass(p?: string): string {
  const v = (p || "normal").toLowerCase();
  if (v === "critical" || v === "high") return "badge-draft";
  if (v === "low") return "badge";
  return "badge-live";
}

export function statusClass(s?: string): string {
  const v = (s || "").toLowerCase();
  if (v === "new") return "badge-draft";
  if (v === "open") return "badge-live";
  return "badge";
}
