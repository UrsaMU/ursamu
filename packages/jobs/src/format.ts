// ─── Display / format helpers for jobs commands ───────────────────────────────

import type { IJob } from "./types.ts";

export const WIDTH = 77;

/** Returns true when the flag set contains at least one staff role (admin, wizard, or superuser). */
export function isStaffFlags(flags: Set<string>): boolean {
  return flags.has("admin") || flags.has("wizard") || flags.has("superuser");
}

/**
 * Produces a centered, `=`-bordered header line exactly WIDTH characters wide.
 * @example header("Archived Jobs") → "====== Archived Jobs ======"
 */
export function header(title: string): string {
  const t = ` ${title} `;
  const pad = Math.floor((WIDTH - t.length) / 2);
  return "=".repeat(pad) + t + "=".repeat(WIDTH - pad - t.length);
}

/**
 * Produces a colored `-=-` bordered header with a bold white title, used for
 * individual job view headers. MUSH-safe: all color codes are reset by `%cn`.
 */
export function jobHeader(title: string): string {
  const t = `%ch%cw< ${title} >%cn`;
  const tLen = `< ${title} >`.length;
  const pad = Math.floor((WIDTH - tLen) / 2);
  const rpad = WIDTH - pad - tLen;
  return "%cb" + "-=-".repeat(Math.floor(pad / 3)) + "=".repeat(pad % 3) + "%cn" + t +
    "%cb" + "-=-".repeat(Math.floor(rpad / 3)) + "=".repeat(rpad % 3) + "%cn";
}

/**
 * Produces the same decorated border as {@link jobHeader}, used at the bottom
 * of a job display block.
 */
export function jobFooter(title: string): string {
  return jobHeader(title);
}

/** Returns a plain 77-character dash separator line. */
export function divider(): string {
  return "-".repeat(WIDTH);
}

/** Returns a blue-colored 77-character dash separator line (MUSH color reset included). */
export function jobDivider(): string {
  return "%cb" + "-".repeat(WIDTH) + "%cn";
}

/** Returns a plain 77-character `=` footer line. */
export function footer(): string {
  return "=".repeat(WIDTH);
}

/**
 * Formats a Unix epoch timestamp as a full human-readable string.
 * @returns e.g. `"Mon Mar 22 14:30:00 2026"` or `"???"` on invalid input.
 */
export function formatTimeFull(epoch: number): string {
  try {
    if (!isFinite(epoch)) return "???";
    const d = new Date(epoch);
    const days   = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()} ${hh}:${mm}:${ss} ${d.getFullYear()}`;
  } catch { return "???"; }
}

/**
 * Formats a Unix epoch timestamp as a short date+time string.
 * @returns e.g. `"03/22/2026 2:30pm"` or `"???"` on invalid input.
 */
export function formatTimeShort(epoch: number): string {
  try {
    if (!isFinite(epoch)) return "???";
    const d = new Date(epoch);
    const mm   = String(d.getMonth() + 1).padStart(2, "0");
    const dd   = String(d.getDate()).padStart(2, "0");
    const yyyy = d.getFullYear();
    const h    = d.getHours();
    const ampm = h >= 12 ? "pm" : "am";
    const h12  = h % 12 || 12;
    const min  = String(d.getMinutes()).padStart(2, "0");
    return `${mm}/${dd}/${yyyy} ${h12}:${min}${ampm}`;
  } catch { return "???"; }
}

/**
 * Formats a Unix epoch timestamp as a compact date string.
 * @returns e.g. `"03-22-26"` or `"???"` on invalid input.
 */
export function formatDate(epoch: number): string {
  try {
    if (!isFinite(epoch)) return "???";
    const d  = new Date(epoch);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(-2);
    return `${mm}-${dd}-${yy}`;
  } catch { return "???"; }
}

/**
 * Returns the escalation color and label for a job based on time since the
 * last staff comment (or job creation if no staff comments exist yet).
 *
 * - `%cg NEW` — no staff comments yet and < 48 hours old
 * - `` (no label) — has staff activity and < 48 hours since last comment
 * - `%ch%cy DUE` — 48–95 hours without staff activity (yellow)
 * - `%ch%cr DUE` — 96+ hours without staff activity (red)
 */
export function getEscalation(job: IJob): { color: string; label: string } {
  // Escalation is based on time since last staff comment
  const staffComments = job.comments.filter((c) => c.authorId !== job.submittedBy && c.published);
  const lastActivity  = staffComments.length > 0
    ? staffComments[staffComments.length - 1].timestamp
    : job.createdAt;
  const hoursSince = (Date.now() - lastActivity) / 3600000;

  if (staffComments.length === 0 && hoursSince < 48) return { color: "%cg", label: "NEW" };
  if (hoursSince < 48) return { color: "%cg", label: "" };
  if (hoursSince < 96) return { color: "%ch%cy", label: "DUE" };
  return { color: "%ch%cr", label: "DUE" };
}

/**
 * Returns true when no staff member has commented on the job yet (i.e. all
 * existing comments were written by the submitter).
 */
export function isNew(job: IJob): boolean {
  return !job.comments.some((c) => c.authorId !== job.submittedBy);
}

/** Fixed column positions for the jobs list table. */
const P = [0, 5, 15, 47, 60, 71];

/**
 * Renders a multi-column jobs list table as an array of MUSH-formatted strings
 * ready to be joined with `\n` and sent via `u.send()`.
 *
 * Columns: `#` | `Category` | `Title` | `Started` | `Handler` | `Status`
 *
 * @param jobList Jobs to display (pre-filtered and sorted by the caller).
 * @param title   Header title shown in the top border (e.g. `"POP Jobs"`).
 */
export function formatJobList(jobList: IJob[], title: string): string[] {
  const lines: string[] = [];
  lines.push(jobHeader(title));

  const placeLine = (cols: string[]): string => {
    const row = " ".repeat(WIDTH).split("");
    for (let i = 0; i < cols.length && i < P.length; i++) {
      const maxW = (i + 1 < P.length ? P[i + 1] - P[i] - 1 : WIDTH - P[i]);
      const text = cols[i].slice(0, maxW);
      for (let c = 0; c < text.length; c++) {
        if (P[i] + c < WIDTH) row[P[i] + c] = text[c];
      }
    }
    return row.join("");
  };

  const hdrRow = placeLine(["#", "Category", "Title", "Started", "Handler", ""]);
  lines.push(`%cc${hdrRow.slice(0, P[5])}${"Status".padStart(WIDTH - P[5])}%cn`);
  lines.push(jobDivider());

  for (const j of jobList) {
    const esc      = getEscalation(j);
    const rawBucket  = j.bucket || j.category || "???";
    const bPad     = Math.max(0, Math.floor((8 - rawBucket.length) / 2));
    const bucket   = " ".repeat(bPad) + rawBucket;
    const rawHandler = j.assigneeName || "-----";
    const hPad     = Math.max(0, Math.floor((7 - rawHandler.length) / 2));
    const handler  = " ".repeat(hPad) + rawHandler;
    const rawStatus  = esc.label || "";
    const statusColored = rawStatus ? `${esc.color}${rawStatus}%cn` : "";

    const plainRow = placeLine([String(j.number), bucket, j.title, formatDate(j.createdAt), handler, ""]);
    const statusPad = WIDTH - P[5] - rawStatus.length;
    lines.push(`${plainRow.slice(0, P[5])}${" ".repeat(Math.max(0, statusPad))}${statusColored}`);
  }

  lines.push(jobFooter("End Jobs"));
  return lines;
}
