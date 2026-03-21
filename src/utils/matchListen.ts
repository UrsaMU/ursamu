/**
 * matchListen — test whether a spoken text matches a LISTEN attribute pattern.
 *
 * Supports simple glob syntax:
 *   *        → matches any text (always true)
 *   foo*     → text starts with "foo"
 *   *foo     → text ends with "foo"
 *   *foo*    → text contains "foo"
 *   foo      → text contains "foo" (plain substring match)
 *
 * All comparisons are case-insensitive.
 */
export function matchListen(pattern: string, text: string): boolean {
  const p = pattern.trim().toLowerCase();
  const t = text.toLowerCase();

  if (p === "*") return true;

  const hasLeading = p.startsWith("*");
  const hasTrailing = p.endsWith("*");

  if (hasLeading && hasTrailing) {
    // *foo* — contains
    const inner = p.slice(1, -1);
    return inner === "" ? true : t.includes(inner);
  }

  if (hasLeading) {
    // *foo — ends with
    return t.endsWith(p.slice(1));
  }

  if (hasTrailing) {
    // foo* — starts with
    return t.startsWith(p.slice(0, -1));
  }

  // Plain string — substring match (classic MUSH @listen behaviour)
  return t.includes(p);
}
