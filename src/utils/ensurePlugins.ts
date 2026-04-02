import { dpath } from "../../deps.ts";
import { exists } from "jsr:@std/fs@^0.224.0";

/**
 * ensurePlugins
 *
 * Reads `src/plugins/plugins.manifest.json` and, for any plugin whose
 * directory is absent, automatically clones and installs it from the
 * declared URL — no user interaction required.
 *
 * Called by loadPlugins() before the plugin directory walk so that
 * manifest-declared plugins are always present when the server starts.
 *
 * Security controls:
 *   - isSafePluginName: rejects names with path traversal sequences (H1)
 *   - isSafePluginUrl:  allows only https:// URLs (H2)
 *   - buildCloneArgs:   pins to `ref` when provided (M1)
 */

interface ManifestEntry {
  name: string;
  url: string;
  /** Optional git tag, branch, or commit SHA to pin the install to. */
  ref?: string;
  description?: string;
  ursamu?: string;
}

/** A dependency declared inside a plugin's own ursamu.plugin.json. */
interface PluginDep {
  name: string;
  url:  string;
  ref?: string;
}

interface PluginManifest {
  version?:     string;
  deps?:        PluginDep[];
}

interface PluginsManifest {
  plugins: ManifestEntry[];
}

interface RegistryEntry {
  name: string;
  version: string;
  description: string;
  source: string;
  author: string;
  /** The git tag, branch, or commit SHA this entry was installed/updated from. */
  ref?: string;
  installedAt: string;
  updatedAt: string;
}

type Registry = Record<string, RegistryEntry>;

// ─── Exported security guards ─────────────────────────────────────────────────

/**
 * Returns true only for safe plugin name slugs:
 * alphanumeric + hyphens, must start with a letter or digit, no dots/slashes.
 * Rejects all path-traversal sequences (e.g. "../../evil", "/abs", "foo/bar").
 */
export function isSafePluginName(name: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(name);
}

/**
 * Returns true only for https:// URLs.
 * Rejects file://, git://, ssh://, http:// and any other scheme that could
 * clone from local paths or use unencrypted/unauthenticated transports.
 */
export function isSafePluginUrl(url: string): boolean {
  return url.startsWith("https://");
}

/**
 * Returns true when `ref` looks like a git commit SHA (7–40 hex chars).
 * Tags and branch names contain non-hex characters (dots, letters like g/h/r…)
 * and will return false.
 */
export function isShaRef(ref: string): boolean {
  return /^[0-9a-f]{7,40}$/i.test(ref);
}

/**
 * Builds the git clone argument list for a tag/branch ref (or unpinned).
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
 *                (git does not support `--branch <sha>` for bare commit hashes)
 */
