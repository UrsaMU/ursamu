/**
 * Unit tests for pluginSemver — parse/validate helpers used by the dep resolver.
 */
import { assertThrows, assertStringIncludes } from "@std/assert";
import {
  parseRangeOrThrow,
  parseVersionOrThrow,
  checkSatisfies,
} from "../src/utils/pluginSemver.ts";
import {
  PluginSemverError,
  PluginVersionError,
} from "../src/utils/pluginErrors.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("parseRangeOrThrow accepts a valid range", OPTS, () => {
  const r = parseRangeOrThrow("foo", "^1.2.0");
  if (!r) throw new Error("expected Range");
});

Deno.test("parseRangeOrThrow throws PluginSemverError on garbage", OPTS, () => {
  const err = assertThrows(
    () => parseRangeOrThrow("foo", "not-a-range"),
    PluginSemverError,
  );
  assertStringIncludes(err.message, "foo");
});

Deno.test("parseVersionOrThrow accepts a valid version", OPTS, () => {
  const v = parseVersionOrThrow("foo", "1.2.3");
  if (!v) throw new Error("expected SemVer");
});

Deno.test("parseVersionOrThrow throws PluginVersionError for 'unknown'", OPTS, () => {
  assertThrows(
    () => parseVersionOrThrow("foo", "unknown"),
    PluginVersionError,
  );
});

Deno.test("parseVersionOrThrow throws PluginVersionError for empty string", OPTS, () => {
  assertThrows(
    () => parseVersionOrThrow("foo", ""),
    PluginVersionError,
  );
});

Deno.test("checkSatisfies passes when version is in range", OPTS, () => {
  checkSatisfies("foo", "1.3.0", "^1.2.0");
});

Deno.test("checkSatisfies throws PluginSemverError with version and range in message", OPTS, () => {
  const err = assertThrows(
    () => checkSatisfies("foo", "2.0.0", "^1.2.0"),
    PluginSemverError,
  );
  assertStringIncludes(err.message, "2.0.0");
  assertStringIncludes(err.message, "^1.2.0");
});

Deno.test("checkSatisfies — accumulated ranges: v1.3.0 satisfies both ^1.0.0 and ^1.2.0", OPTS, () => {
  checkSatisfies("foo", "1.3.0", "^1.0.0");
  checkSatisfies("foo", "1.3.0", "^1.2.0");
});

Deno.test("checkSatisfies — v1.0.5 does not satisfy ^1.2.0", OPTS, () => {
  assertThrows(
    () => checkSatisfies("foo", "1.0.5", "^1.2.0"),
    PluginSemverError,
  );
});
