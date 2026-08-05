/** Shared idle / on-for formatters for globals-style lists. */

export function fmtIdle(lastCmd: unknown): string {
  if (typeof lastCmd !== "number") return "---";
  const s = Math.floor((Date.now() - lastCmd) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function fmtOnFor(lastLogin: unknown): string {
  if (typeof lastLogin !== "number") return "??:??";
  const s = Math.floor((Date.now() - lastLogin) / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const hm =
    `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return d > 0 ? `${d}d ${hm}` : hm;
}

export function fmtDurationMs(ms: number): string {
  const secs = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0 || d > 0) parts.push(`${h}h`);
  if (m > 0 || h > 0 || d > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

export function isStaffFlags(flags: Set<string>): boolean {
  return (
    flags.has("admin") ||
    flags.has("wizard") ||
    flags.has("superuser") ||
    flags.has("staff")
  );
}
