/**
 * @module utils/ensurePlugins
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
 *   - buildCloneSteps:  pins to `ref` when provided; SHA ref uses safe
 *                       init/fetch/checkout flow (M1)
 */

import { dpath } from "../../deps.ts";
import { exists }  from "jsr:@std/fs@^0.224.0";

import {
  type Registry,
  type PluginsManifest,
  isSafePluginName,
  isSafePluginUrl,
  buildCloneSteps,
  runGitStep,
} from "./pluginSecurity.ts";
import { readPluginVersion, resolveDeps } from "./pluginDeps.ts";

// Re-export security guards for external callers (tests, CLI, etc.)
export {
  isSafePluginName,
  isSafePluginUrl,
  isShaRef,
  buildCloneArgs,
  buildCloneSteps,
  runGitStep,
} from "./pluginSecurity.ts";

// ── Registry helpers ──────────────────────────────────────────────────────────

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

// ── Main export ───────────────────────────────────────────────────────────────

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
    // Local dev override — symlink to the given path, never fetch from GitHub.
    if (entry.local) {
      const targetDir = dpath.join(pluginsDir, entry.name);
      if (!await exists(targetDir)) {
        // Resolve relative to the game root (three levels up from pluginsDir)
        const gameRoot = dpath.resolve(pluginsDir, "../../..");
        const localAbs = dpath.resolve(gameRoot, entry.local);
        try {
          await Deno.symlink(localAbs, targetDir);
          console.log(`[ensurePlugins] Linked local plugin "${entry.name}" → ${localAbs}`);
        } catch (e) {
          console.warn(`[ensurePlugins] Could not symlink local plugin "${entry.name}": ${e}`);
        }
      }
      continue;
    }

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
      if (!entry.ref || installedRef === entry.ref) continue;

      console.log(
        `[ensurePlugins] Plugin "${entry.name}" ref changed ` +
        `(${installedRef ?? "unpinned"} → ${entry.ref}) — updating...`,
      );
      await Deno.remove(targetDir, { recursive: true });
    }

    const tempBase = await Deno.makeTempDir({ prefix: "ursamu-plugin-" });
    const tempDir  = dpath.join(tempBase, "plugin");
    try {
      const gitEnv = { ...Deno.env.toObject(), GIT_TERMINAL_PROMPT: "0" };
      let stepFailed = false;
      for (const stepArgs of buildCloneSteps(entry.url, tempDir, entry.ref)) {
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

      // L1 — catch rename errors (TOCTOU)
      try {
        await Deno.rename(tempDir, targetDir);
      } catch (renameErr) {
        await Deno.remove(tempBase, { recursive: true }).catch(() => {});
        console.warn(`[ensurePlugins] Could not move "${entry.name}" into place: ${renameErr}`);
        continue;
      }
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