export function buildCloneSteps(url: string, dest: string, ref: string | undefined): string[][] {
  if (!ref) {
    return [["clone", "--depth", "1", url, dest]];
  }
  if (isShaRef(ref)) {
    return [
      ["init", dest],
      ["-C", dest, "remote", "add", "origin", url],
      ["-C", dest, "fetch", "--depth", "1", "origin", ref],
      ["-C", dest, "checkout", "FETCH_HEAD"],
    ];
  }
  // Tag or branch name
  return [["clone", "--depth", "1", "--branch", ref, "--single-branch", url, dest]];
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const GIT_STEP_TIMEOUT_MS = 30_000;

/**
 * Runs a single `git` command with a hard timeout.
 * Kills the child process and returns a failure result if the timeout elapses,
 * preventing `ensurePlugins` from blocking server startup indefinitely.
 * Exported for unit testing; production callers always use the defaults.
 *
 * @param args      Arguments forwarded to the command.
 * @param env       Environment for the child process.
 * @param options   Optional overrides: `timeoutMs` (default 30 s) and `cmd`
 *                  (default "git") — the `cmd` override is test-only.
 */
export async function runGitStep(
  args: string[],
  env: Record<string, string>,
  { timeoutMs = GIT_STEP_TIMEOUT_MS, cmd = "git" }: { timeoutMs?: number; cmd?: string } = {},
): Promise<{ success: boolean; stderr: string }> {
  const proc = new Deno.Command(cmd, {
    args,
    stdout: "null",
    stderr: "piped",
    env,
  }).spawn();

  // Drain stderr into a buffer while the process runs.
  const stderrText = new Response(proc.stderr).text();

  const statusOrTimeout = await Promise.race([
    proc.status,
    new Promise<null>(resolve => setTimeout(() => resolve(null), timeoutMs)),
  ]);

  if (statusOrTimeout === null) {
    // Timed out — kill the child so it does not linger.
    try { proc.kill("SIGKILL"); } catch { /* already dead */ }
    // Suppress the stderrText Promise so it cannot become an unhandled rejection
    // if the pipe errors rather than closing cleanly after SIGKILL.
    stderrText.catch(() => {});
    return { success: false, stderr: `Git timed out after ${timeoutMs / 1_000}s` };
  }

  return { success: statusOrTimeout.success, stderr: await stderrText.catch(() => "") };
}

async function readRegistry(registryPath: string): Promise<Registry> {
  try {
    if (!await exists(registryPath)) return {};
    return JSON.parse(await Deno.readTextFile(registryPath)) as Registry;
  } catch {
    return {};
  }
}

async function writeRegistry(registryPath: string, reg: Registry): Promise<void> {
  await Deno.writeTextFile(registryPath, JSON.stringify(reg, null, 2));
}

async function readPluginMeta(dir: string): Promise<PluginManifest> {
  try {
    const raw = await Deno.readTextFile(dpath.join(dir, "ursamu.plugin.json"));
    return JSON.parse(raw) as PluginManifest;
  } catch {
    return {};
  }
}

async function readPluginVersion(dir: string): Promise<string> {
  return (await readPluginMeta(dir)).version ?? "unknown";
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function ensurePlugins(pluginsDir: string): Promise<void> {
  const manifestPath = dpath.join(pluginsDir, "plugins.manifest.json");
  if (!await exists(manifestPath)) return;

  let manifest: PluginsManifest;
  try {
    manifest = JSON.parse(await Deno.readTextFile(manifestPath)) as PluginsManifest;
  } catch (e) {
    console.error("[ensurePlugins] Could not parse plugins.manifest.json:", e);
    return;
  }

  const registryPath = dpath.join(pluginsDir, ".registry.json");
  const reg = await readRegistry(registryPath);
  const installed: string[] = [];

  for (const entry of manifest.plugins) {
    // H1 — reject names with path traversal sequences
    if (!isSafePluginName(entry.name)) {
      console.warn(`[ensurePlugins] Skipping entry: invalid plugin name "${entry.name}"`);
      continue;
    }

    // H2 — reject non-https URLs
    if (!isSafePluginUrl(entry.url)) {
      console.warn(`[ensurePlugins] Skipping "${entry.name}": unsafe URL scheme in "${entry.url}"`);
      continue;
    }

    // M1 — warn when no ref is pinned
    if (!entry.ref) {
      console.warn(
        `[ensurePlugins] "${entry.name}" has no "ref" — installing HEAD of default branch. ` +
        `Add a "ref" (tag or commit SHA) to pin the version.`,
      );
    }

    const targetDir = dpath.join(pluginsDir, entry.name);
    if (await exists(targetDir)) {
      const installedRef = reg[entry.name]?.ref;
      // Only auto-update when the manifest has a ref AND it differs from what's installed.
      // Unpinned plugins (no manifest ref) are left as-is to avoid surprising HEAD re-fetches.
      if (!entry.ref || installedRef === entry.ref) continue;

      console.log(
        `[ensurePlugins] Plugin "${entry.name}" ref changed ` +
        `(${installedRef ?? "unpinned"} → ${entry.ref}) — updating...`,
      );
      await Deno.remove(targetDir, { recursive: true });
    }

    // Use a subdirectory as the clone destination so git creates it itself.
    // Cloning into a pre-existing directory (even empty) fails on some git versions.
    const tempBase = await Deno.makeTempDir({ prefix: "ursamu-plugin-" });
    const tempDir = dpath.join(tempBase, "plugin");
    try {
      const steps = buildCloneSteps(entry.url, tempDir, entry.ref);
      let stepFailed = false;
      const gitEnv = { ...Deno.env.toObject(), GIT_TERMINAL_PROMPT: "0" };
      for (const stepArgs of steps) {
        const { success, stderr } = await runGitStep(stepArgs, gitEnv);
        if (!success) {
          console.error(`[ensurePlugins] Failed to install "${entry.name}": ${stderr.trim()}`);
          stepFailed = true;
          break;
        }
      }
      if (stepFailed) {
        await Deno.remove(tempBase, { recursive: true }).catch(() => {});
        continue;
      }

      // Strip the .git directory before moving
      const gitDir = dpath.join(tempDir, ".git");
      if (await exists(gitDir)) await Deno.remove(gitDir, { recursive: true });

      await Deno.mkdir(pluginsDir, { recursive: true });

      // L1 — catch rename errors (TOCTOU: another process may have created targetDir)
      try {
        await Deno.rename(tempDir, targetDir);
      } catch (renameErr) {
        await Deno.remove(tempBase, { recursive: true }).catch(() => {});
        console.warn(`[ensurePlugins] Could not move "${entry.name}" into place: ${renameErr}`);
        continue;
      }

      // tempBase is now empty after the rename — clean it up
      await Deno.remove(tempBase, { recursive: true }).catch(() => {});

      const version = await readPluginVersion(targetDir);
      const now = new Date().toISOString();
      reg[entry.name] = {
        name:        entry.name,
        version,
        description: entry.description ?? "",
        source:      entry.url,
        author:      "unknown",
        ref:         entry.ref,
        installedAt: reg[entry.name]?.installedAt ?? now,
        updatedAt:   now,
      };
      await writeRegistry(registryPath, reg);

      installed.push(`${entry.name}@${version}`);
    } catch (err) {
      await Deno.remove(tempBase, { recursive: true }).catch(() => {});
      console.error(`[ensurePlugins] Failed to install "${entry.name}":`, err);
    }
  }

  // Resolve deps declared in each installed plugin's ursamu.plugin.json.
  // Uses a shared Set to prevent re-entrancy / circular dep loops.
  const resolving: Set<string> = new Set(manifest.plugins.map(e => e.name));
  for (const entry of manifest.plugins) {
    const targetDir = dpath.join(pluginsDir, entry.name);
    if (!await exists(targetDir)) continue;
    await resolveDeps(pluginsDir, targetDir, reg, resolving, installed);
  }

  if (installed.length) {
    console.log(`[plugins] Installed: ${installed.join(", ")}`);
  }
}

/**
 * Read a plugin's declared deps from its ursamu.plugin.json and install any
 * that are absent.  Recurses into each newly-installed dep's own deps.
 * `resolving` tracks names currently being processed to break circular chains.
 */
async function resolveDeps(
  pluginsDir: string,
  pluginDir:  string,
  reg:        Registry,
  resolving:  Set<string>,
  installed:  string[],
): Promise<void> {
  const meta = await readPluginMeta(pluginDir);
  if (!meta.deps?.length) return;

  for (const dep of meta.deps) {
    if (!isSafePluginName(dep.name)) {
      console.warn(`[ensurePlugins] Skipping dep "${dep.name}": invalid name`);
      continue;
    }
    if (!isSafePluginUrl(dep.url)) {
      console.warn(`[ensurePlugins] Skipping dep "${dep.name}": unsafe URL`);
      continue;
    }
    if (resolving.has(dep.name)) continue; // already installed or in-flight
    resolving.add(dep.name);

    const depDir = dpath.join(pluginsDir, dep.name);
    if (await exists(depDir)) {
      // Dep already on disk — still recurse in case it has its own deps.
      await resolveDeps(pluginsDir, depDir, reg, resolving, installed);
      continue;
    }

    console.log(`[ensurePlugins] Installing dep "${dep.name}" (required by ${dpath.basename(pluginDir)})...`);
    const tempBase = await Deno.makeTempDir({ prefix: "ursamu-plugin-" });
    const tempDir  = dpath.join(tempBase, "plugin");
    try {
      const steps  = buildCloneSteps(dep.url, tempDir, dep.ref);
      const gitEnv = { ...Deno.env.toObject(), GIT_TERMINAL_PROMPT: "0" };
      let failed   = false;
      for (const stepArgs of steps) {
        const { success, stderr } = await runGitStep(stepArgs, gitEnv);
        if (!success) {
          console.error(`[ensurePlugins] Failed to install dep "${dep.name}": ${stderr.trim()}`);
          failed = true;
          break;
        }
      }
      if (failed) { await Deno.remove(tempBase, { recursive: true }).catch(() => {}); continue; }

      const gitDir = dpath.join(tempDir, ".git");
      if (await exists(gitDir)) await Deno.remove(gitDir, { recursive: true });

      try {
        await Deno.rename(tempDir, depDir);
      } catch (e) {
        await Deno.remove(tempBase, { recursive: true }).catch(() => {});
        console.warn(`[ensurePlugins] Could not move dep "${dep.name}" into place: ${e}`);
        continue;
      }
      await Deno.remove(tempBase, { recursive: true }).catch(() => {});

      const version = await readPluginVersion(depDir);
      const now     = new Date().toISOString();
      reg[dep.name] = {
        name: dep.name, version, description: "", source: dep.url,
        author: "unknown", ref: dep.ref,
        installedAt: now, updatedAt: now,
      };
      installed.push(`${dep.name}@${version}`);

      // Recurse into the newly-installed dep's own deps.
      await resolveDeps(pluginsDir, depDir, reg, resolving, installed);
    } catch (err) {
      await Deno.remove(tempBase, { recursive: true }).catch(() => {});
      console.error(`[ensurePlugins] Failed to install dep "${dep.name}":`, err);
    }
  }
}
