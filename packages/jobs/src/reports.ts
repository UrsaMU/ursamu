/**
 * +jobs/reports MVP — open/overdue/assignees/aging/actby.
 */
import type { IJob } from "./types.ts";
import { isOpenJob, isOverdue } from "./filter.ts";
import { header, divider, footer } from "./format.ts";

export const REPORT_NAMES = [
  "open",
  "overdue",
  "assignees",
  "aging",
  "actby",
] as const;

export function listReports(): string {
  return [
    header("Job Reports"),
    ...REPORT_NAMES.map((n) => `  ${n}`),
    divider(),
    "  +jobs/reports <name>[=arg]",
    footer(),
  ].join("\n");
}

export function runReport(
  all: IJob[],
  name: string,
  arg: string,
): string {
  const n = name.toLowerCase();
  if (n === "open") return reportOpen(all);
  if (n === "overdue") return reportOverdue(all);
  if (n === "assignees") return reportAssignees(all);
  if (n === "aging") return reportAging(all);
  if (n === "actby") return reportActby(all, arg);
  return `>JOBS: Unknown report '${name}'. Try +jobs/reports.`;
}

function reportOpen(all: IJob[]): string {
  const open = all.filter(isOpenJob);
  const by = new Map<string, number>();
  for (const j of open) {
    const b = (j.bucket || j.category || "?").toUpperCase();
    by.set(b, (by.get(b) ?? 0) + 1);
  }
  const lines = [header("Open by Bucket"), divider()];
  for (const [b, c] of [...by.entries()].sort()) {
    lines.push(`  ${b.padEnd(16)} ${String(c).padStart(4)}`);
  }
  lines.push(divider(), `  Total: ${open.length}`, footer());
  return lines.join("\n");
}

function reportOverdue(all: IJob[]): string {
  const od = all.filter((j) => isOverdue(j));
  const lines = [
    header("Overdue"),
    divider(),
    ...od.map((j) =>
      `  #${j.number} ${(j.bucket || "?").padEnd(10)} ` +
        j.title.slice(0, 40)
    ),
    divider(),
    `  Count: ${od.length}`,
    footer(),
  ];
  return lines.join("\n");
}

function reportAssignees(all: IJob[]): string {
  const open = all.filter(isOpenJob);
  const by = new Map<string, number>();
  for (const j of open) {
    const a = j.assigneeName || "(unassigned)";
    by.set(a, (by.get(a) ?? 0) + 1);
  }
  const lines = [header("By Assignee"), divider()];
  for (const [a, c] of [...by.entries()].sort()) {
    lines.push(`  ${a.padEnd(20)} ${String(c).padStart(4)}`);
  }
  lines.push(footer());
  return lines.join("\n");
}

function reportAging(all: IJob[]): string {
  const now = Date.now();
  const open = all.filter(isOpenJob);
  let a = 0, b = 0, c = 0;
  for (const j of open) {
    const d = (now - j.createdAt) / 86400000;
    if (d < 2) a++;
    else if (d <= 7) b++;
    else c++;
  }
  return [
    header("Aging"),
    `  < 2 days:   ${a}`,
    `  2–7 days:   ${b}`,
    `  > 7 days:   ${c}`,
    footer(),
  ].join("\n");
}

function reportActby(all: IJob[], _arg: string): string {
  const by = new Map<string, number>();
  for (const j of all) {
    for (const c of j.comments) {
      const n = c.authorName || c.authorId;
      by.set(n, (by.get(n) ?? 0) + 1);
    }
  }
  const lines = [header("Actions by Author"), divider()];
  for (const [n, c] of [...by.entries()].sort((x, y) =>
    y[1] - x[1]
  )) {
    lines.push(`  ${n.padEnd(20)} ${String(c).padStart(4)}`);
  }
  lines.push(footer());
  return lines.join("\n");
}
