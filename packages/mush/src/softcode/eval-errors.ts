/**
 * Format softcode / eval failures for player-visible output.
 * TinyMUX-style #-1 prefix; never echo the raw input as "success".
 */
export function formatEvalError(err: unknown): string {
  let detail = "EVAL ERROR";
  if (err instanceof Error && err.message) {
    detail = err.message.replace(/\s+/g, " ").trim().slice(0, 120);
  } else if (typeof err === "string" && err.trim()) {
    detail = err.replace(/\s+/g, " ").trim().slice(0, 120);
  } else if (err != null) {
    detail = String(err).replace(/\s+/g, " ").trim().slice(0, 120);
  }
  if (!detail) detail = "EVAL ERROR";
  if (detail.toUpperCase().startsWith("#-1")) return detail;
  return `#-1 ${detail}`;
}
