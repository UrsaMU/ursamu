/** Mail display helpers. */

export function formatMailWhen(ts: number): string {
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

export function bareDbref(raw: string): string {
  return String(raw ?? "").replace(/^#/, "").trim();
}

export function asDbref(raw: string): string {
  const id = bareDbref(raw);
  return id ? `#${id}` : "";
}
