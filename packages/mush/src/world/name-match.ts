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
 * (exact), or the primary name as a case-insensitive prefix.
 */
export function nameMatches(obj: Nameish, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;

  if (obj.id) {
    if (obj.id === q) return true;
    if (q.startsWith("#") && obj.id === q.slice(1)) return true;
  }

  const alias = rawAlias(obj).toLowerCase();
  if (alias && alias === q) return true;

  const moniker = rawMoniker(obj).toLowerCase();
  if (moniker && (moniker === q || moniker.startsWith(q))) {
    return true;
  }

  const parts = nameParts(obj).map((p) => p.toLowerCase());
  if (parts.some((p) => p === q)) return true;

  const primary = parts[0] ?? "";
  return primary.startsWith(q);
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

/** Prefer exact alias/; -part hits over primary-name prefix. */
export function pickNameMatch<T extends Nameish>(
  candidates: T[],
  query: string,
): T | undefined {
  const hits = candidates.filter((o) => nameMatches(o, query));
  if (!hits.length) return undefined;
  const exact = hits.find((o) => nameMatchesExact(o, query));
  return exact ?? hits[0];
}
