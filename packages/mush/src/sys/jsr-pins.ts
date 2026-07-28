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

/** Strip ^/~/>= from a range and return the leading semver. */
export function rangeVersion(range: string): string {
  return range.replace(/^[\^~>=\s]+/, "").split(/[^0-9.]/)[0] ??
    "";
}

/** Keep ^/~ / exact style from the old pin when writing the new version. */
export function formatJsrPin(
  pkg: string,
  version: string,
  oldRange: string,
  suffix = "",
): string {
  let prefix = "";
  if (oldRange.startsWith("~")) prefix = "~";
  else if (oldRange.startsWith("^") || oldRange === "") prefix = "^";
  else if (oldRange.startsWith(">=")) prefix = ">=";
  // bare x.y.z stays exact (no forced caret)
  return `jsr:${pkg}@${prefix}${version}${suffix}`;
}

/**
 * App import keys only — skip deno.json remap entries whose key is
 * itself a jsr:/npm: specifier (those are dual-package shims).
 */
export function isAppImportKey(key: string): boolean {
  const k = key.trim();
  if (!k) return false;
  if (k.startsWith("jsr:") || k.startsWith("npm:")) return false;
  if (k.startsWith("http:") || k.startsWith("https:")) return false;
  return true;
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
 * Bump jsr:@ursamu/* app imports to latest.
 * Skips remap keys and no-ops when the pin already resolves to latest.
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
  for (const [key, val] of Object.entries(imports)) {
    if (!isAppImportKey(key)) continue;
    const p = parseJsrSpec(val);
    if (p) pkgs.add(p.pkg);
  }

  for (const pkg of pkgs) {
    latestCache.set(pkg, await fetchMeta(pkg));
  }

  for (const [key, val] of Object.entries(imports)) {
    if (!isAppImportKey(key)) continue;
    const p = parseJsrSpec(val);
    if (!p) continue;
    const latest = latestCache.get(p.pkg);
    if (!latest) continue;
    // Already on this version (any range prefix) — leave alone.
    if (rangeVersion(p.range) === latest) continue;
    const pin = formatJsrPin(p.pkg, latest, p.range, p.suffix);
    if (pin === val) continue;
    next[key] = pin;
    bumped.push(`${key}: ${val} → ${pin}`);
  }

  return { imports: next, bumped };
}
