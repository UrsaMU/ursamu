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
 * Split an evaluated action string on semicolons, respecting bracket/brace
 * nesting, and trim each segment. Used to support multi-command action blocks
 * like `{say hi;@tel me=here}` in @switch and @dolist.
 */
export function splitActionCommands(s: string): string[] {
  return splitSoftcodeList(s.trim(), ";").map(c => c.trim()).filter(Boolean);
}

/**
 * Classic MUSH glob pattern match used by @switch case comparison.
 *   * → any sequence,  ? → single char,  < → less-than,  > → greater-than
 */
export function switchWildcard(str: string, pattern: string): boolean {
  if (pattern.startsWith("<")) return parseFloat(str) < parseFloat(pattern.slice(1));
  if (pattern.startsWith(">")) return parseFloat(str) > parseFloat(pattern.slice(1));
  const re = "^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$";
  return new RegExp(re, "i").test(str);
}

/**
 * Sentinel thrown by `@break` to exit the enclosing @while or @dolist loop.
 * Caught by the loop command; propagates naturally through await chains.
 */
export class BreakSignal extends Error {
  constructor() { super("@break"); this.name = "BreakSignal"; }
}
