/**
 * Object name / alias matching for target resolution.
 *
 * Exit names are TinyMUX-style: `Primary;alias1;alias2`.
 * Objects may also carry a separate `data.alias` from @alias.
 */

type Nameish = {
  id?: string;
  name?: string;
  state?: Record<string, unknown>;
  data?: Record<string, unknown>;
};

function rawName(obj: Nameish): string {
  return String(
    obj.state?.name ?? obj.data?.name ?? obj.name ?? "",
  );
}

function rawAlias(obj: Nameish): string {
  return String(obj.state?.alias ?? obj.data?.alias ?? "");
}

/** Name parts: primary + semicolon exit aliases. */
export function nameParts(obj: Nameish): string[] {
  return rawName(obj)
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);
}

function rawMoniker(obj: Nameish): string {
  return String(obj.state?.moniker ?? obj.data?.moniker ?? "");
}

/**
 * True when query matches id, data.alias, moniker, any ;-name part
 * (exact), primary prefix, or any name-part substring (partial).
 */
export function nameMatches(obj: Nameish, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;

  if (obj.id) {
    if (obj.id === q) return true;
    if (q.startsWith("#") && obj.id === q.slice(1)) return true;
  }

  const alias = rawAlias(obj).toLowerCase();
  if (alias && (alias === q || alias.startsWith(q))) {
    return true;
  }

  const moniker = rawMoniker(obj).toLowerCase();
  if (moniker && (moniker === q || moniker.startsWith(q))) {
    return true;
  }

  const parts = nameParts(obj).map((p) => p.toLowerCase());
  if (parts.some((p) => p === q)) return true;

  // Prefix on any ;-part (e.g. "gob" → "Goblin Sneak")
  if (parts.some((p) => p.startsWith(q))) return true;

  // Substring on any part (e.g. "sneak" → "Goblin Sneak")
  if (q.length >= 2 && parts.some((p) => p.includes(q))) {
    return true;
  }

  return false;
}

/** Exact id / alias / moniker / ;-part match (no prefix). */
export function nameMatchesExact(obj: Nameish, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;

  if (obj.id) {
    if (obj.id === q) return true;
    if (q.startsWith("#") && obj.id === q.slice(1)) return true;
  }

  const alias = rawAlias(obj).toLowerCase();
  if (alias && alias === q) return true;

  const moniker = rawMoniker(obj).toLowerCase();
  if (moniker && moniker === q) return true;

  return nameParts(obj).some((p) => p.toLowerCase() === q);
}

/**
 * Parse TinyMUX-style ordinals:
 *   2.goblin  |  goblin.2  |  2 goblin
 * Returns { ordinal: 1-based index or 0, name }.
 */
export function parseNameOrdinal(
  query: string,
): { ordinal: number; name: string } {
  const q = query.trim();
  let m = q.match(/^(\d+)\.(.+)$/);
  if (m) {
    return {
      ordinal: Math.max(1, parseInt(m[1], 10) || 1),
      name: m[2].trim(),
    };
  }
  m = q.match(/^(.+)\.(\d+)$/);
  if (m) {
    return {
      ordinal: Math.max(1, parseInt(m[2], 10) || 1),
      name: m[1].trim(),
    };
  }
  m = q.match(/^(\d+)\s+(.+)$/);
  if (m) {
    return {
      ordinal: Math.max(1, parseInt(m[1], 10) || 1),
      name: m[2].trim(),
    };
  }
  return { ordinal: 0, name: q };
}

/** All matches, exact first then others (stable order). */
export function listNameMatches<T extends Nameish>(
  candidates: T[],
  query: string,
): T[] {
  const hits = candidates.filter((o) => nameMatches(o, query));
  if (!hits.length) return [];
  const exact = hits.filter((o) => nameMatchesExact(o, query));
  const rest = hits.filter((o) => !nameMatchesExact(o, query));
  return [...exact, ...rest];
}

/**
 * Prefer exact alias/; -part hits over prefix/substring.
 * With ordinal (2.goblin), pick that Nth match (1-based).
 */
export function pickNameMatch<T extends Nameish>(
  candidates: T[],
  query: string,
): T | undefined {
  const { ordinal, name } = parseNameOrdinal(query);
  const hits = listNameMatches(candidates, name || query);
  if (!hits.length) return undefined;
  if (ordinal > 0) {
    return hits[ordinal - 1];
  }
  const exact = hits.find((o) => nameMatchesExact(o, name || query));
  return exact ?? hits[0];
}
