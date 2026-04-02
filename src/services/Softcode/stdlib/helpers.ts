import type { EvalContext } from "../context.ts";

/** Parse a string as an integer (base 10). Returns 0 on failure. */
export function int(s: string): number { return parseInt(s, 10) || 0; }

/** Parse a string as a float. Returns 0 on failure. */
export function num(s: string): number { return parseFloat(s) || 0; }

/**
 * Format a number for MUX output — strips trailing zeros, handles Inf/NaN.
 * Matches TinyMUX output style.
 */
export function fmt(n: number): string {
  if (!isFinite(n)) return isNaN(n) ? "NaN" : (n > 0 ? "Inf" : "-Inf");
  return Number.isInteger(n) ? String(n) : String(parseFloat(n.toPrecision(15)));
}

/** Placeholder for unimplemented softcode functions. */
export function stub(_a: string[], _ctx: EvalContext): Promise<string> {
  return Promise.resolve("#-1 NOT IMPLEMENTED");
}

/** Split a space- or delimiter-separated MUX list. */
export function splitList(s: string, delim?: string): string[] {
  if (delim === undefined || delim === " ") return s.trim().split(/\s+/).filter(Boolean);
  if (delim === "@@") return s.split(""); // null delim = char-by-char
  return s.split(delim);
}

/** Join a MUX list with the given delimiter. */
export function joinList(arr: string[], delim?: string): string {
  if (delim === undefined || delim === " ") return arr.join(" ");
  if (delim === "@@") return arr.join("");
  return arr.join(delim);
}

/** Strip MUSH color codes and ANSI escapes from a string. */
export function stripAnsi(s: string): string {
  return s
    .replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/%c[a-z]/gi, "")
    .replace(/%[rntbRNTB]/g, "");
}
