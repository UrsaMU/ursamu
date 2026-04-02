/**
 * Shared utilities for softcode action commands.
 */

/**
 * Split a MUX softcode argument list by a delimiter, respecting
 * bracket/brace nesting so commas inside [func()] or {braced} are not splits.
 */
export function splitSoftcodeList(s: string, delim = ","): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "[" || ch === "{") { depth++; cur += ch; }
    else if (ch === "]" || ch === "}") { depth--; cur += ch; }
    else if (ch === delim && depth === 0) { parts.push(cur); cur = ""; }
    else { cur += ch; }
  }
  parts.push(cur);
  return parts;
}

/**
 * Sentinel thrown by `@break` to exit the enclosing @while or @dolist loop.
 * Caught by the loop command; propagates naturally through await chains.
 */
export class BreakSignal extends Error {
  constructor() { super("@break"); this.name = "BreakSignal"; }
}
