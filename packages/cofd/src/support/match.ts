/**
 * Partial name matching for catalog keys (attributes, skills, merits).
 *
 * On a miss, errors suggest near matches — never dump the full catalog.
 */

import {
  matchName,
  contentTokens,
  basicNorm,
  toCands,
  type NameMatchResult,
} from "./match_core.ts";

export type { NameMatchResult };
export { matchName, contentTokens };

const MAX_SUGGEST = 5;
const MAX_AMBIGUOUS = 8;

/**
 * Near-miss suggestions when nothing matched. Caps at `limit`.
 */
export function suggestNames(
  query: string,
  candidates: readonly string[],
  limit = MAX_SUGGEST,
): string[] {
  const qTokens = contentTokens(query);
  const qLow = basicNorm(query);
  if (!qLow) return [];

  const scored: { raw: string; score: number }[] = [];
  for (const c of toCands(candidates)) {
    let score = 0;
    if (qTokens.length > 0) {
      const shared = qTokens.filter((t) =>
        c.tokens.includes(t)
      ).length;
      if (shared === 0) {
        if (
          qLow.length >= 3 &&
          (c.low.includes(qLow) || c.content.includes(qLow))
        ) {
          score = 1;
        } else {
          continue;
        }
      } else {
        score = shared * 10 + Math.max(0, 5 - c.tokens.length);
        if (c.content.startsWith(qTokens[0])) score += 3;
      }
    } else if (c.low.includes(qLow)) {
      score = 1;
    } else {
      continue;
    }
    scored.push({ raw: c.raw, score });
  }

  scored.sort((a, b) =>
    b.score - a.score || a.raw.localeCompare(b.raw)
  );
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of scored) {
    if (seen.has(s.raw)) continue;
    seen.add(s.raw);
    out.push(s.raw);
    if (out.length >= limit) break;
  }
  return out;
}

function formatList(names: string[], cap: number): string {
  if (names.length <= cap) return names.join(", ");
  return (
    names.slice(0, cap).join(", ") +
    `, … (+${names.length - cap} more)`
  );
}

/**
 * Resolve a query or throw a short player-facing error.
 * Optional `hint` is a browse command (e.g. "+cg/list merits").
 */
export function matchNameOrThrow(
  query: string,
  candidates: readonly string[],
  label: string,
  hint?: string,
): string {
  const r = matchName(query, candidates);
  if (r.kind === "match") return r.value;
  if (r.kind === "ambiguous") {
    throw new Error(
      `Ambiguous ${label} '${query}'. ` +
        `Did you mean: ` +
        `${formatList(r.matches, MAX_AMBIGUOUS)}?`,
    );
  }

  const suggestions = suggestNames(query, candidates);
  if (suggestions.length > 0) {
    const browse = hint ? ` Browse with ${hint}.` : "";
    throw new Error(
      `Unknown ${label} '${query}'. ` +
        `Did you mean: ${suggestions.join(", ")}?` +
        browse,
    );
  }

  const browse = hint
    ? ` Try ${hint}.`
    : candidates.length > 0
    ? ` No close matches.`
    : "";
  throw new Error(`Unknown ${label} '${query}'.` + browse);
}
