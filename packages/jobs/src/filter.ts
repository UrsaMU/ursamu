/**
 * Job list filters (Anomaly +jobs/* and simplified select).
 */
import type { IJob } from "./types.ts";
import { getEscalation, isNew } from "./format.ts";

export function isOpenJob(j: IJob): boolean {
  return j.status === "open" || j.status === "new";
}

export function isOverdue(j: IJob, now = Date.now()): boolean {
  if (!isOpenJob(j)) return false;
  if (j.dueAt != null) return now > j.dueAt;
  // Fall back to time-based red escalation
  const esc = getEscalation(j);
  return esc.label === "DUE" && esc.color.includes("%cr");
}

export function matchesMine(j: IJob, playerId: string): boolean {
  if (j.assignedTo === playerId) return true;
  const tags = j.tags ?? [];
  return tags.includes(playerId);
}

export function filterJobs(
  all: IJob[],
  kind: string,
  arg: string,
  meId: string,
): IJob[] {
  const open = all.filter(isOpenJob);
  const k = kind.toLowerCase();
  const a = arg.trim();

  if (k === "" || k === "all") return open;
  if (k === "mine") {
    return open.filter((j) => matchesMine(j, meId));
  }
  if (k === "new") return open.filter((j) => isNew(j));
  if (k === "overdue") return open.filter((j) => isOverdue(j));
  if (k === "list" || k === "bucket") {
    const b = a.toUpperCase();
    return open.filter(
      (j) => (j.bucket || j.category || "").toUpperCase() === b,
    );
  }
  if (k === "from" || k === "source") {
    const q = a.toLowerCase();
    return open.filter((j) =>
      j.submitterName.toLowerCase().includes(q) ||
      j.submittedBy === a
    );
  }
  if (k === "who") {
    if (!a || a.toLowerCase() === "none") {
      return open.filter((j) => !j.assignedTo);
    }
    const q = a.toLowerCase();
    return open.filter((j) =>
      (j.assigneeName || "").toLowerCase().includes(q) ||
      j.assignedTo === a
    );
  }
  if (k === "search") {
    const q = a.toLowerCase();
    if (!q) return [];
    return open.filter((j) => {
      const blob = [
        j.title,
        j.description,
        ...j.comments.map((c) => c.text),
      ].join("\n").toLowerCase();
      return blob.includes(q);
    });
  }
  if (k === "pri" || k === "esc") {
    return sortByPri(open);
  }
  if (k === "due") {
    return [...open].sort((a, b) =>
      (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity)
    );
  }
  if (k === "date") {
    return [...open].sort((a, b) => b.updatedAt - a.updatedAt);
  }
  if (k === "sort") {
    return [...open].sort((a, b) =>
      (a.bucket || "").localeCompare(b.bucket || "") ||
      a.number - b.number
    );
  }
  return open;
}

function sortByPri(jobs: IJob[]): IJob[] {
  const rank = (j: IJob): number => {
    if (j.esc === "red") return 0;
    if (j.esc === "yellow") return 1;
    if (j.esc === "green") return 2;
    const e = getEscalation(j);
    if (e.color.includes("%cr")) return 0;
    if (e.color.includes("%cy")) return 1;
    return 2;
  };
  return [...jobs].sort((a, b) =>
    rank(a) - rank(b) || a.number - b.number
  );
}

/** Parse due specs: 12/25/09, 1d 12h, epoch ms, or hours number. */
export function parseDue(spec: string, now = Date.now()): number | null {
  const s = spec.trim();
  if (!s) return null;
  if (/^\d{10,13}$/.test(s)) {
    const n = parseInt(s, 10);
    return n < 1e12 ? n * 1000 : n;
  }
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdy) {
    let y = parseInt(mdy[3], 10);
    if (y < 100) y += 2000;
    const d = new Date(y, parseInt(mdy[1], 10) - 1, parseInt(mdy[2], 10));
    return d.getTime();
  }
  // relative: 1d 12h 30m
  let ms = 0;
  const re = /(\d+)\s*([dhms])/gi;
  let m: RegExpExecArray | null;
  let any = false;
  while ((m = re.exec(s)) !== null) {
    any = true;
    const n = parseInt(m[1], 10);
    const u = m[2].toLowerCase();
    if (u === "d") ms += n * 86400000;
    else if (u === "h") ms += n * 3600000;
    else if (u === "m") ms += n * 60000;
    else if (u === "s") ms += n * 1000;
  }
  if (any) return now + ms;
  const hours = parseFloat(s);
  if (!isNaN(hours)) return now + hours * 3600000;
  return null;
}
