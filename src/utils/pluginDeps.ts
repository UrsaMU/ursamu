/**
 * @module utils/pluginDeps
 *
 * Fail-fast, semver-aware, conflict-detecting, transactional plugin dependency
 * resolver. Reads `ursamu.plugin.json` from installed plugins and recursively
 * clones any missing deps. Every failure throws a typed PluginInstallError —
 * the caller wraps in an InstallTxn and calls rollback() on throw.
 */

import { dpath } from "../../deps.ts";
import { exists } from "jsr:@std/fs@^0.224.0";

import {
  type PluginDep,
  type PluginManifest,
  type Registry,
  PluginConflictError,
  PluginDepNameError,
  PluginDepUrlError,
  PluginVersionError,
  PluginSemverError,
  isSafePluginName,
  isSafePluginUrl,
  runGitStep,
} from "./pluginSecurity.ts";
import { checkSatisfies } from "./pluginSemver.ts";
import type { InstallTxn } from "./pluginTxn.ts";
import { cloneAndMove } from "./pluginDepsInstall.ts";

export interface ResolveDepsCtx {
  pluginsDir: string;
  reg:        Registry;
  txn:        InstallTxn;
  resolving:  Set<string>;
  requests:   Map<string, Array<{ range?: string; requester: string }>>;
  installed:  string[];
  runStep:    (args: string[], env: Record<string, string>) => Promise<{ success: boolean; stderr: string }>;
}

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

/** Build a ResolveDepsCtx with `runStep` defaulted to `runGitStep`. */
export function makeDefaultCtx(
  base: Omit<ResolveDepsCtx, "runStep"> & Partial<Pick<ResolveDepsCtx, "runStep">>,
): ResolveDepsCtx {
  return { ...base, runStep: base.runStep ?? runGitStep };
}

export async function resolveDeps(
  ctx:           ResolveDepsCtx,
  pluginDir:     string,
  requesterName: string,
): Promise<void> {
  const meta = await readPluginMeta(pluginDir);
  if (!meta.deps?.length) return;
  for (const dep of meta.deps) {
    await processDep(ctx, dep, requesterName);
  }
}

async function processDep(
  ctx:           ResolveDepsCtx,
  dep:           PluginDep,
  requesterName: string,
): Promise<void> {
  if (!isSafePluginName(dep.name)) {
    throw new PluginDepNameError(
      `Dep "${dep.name}" requested by "${requesterName}" has an invalid name`,
    );
  }
  if (!isSafePluginUrl(dep.url)) {
    throw new PluginDepUrlError(
      `Dep "${dep.name}" requested by "${requesterName}" has an unsafe URL "${dep.url}"`,
    );
  }
  const reqList = ctx.requests.get(dep.name) ?? [];
  reqList.push({ range: dep.version, requester: requesterName });
  ctx.requests.set(dep.name, reqList);

  if (ctx.resolving.has(dep.name)) return;
  ctx.resolving.add(dep.name);

  const depDir = dpath.join(ctx.pluginsDir, dep.name);
  if (await exists(depDir)) {
    const version = await readPluginVersion(depDir);
    verifyDepRanges(dep.name, version, reqList);
    await resolveDeps(ctx, depDir, dep.name);
    return;
  }
  await installDep(ctx, dep, requesterName, depDir, reqList);
}

async function installDep(
  ctx:           ResolveDepsCtx,
  dep:           PluginDep,
  requesterName: string,
  depDir:        string,
  reqList:       Array<{ range?: string; requester: string }>,
): Promise<void> {
  await cloneAndMove({ runStep: ctx.runStep }, dep, requesterName, depDir);
  ctx.txn.recordDir(depDir);

  const version = await readPluginVersion(depDir);
  verifyDepRanges(dep.name, version, reqList);

  ctx.txn.recordRegistry(dep.name, ctx.reg[dep.name]);
  const now = new Date().toISOString();
  ctx.reg[dep.name] = {
    name:        dep.name,
    version,
    description: "",
    source:      dep.url,
    author:      "unknown",
    ref:         dep.ref,
    installedAt: now,
    updatedAt:   now,
  };
  ctx.installed.push(`${dep.name}@${version}`);

  await resolveDeps(ctx, depDir, dep.name);
}

export function verifyDepRanges(
  depName:          string,
  installedVersion: string,
  requests:         Array<{ range?: string; requester: string }>,
): void {
  const ranged = requests.filter((r): r is { range: string; requester: string } =>
    typeof r.range === "string" && r.range.length > 0
  );
  for (const req of ranged) {
    if (!installedVersion || installedVersion === "unknown") {
      throw new PluginVersionError(
        `Dep "${depName}" required by "${req.requester}" with range "${req.range}" has no valid installed version`,
      );
    }
    try {
      checkSatisfies(depName, installedVersion, req.range);
    } catch (e: unknown) {
      throw rewrapSemverFailure(depName, installedVersion, ranged, req.range, e);
    }
  }
}

function rewrapSemverFailure(
  depName:           string,
  installedVersion:  string,
  ranged:            Array<{ range: string; requester: string }>,
  failingRange:      string,
  cause:             unknown,
): Error {
  if (ranged.length < 2) {
    if (cause instanceof PluginSemverError || cause instanceof PluginVersionError) return cause;
    return new PluginSemverError(
      `Plugin "${depName}" version ${installedVersion} does not satisfy "${failingRange}"`,
      cause,
    );
  }
  const pairs = ranged.map(r => `${r.requester} wants ${r.range}`).join(", ");
  return new PluginConflictError(
    `Plugin "${depName}" version ${installedVersion} conflict: ${pairs}, ` +
    `version does not satisfy ${failingRange}`,
    cause,
  );
}
