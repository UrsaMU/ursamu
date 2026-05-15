/**
 * @module utils/pluginSecurity
 *
 * Security guards and git clone helpers for the plugin installer.
 * Consumed by ensurePlugins.ts and its tests.
 */

// ── Shared manifest types ─────────────────────────────────────────────────────

export interface ManifestEntry {
  name:         string;
  url:          string;
  /** Optional git tag, branch, or commit SHA to pin the install to. */
  ref?:         string;
  description?: string;
  ursamu?:      string;
  /**
   * Local development override. When set, ensurePlugins skips fetching this
   * plugin entirely — the directory at this path is used as-is.
   * Path is relative to the game project root (where deno.json lives).
   */
  local?:       string;
}

/** A dependency declared inside a plugin's own ursamu.plugin.json. */
export interface PluginDep {
  name: string;
  url:  string;
  ref?: string;
  /** Optional semver range, e.g. "^1.2.0". When set, installed dep version must satisfy. */
  version?: string;
}

export interface PluginManifest {
  version?: string;
  deps?:    PluginDep[];
}

export interface PluginsManifest {
  plugins: ManifestEntry[];
}

export interface RegistryEntry {
  name:        string;
  version:     string;
  description: string;
  source:      string;
  author:      string;
  /** The git tag, branch, or commit SHA this entry was installed/updated from. */
  ref?:        string;
  installedAt: string;
  updatedAt:   string;
}

export type Registry = Record<string, RegistryEntry>;

// ── Security guards ───────────────────────────────────────────────────────────

/**
 * Returns true only for safe plugin name slugs:
 * alphanumeric + hyphens, must start with a letter or digit.
 * Rejects path-traversal sequences (dots, slashes).
 */
export function isSafePluginName(name: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(name);
}

/**
 * Returns true only for https:// URLs.
 * Rejects file://, git://, ssh://, http:// and any other unsafe scheme.
 */
export function isSafePluginUrl(url: string): boolean {
  return url.startsWith("https://");
}

/**
 * Returns true when `ref` looks like a git commit SHA (7–40 hex chars).
 * Tags and branch names contain non-hex characters and return false.
 */
export function isShaRef(ref: string): boolean {
  return /^[0-9a-f]{7,40}$/i.test(ref);
}

// ── Clone argument builders ────────────────────────────────────────────────────

/**
 * Builds git clone argument list for a tag/branch ref (or unpinned).
 * For commit SHA pinning use buildCloneSteps instead.
 */
export function buildCloneArgs(url: string, dest: string, ref: string | undefined): string[] {
  if (ref) {
    return ["clone", "--depth", "1", "--branch", ref, "--single-branch", url, dest];
  }
  return ["clone", "--depth", "1", url, dest];
}

/**
 * Returns the sequence of git argument arrays needed to clone and pin to `ref`.
 *
 * - No ref:      single `git clone --depth 1`
 * - Tag/branch:  single `git clone --depth 1 --branch <ref> --single-branch`
 * - Commit SHA:  four-step init → remote add → fetch <sha> --depth 1 → checkout FETCH_HEAD
 */
export function buildCloneSteps(url: string, dest: string, ref: string | undefined): string[][] {
  if (!ref)       return [["clone", "--depth", "1", url, dest]];
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

// ── Git runner ─────────────────────────────────────────────────────────────────

const GIT_STEP_TIMEOUT_MS = 30_000;

/**
 * Runs a single `git` command with a hard timeout.
 * Kills the child process and returns a failure result on timeout.
 *
 * @param args      Arguments forwarded to the command.
 * @param env       Environment for the child process.
 * @param options   Optional overrides: `timeoutMs` (default 30 s) and `cmd`
 *                  (default "git") — `cmd` override is for tests only.
 */
export async function runGitStep(
  args: string[],
  env:  Record<string, string>,
  { timeoutMs = GIT_STEP_TIMEOUT_MS, cmd = "git" }: { timeoutMs?: number; cmd?: string } = {},
): Promise<{ success: boolean; stderr: string }> {
  const proc = new Deno.Command(cmd, {
    args, stdout: "null", stderr: "piped", env,
  }).spawn();

  const stderrText = new Response(proc.stderr).text();
  const result = await Promise.race([
    proc.status,
    new Promise<null>(resolve => setTimeout(() => resolve(null), timeoutMs)),
  ]);

  if (result === null) {
    try { proc.kill("SIGKILL"); } catch { /* already dead */ }
    stderrText.catch(() => {});
    return { success: false, stderr: `Git timed out after ${timeoutMs / 1_000}s` };
  }
  return { success: result.success, stderr: await stderrText.catch(() => "") };
}

// ── Typed errors (re-exported from pluginErrors.ts) ───────────────────────────

export {
  PluginCloneError,
  PluginConflictError,
  PluginDepNameError,
  PluginDepUrlError,
  PluginInstallError,
  PluginRenameError,
  PluginSemverError,
  PluginVersionError,
} from "./pluginErrors.ts";
