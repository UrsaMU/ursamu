import * as dpath from "@std/path";
import { bakeScript } from "./inline.ts";

export const SCRIPTS = ["say.ts", "pose.ts"] as const;

function pluginScriptsDir(): string {
  return dpath.fromFileUrl(new URL("../scripts", import.meta.url));
}

function engineScriptsDir(): string {
  return dpath.join(Deno.cwd(), "system", "scripts");
}

export async function installScripts(): Promise<void> {
  if (!import.meta.url.startsWith("file:")) return;
  const srcDir  = pluginScriptsDir();
  const destDir = engineScriptsDir();
  await Deno.mkdir(destDir, { recursive: true });

  for (const file of SCRIPTS) {
    const src    = dpath.join(srcDir,  file);
    const dest   = dpath.join(destDir, file);
    const backup = dpath.join(destDir, file.replace(".ts", ".original.ts"));

    try {
      try { await Deno.stat(backup); } catch {
        try { await Deno.copyFile(dest, backup); } catch { /* no original */ }
      }
      const baked = await bakeScript(src);
      await Deno.writeTextFile(dest, baked);
      console.log(`[sgp-language] Installed ${file} override.`);
    } catch (e: unknown) {
      console.error(`[sgp-language] Failed to install ${file}:`, e);
    }
  }
}

export async function restoreScripts(): Promise<void> {
  const destDir = engineScriptsDir();
  for (const file of SCRIPTS) {
    const dest   = dpath.join(destDir, file);
    const backup = dpath.join(destDir, file.replace(".ts", ".original.ts"));
    try {
      await Deno.stat(backup);
      await Deno.copyFile(backup, dest);
      await Deno.remove(backup);
    } catch {
      try { await Deno.remove(dest); } catch { /* gone */ }
    }
  }
}
