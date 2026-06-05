/**
 * @module cli/plugin-security
 *
 * Minimal git clone helpers extracted from src/utils/pluginSecurity.ts.
 * Only the subset needed by the CLI plugin manager.
 */

/**
 * Returns true when `ref` looks like a git commit SHA (7–40 hex chars).
 */
export function isShaRef(ref: string): boolean {
  return /^[0-9a-f]{7,40}$/i.test(ref);
}

/**
 * Returns the sequence of git argument arrays needed to clone and pin to `ref`.
 *
 * - No ref:      single `git clone --depth 1`
 * - Tag/branch:  single `git clone --depth 1 --branch <ref> --single-branch`
 * - Commit SHA:  four-step init → remote add → fetch <sha> --depth 1 → checkout FETCH_HEAD
 */
export function buildCloneSteps(
  url: string,
  dest: string,
  ref: string | undefined,
): string[][] {
  if (!ref) return [["clone", "--depth", "1", url, dest]];
  if (isShaRef(ref)) {
    return [
      ["init", dest],
      ["-C", dest, "remote", "add", "origin", url],
      ["-C", dest, "fetch", "--depth", "1", "origin", ref],
      ["-C", dest, "checkout", "FETCH_HEAD"],
    ];
  }
  return [["clone", "--depth", "1", "--branch", ref, "--single-branch", url, dest]];
}
