/**
 * Pure helpers for jsr:@ursamu/* import pins in deno.json.
 */

const JSR_PKG =
  /^jsr:(@ursamu\/[a-z0-9][a-z0-9._-]*)(?:@([^/\s]+))?(\/.*)?$/i;

/** Parse jsr:@ursamu/foo@^1.2.3[/sub] → parts. */
export function parseJsrSpec(spec: string): {
  pkg: string;
  range: string;
  suffix: string;
} | null {
  const m = spec.trim().match(JSR_PKG);
  if (!m) return null;
  return {
    pkg: m[1],
    range: m[2] ?? "",
    suffix: m[3] ?? "",
  };
}

/** Keep ^/~ prefix from the old pin when writing the new version. */
export function formatJsrPin(
  pkg: string,
  version: string,
  oldRange: string,
  suffix = "",
): string {
  const prefix = oldRange.startsWith("~")
    ? "~"
    : oldRange.startsWith("^") || oldRange === ""
    ? "^"
    : oldRange.startsWith(">=")
    ? ">="
    : "^";
  return `jsr:${pkg}@${prefix}${version}${suffix}`;
}

export async function fetchLatestJsrVersion(
  pkg: string,
): Promise<string | null> {
  try {
    const res = await fetch(`https://jsr.io/${pkg}/meta.json`);
    if (!res.ok) return null;
    const meta = await res.json() as { latest?: string };
    return typeof meta.latest === "string" ? meta.latest : null;
  } catch {
    return null;
  }
}

/**
 * Bump every jsr:@ursamu/* import in a deno.json imports map to latest.
 * Returns the new imports object and list of "pkg old→new" strings.
 */
export async function bumpUrsamuImports(
  imports: Record<string, string>,
  fetchMeta: (pkg: string) => Promise<string | null> =
    fetchLatestJsrVersion,
): Promise<{ imports: Record<string, string>; bumped: string[] }> {
  const next = { ...imports };
  const bumped: string[] = [];
  const latestCache = new Map<string, string | null>();

  const pkgs = new Set<string>();
  for (const val of Object.values(imports)) {
    const p = parseJsrSpec(val);
    if (p) pkgs.add(p.pkg);
  }

  for (const pkg of pkgs) {
    latestCache.set(pkg, await fetchMeta(pkg));
  }

  for (const [key, val] of Object.entries(imports)) {
    const p = parseJsrSpec(val);
    if (!p) continue;
    const latest = latestCache.get(p.pkg);
    if (!latest) continue;
    const pin = formatJsrPin(p.pkg, latest, p.range, p.suffix);
    if (pin === val) continue;
    next[key] = pin;
    bumped.push(`${key}: ${val} → ${pin}`);
  }

  return { imports: next, bumped };
}
