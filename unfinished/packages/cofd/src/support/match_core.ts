/**
 * Core partial-name matching against catalog keys.
 */

export type NameMatchResult =
  | { kind: "match"; value: string }
  | { kind: "ambiguous"; matches: string[] }
  | { kind: "none" };

/** Small words players often add/omit in multi-word names. */
const STOP = new Set([
  "a", "an", "the", "of", "as", "and", "for", "to", "in", "on",
]);

export function basicNorm(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

/** Content tokens only (stop words dropped). */
export function contentTokens(s: string): string[] {
  return basicNorm(s)
    .split(" ")
    .filter((t) => t.length > 0 && !STOP.has(t));
}

function contentKey(s: string): string {
  return contentTokens(s).join(" ");
}

export interface Cand {
  raw: string;
  low: string;
  content: string;
  tokens: string[];
}

export function toCands(candidates: readonly string[]): Cand[] {
  return candidates.map((raw) => {
    const low = basicNorm(raw);
    const tokens = contentTokens(raw);
    return {
      raw,
      low,
      content: tokens.join(" "),
      tokens,
    };
  });
}

function uniqRaw(hits: Cand[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of hits) {
    if (seen.has(h.raw)) continue;
    seen.add(h.raw);
    out.push(h.raw);
  }
  return out;
}

function oneOrMany(hits: Cand[]): NameMatchResult {
  if (hits.length === 1) {
    return { kind: "match", value: hits[0].raw };
  }
  if (hits.length > 1) {
    return { kind: "ambiguous", matches: uniqRaw(hits) };
  }
  return { kind: "none" };
}

/**
 * Match `query` against candidate names (case-insensitive).
 * Returns the original candidate string on a unique hit.
 */
export function matchName(
  query: string,
  candidates: readonly string[],
): NameMatchResult {
  const qLow = basicNorm(query);
  if (!qLow) return { kind: "none" };

  const items = toCands(candidates);
  const qContent = contentKey(query);
  const qTokens = contentTokens(query);

  const exact = items.find((c) => c.low === qLow);
  if (exact) return { kind: "match", value: exact.raw };

  if (qContent) {
    const r = oneOrMany(
      items.filter((c) => c.content === qContent),
    );
    if (r.kind !== "none") return r;
  }

  {
    const r = oneOrMany(
      items.filter((c) => c.low.startsWith(qLow)),
    );
    if (r.kind !== "none") return r;
  }
  {
    const r = oneOrMany(
      items.filter((c) => c.low.includes(qLow)),
    );
    if (r.kind !== "none") return r;
  }

  if (qContent.length >= 2) {
    let r = oneOrMany(
      items.filter((c) => c.content.startsWith(qContent)),
    );
    if (r.kind !== "none") return r;
    r = oneOrMany(
      items.filter((c) => c.content.includes(qContent)),
    );
    if (r.kind !== "none") return r;
  }

  if (qTokens.length >= 2) {
    const r = oneOrMany(
      items.filter((c) =>
        qTokens.every((t) => c.tokens.includes(t))
      ),
    );
    if (r.kind !== "none") return r;
  }

  return { kind: "none" };
}
