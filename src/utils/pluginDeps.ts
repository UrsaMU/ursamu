/**
 * @module utils/pluginDeps
 *
 * Plugin dependency resolver for the plugin installer.
 * Reads `ursamu.plugin.json` from installed plugins and recursively clones
 * any missing dependencies.
 *
 * Consumed by ensurePlugins.ts.
 */

import { dpath } from "../../deps.ts";
import { exists }  from "jsr:@std/fs@^0.224.0";

import {
  type Registry,
  isSafePluginName,
  isSafePluginUrl,
  buildCloneSteps,
  runGitStep,
} from "./pluginSecurity.ts";
import type { PluginManifest } from "./pluginSecurity.ts";

// ── Shared helpers (also used by ensurePlugins.ts) ────────────────────────────

export async function readPluginMeta(dir: string): Promise<PluginManifest> {
  try {
    const raw = await Deno.readTextFile(dpath.join(dir, "ursamu.plugin.json"));
    return JSON.parse(raw) as PluginManifest;
  } catch {
    return {};
  }
}

export async function readPluginVersion(dir: string): Promise<string> {
  return (await readPluginMeta(dir)).version ?? "unknown";
}

// ── Dependency resolver ───────────────────────────────────────────────────────

/**
 * Read a plugin's declared deps from its `ursamu.plugin.json` and install any
 * that are absent.  Recurses into each newly-installed dep's own deps.
 * `resolving` tracks names currently being processed to break circular chains.
 */
export async function resolveDeps(
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

    console.log(
      `[ensurePlugins] Installing dep "${dep.name}" ` +
      `(required by ${dpath.basename(pluginDir)})...`,
    );
    const tempBase = await Deno.makeTempDir({ prefix: "ursamu-plugin-" });
    const tempDir  = dpath.join(tempBase, "plugin");
    try {
      const gitEnv = { ...Deno.env.toObject(), GIT_TERMINAL_PROMPT: "0" };
      let failed   = false;
      for (const stepArgs of buildCloneSteps(dep.url, tempDir, dep.ref)) {
        const { success, stderr } = await runGitStep(stepArgs, gitEnv);
        if (!success) {
          console.error(`[ensurePlugins] Failed to install dep "${dep.name}": ${stderr.trim()}`);
          failed = true;
          break;
        }
      }
      if (failed) {
        await Deno.remove(tempBase, { recursive: true }).catch(() => {});
        continue;
      }

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
