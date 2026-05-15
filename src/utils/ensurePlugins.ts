/**
 * @module utils/ensurePlugins
 *
 * Reads `src/plugins/plugins.manifest.json` and, for any plugin whose
 * directory is absent, clones and installs it. The entire manifest run is
 * wrapped in a single InstallTxn — any failure rolls back every dir and
 * registry mutation made during this run.
 */

import { dpath } from "../../deps.ts";
import { exists } from "jsr:@std/fs@^0.224.0";

import {
  type ManifestEntry,
  type PluginsManifest,
  type Registry,
  isSafePluginName,
  isSafePluginUrl,
  runGitStep,
  PluginDepNameError,
  PluginDepUrlError,
} from "./pluginSecurity.ts";
import { readPluginVersion, resolveDeps, makeDefaultCtx, type ResolveDepsCtx } from "./pluginDeps.ts";
import { cloneAndMove } from "./pluginDepsInstall.ts";
import { InstallTxn } from "./pluginTxn.ts";

export {
  isSafePluginName,
  isSafePluginUrl,
  isShaRef,
  buildCloneArgs,
  buildCloneSteps,
  runGitStep,
} from "./pluginSecurity.ts";

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

async function linkLocal(pluginsDir: string, entry: ManifestEntry): Promise<void> {
  const targetDir = dpath.join(pluginsDir, entry.name);
  if (await exists(targetDir)) return;
  const gameRoot = dpath.resolve(pluginsDir, "../../..");
  const localAbs = dpath.resolve(gameRoot, entry.local!);
  try {
    await Deno.symlink(localAbs, targetDir);
    console.log(`[ensurePlugins] Linked local plugin "${entry.name}" → ${localAbs}`);
  } catch (e: unknown) {
    console.warn(`[ensurePlugins] Could not symlink local plugin "${entry.name}": ${e}`);
  }
}

function validateEntry(entry: ManifestEntry): void {
  if (!isSafePluginName(entry.name)) {
    throw new PluginDepNameError(`Invalid plugin name "${entry.name}"`);
  }
  if (!isSafePluginUrl(entry.url)) {
    throw new PluginDepUrlError(`Unsafe URL scheme in "${entry.url}" for plugin "${entry.name}"`);
  }
  if (!entry.ref) {
    console.warn(
      `[ensurePlugins] "${entry.name}" has no "ref" — installing HEAD of default branch. ` +
      `Add a "ref" (tag or commit SHA) to pin the version.`,
    );
  }
}

/** Returns true when the entry is already installed at the desired ref and
 *  should be skipped. Returns false when a fresh install/update is required.
 *  Removes the existing dir when a ref drift is detected. */
async function shouldSkipExisting(
  reg: Registry, entry: ManifestEntry, targetDir: string,
): Promise<boolean> {
  if (!await exists(targetDir)) return false;
  const installedRef = reg[entry.name]?.ref;
  if (!entry.ref || installedRef === entry.ref) return true;
  console.log(
    `[ensurePlugins] Plugin "${entry.name}" ref changed ` +
    `(${installedRef ?? "unpinned"} → ${entry.ref}) — updating...`,
  );
  await Deno.remove(targetDir, { recursive: true });
  return false;
}

async function installEntry(
  ctx: ResolveDepsCtx, entry: ManifestEntry, targetDir: string,
): Promise<void> {
  await cloneAndMove({ runStep: ctx.runStep }, entry, entry.name, targetDir);
  ctx.txn.recordDir(targetDir);

  const version = await readPluginVersion(targetDir);
  ctx.txn.recordRegistry(entry.name, ctx.reg[entry.name]);
  const now = new Date().toISOString();
  ctx.reg[entry.name] = {
    name:        entry.name,
    version,
    description: entry.description ?? "",
    source:      entry.url,
    author:      "unknown",
    ref:         entry.ref,
    installedAt: ctx.reg[entry.name]?.installedAt ?? now,
    updatedAt:   now,
  };
  ctx.installed.push(`${entry.name}@${version}`);
}

async function processEntry(
  ctx: ResolveDepsCtx, entry: ManifestEntry,
): Promise<void> {
  if (entry.local) { await linkLocal(ctx.pluginsDir, entry); return; }

  validateEntry(entry);
  const targetDir = dpath.join(ctx.pluginsDir, entry.name);
  if (await shouldSkipExisting(ctx.reg, entry, targetDir)) {
    await resolveDeps(ctx, targetDir, entry.name);
    return;
  }
  await Deno.mkdir(ctx.pluginsDir, { recursive: true });
  await installEntry(ctx, entry, targetDir);
  await resolveDeps(ctx, targetDir, entry.name);
}

export async function ensurePlugins(pluginsDir: string): Promise<void> {
  const manifestPath = dpath.join(pluginsDir, "plugins.manifest.json");
  if (!await exists(manifestPath)) return;

  let manifest: PluginsManifest;
  try {
    manifest = JSON.parse(await Deno.readTextFile(manifestPath)) as PluginsManifest;
  } catch (e: unknown) {
    console.error("[ensurePlugins] Could not parse plugins.manifest.json:", e);
    return;
  }

  const registryPath = dpath.join(pluginsDir, ".registry.json");
  const reg = await readRegistry(registryPath);
  const txn = new InstallTxn();
  const ctx = makeDefaultCtx({
    pluginsDir,
    reg,
    txn,
    resolving: new Set(manifest.plugins.map(e => e.name)),
    requests:  new Map(),
    installed: [],
    runStep:   runGitStep,
  });

  try {
    for (const entry of manifest.plugins) {
      await processEntry(ctx, entry);
    }
  } catch (e: unknown) {
    console.error("[ensurePlugins] Install run failed, rolling back:", e);
    await txn.rollback(reg);
    await writeRegistry(registryPath, reg);
    throw e;
  }

  await writeRegistry(registryPath, reg);
  txn.commit();

  if (ctx.installed.length) {
    console.log(`[plugins] Installed: ${ctx.installed.join(", ")}`);
  }
}
