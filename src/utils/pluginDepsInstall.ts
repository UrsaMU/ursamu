/**
 * @module utils/pluginDepsInstall
 *
 * Clone-and-install half of the dep resolver. Split from pluginDeps.ts to
 * keep both files under the 200-line cap.
 */

import { dpath } from "../../deps.ts";
import { exists } from "jsr:@std/fs@^0.224.0";

import {
  buildCloneSteps,
  PluginCloneError,
  PluginRenameError,
  type PluginDep,
} from "./pluginSecurity.ts";

export interface CloneAndMoveCtx {
  runStep: (args: string[], env: Record<string, string>) => Promise<{ success: boolean; stderr: string }>;
}

/** Clones `dep` into a tempdir then renames into `depDir`. Tempdir is always
 *  cleaned in a `finally` so no leak on any failure path. */
export async function cloneAndMove(
  ctx:           CloneAndMoveCtx,
  dep:           PluginDep,
  requesterName: string,
  depDir:        string,
): Promise<void> {
  const tempBase = await Deno.makeTempDir({ prefix: "ursamu-plugin-" });
  const tempDir  = dpath.join(tempBase, "plugin");
  try {
    await runCloneSteps(ctx, dep, requesterName, tempDir);
    await stripDotGit(tempDir);
    await renameInto(dep, requesterName, tempDir, depDir);
  } finally {
    await Deno.remove(tempBase, { recursive: true }).catch(() => {});
  }
}

async function runCloneSteps(
  ctx:           CloneAndMoveCtx,
  dep:           PluginDep,
  requesterName: string,
  tempDir:       string,
): Promise<void> {
  const gitEnv = { ...Deno.env.toObject(), GIT_TERMINAL_PROMPT: "0" };
  for (const stepArgs of buildCloneSteps(dep.url, tempDir, dep.ref)) {
    const { success, stderr } = await ctx.runStep(stepArgs, gitEnv);
    if (success) continue;
    throw new PluginCloneError(
      `Failed to clone dep "${dep.name}" required by "${requesterName}": ${stderr.trim()}`,
    );
  }
}

async function stripDotGit(tempDir: string): Promise<void> {
  const gitDir = dpath.join(tempDir, ".git");
  if (await exists(gitDir)) await Deno.remove(gitDir, { recursive: true });
}

async function renameInto(
  dep:           PluginDep,
  requesterName: string,
  tempDir:       string,
  depDir:        string,
): Promise<void> {
  try {
    await Deno.rename(tempDir, depDir);
  } catch (e: unknown) {
    throw new PluginRenameError(
      `Could not move dep "${dep.name}" required by "${requesterName}" into place`,
      e,
    );
  }
}
