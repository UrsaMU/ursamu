import { parse as parseSemver, parseRange, satisfies, type Range, type SemVer } from "@std/semver";
import {
  PluginSemverError,
  PluginVersionError,
} from "./pluginSecurity.ts";

/** Parse a semver range, throwing PluginSemverError with the dep name on failure. */
export function parseRangeOrThrow(depName: string, range: string): Range {
  try {
    return parseRange(range);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new PluginSemverError(
      `Plugin "${depName}" has invalid semver range "${range}": ${msg}`,
    );
  }
}

/** Parse a version, throwing PluginVersionError with the dep name on failure.
 *  Also throws on the sentinel value "unknown" used by legacy plugins. */
export function parseVersionOrThrow(depName: string, version: string): SemVer {
  if (!version || version === "unknown") {
    throw new PluginVersionError(
      `Plugin "${depName}" has no valid version in its manifest`,
    );
  }
  try {
    return parseSemver(version);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new PluginVersionError(
      `Plugin "${depName}" has invalid version "${version}": ${msg}`,
    );
  }
}

/** Throws PluginSemverError if `version` does not satisfy `range`. */
export function checkSatisfies(depName: string, version: string, range: string): void {
  const ver = parseVersionOrThrow(depName, version);
  const rng = parseRangeOrThrow(depName, range);
  if (!satisfies(ver, rng)) {
    throw new PluginSemverError(
      `Plugin "${depName}" version ${version} does not satisfy required range "${range}"`,
    );
  }
}
