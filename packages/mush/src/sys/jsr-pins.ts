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
 * Historical ranges that published plugins bake in via `deno publish`
 * rewrites (e.g. help used mush@^0.1.1). Map them all to one version so
 * addCmd / sessions / gameHooks stay a single module instance.
 */
const ENGINE_OVERRIDE_PKGS = [
  "@ursamu/mush",
  "@ursamu/core",
  "@ursamu/help",
] as const;

/**
 * Ranges baked into published plugins via `deno publish` rewrites.
 * channels/builder still resolve mush@0.1.30 until they re-publish
 * on ^1.0.0. When the host pin is 1.x, cover the full 0.1 / 0.2
 * history so Deno never loads a second mush instance.
 */
function legacyRangesFor(version: string): string[] {
  const parts = version.split(".").map((x) => parseInt(x, 10) || 0);
  const maj = parts[0] ?? 0;
  const patch = parts[2] ?? 0;
  const out = new Set<string>([
    version,
    `^${version}`,
    `~${version}`,
  ]);

  const addSeries = (minorLine: string, maxPatch: number) => {
    out.add(`^${minorLine}`);
    out.add(`~${minorLine}`);
    out.add(minorLine);
    for (let p = 0; p <= maxPatch; p++) {
      const v = `${minorLine}.${p}`;
      out.add(v);
      out.add(`^${v}`);
      out.add(`~${v}`);
    }
  };

  if (maj >= 1) {
    // Pre-1.0 plugin pins still in the wild (through 0.1.35 / 0.2.5).
    addSeries("0.1", 35);
    addSeries("0.2", 5);
  } else {
    // Still on 0.x host pin: cover full 0.1 line through current.
    addSeries("0.1", Math.max(patch, 30));
  }
  return [...out];
}

/**
 * Force dual-package JSR ranges onto one concrete version.
 * Keys look like `jsr:@ursamu/mush@^0.1.1` → `jsr:@ursamu/mush@0.1.28`.
 */
export function applyEngineOverrides(
  imports: Record<string, string>,
  resolved: Map<string, string>,
): { imports: Record<string, string>; overrides: string[] } {
  const next = { ...imports };
  const overrides: string[] = [];

  for (const pkg of ENGINE_OVERRIDE_PKGS) {
    const ver = resolved.get(pkg);
    if (!ver) continue;
    const target = `jsr:${pkg}@${ver}`;
    // Bare package root (some graphs use this).
    const bare = `jsr:${pkg}`;
    if (next[bare] !== target) {
      next[bare] = target;
      overrides.push(`${bare} → ${target}`);
    }
    for (const range of legacyRangesFor(ver)) {
      const key = `jsr:${pkg}@${range}`;
      if (next[key] === target) continue;
      next[key] = target;
      overrides.push(`${key} → ${target}`);
    }
  }

  return { imports: next, overrides };
}

export type BumpImportOptions = {
  /**
   * Pin as exact `pkg@x.y.z` (no ^/~). Game hosts should use this on
   * @restart so deno.lock cannot keep an older resolution inside a
   * caret range, and so every prepare dirties the specifier.
   */
  exact?: boolean;
};

/**
 * Bump jsr:@ursamu/* app imports to latest and apply engine dual-package
 * overrides. Skips remap keys for bumping; overrides are written separately.
 */
export async function bumpUrsamuImports(
  imports: Record<string, string>,
  fetchMeta: (pkg: string) => Promise<string | null> =
    fetchLatestJsrVersion,
  opts: BumpImportOptions = {},
): Promise<{
  imports: Record<string, string>;
  bumped: string[];
  resolved: Map<string, string>;
}> {
  const next = { ...imports };
  const bumped: string[] = [];
  const latestCache = new Map<string, string | null>();
  const exact = opts.exact === true;

  const pkgs = new Set<string>();
  for (const [key, val] of Object.entries(imports)) {
    if (!isAppImportKey(key)) continue;
    const p = parseJsrSpec(val);
    if (p) pkgs.add(p.pkg);
  }
  // Always resolve engine packages for overrides even if not in app map.
  for (const pkg of ENGINE_OVERRIDE_PKGS) pkgs.add(pkg);

  for (const pkg of pkgs) {
    latestCache.set(pkg, await fetchMeta(pkg));
  }

  for (const [key, val] of Object.entries(imports)) {
    if (!isAppImportKey(key)) continue;
    const p = parseJsrSpec(val);
    if (!p) continue;
    const latest = latestCache.get(p.pkg);
    if (!latest) continue;
    const pin = exact
      ? formatJsrPin(p.pkg, latest, latest, p.suffix)
      : formatJsrPin(p.pkg, latest, p.range, p.suffix);
    // Already on this version (and same pin form) — leave alone.
    if (pin === val) continue;
    if (!exact && rangeVersion(p.range) === latest) continue;
    next[key] = pin;
    bumped.push(`${key}: ${val} → ${pin}`);
  }

  const resolved = new Map<string, string>();
  for (const [pkg, ver] of latestCache) {
    if (ver) resolved.set(pkg, ver);
  }

  // Prefer app pin version when already current (exact from imports).
  for (const [key, val] of Object.entries(next)) {
    if (!isAppImportKey(key)) continue;
    const p = parseJsrSpec(val);
    if (!p || !ENGINE_OVERRIDE_PKGS.includes(
      p.pkg as typeof ENGINE_OVERRIDE_PKGS[number],
    )) {
      continue;
    }
    const v = rangeVersion(p.range);
    if (v) resolved.set(p.pkg, v);
  }

  const forced = applyEngineOverrides(next, resolved);
  return {
    imports: forced.imports,
    bumped,
    resolved,
  };
}
