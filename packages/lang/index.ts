import "./commands.ts";
import type { IPlugin } from "@ursamu/ursamu";
import { getConfig } from "@ursamu/ursamu";
import * as dpath from "@std/path";
import denoConfig from "./deno.json" with { type: "json" };
import { loadLanguages, setLanguagesDir } from "./src/langStore.ts";
import { installScripts, restoreScripts } from "./src/install.ts";
import {
  installSpeechCmds,
  restoreSpeechCmds,
} from "./src/speech.ts";
import { registerHelp } from "./src/help.ts";

interface LanguagePluginConfig {
  languagesDir?: string;
}

export const plugin: IPlugin = {
  name: "sgp-language-plugin",
  version: denoConfig.version,
  description:
    "Per-listener language garbling for UrsaMU — overrides say/pose to garble " +
    "quoted speech based on each listener's skill in the speaker's active language.",

  init: async () => {
    const configured = getConfig<string>("plugins.sgp-language-plugin.languagesDir") ?? "data/languages";
    const dir = dpath.isAbsolute(configured)
      ? configured
      : dpath.join(Deno.cwd(), configured);

    setLanguagesDir(dir);
    try {
      await Deno.mkdir(dir, { recursive: true });
      let report = await loadLanguages(dir);
      if (report.loaded.length === 0) {
        await seedSamples(dir);
        report = await loadLanguages(dir);
      }
      console.log(
        `[sgp-language] Loaded ${report.loaded.length} language(s) from ${dir}.`,
      );
      if (report.errors.length) {
        console.warn(`[sgp-language] Errors:\n  ${report.errors.join("\n  ")}`);
      }
      await installScripts();
      // Native cmds — system/scripts overrides are not dispatched by
      // the current pipeline (stock addCmd wins). Replace say/pose.
      installSpeechCmds();
      registerHelp();
    } catch (e: unknown) {
      console.error(`[sgp-language] init failed:`, e);
    }
    return true;
  },

  remove: async () => {
    restoreSpeechCmds();
    await restoreScripts();
  },
};

async function seedSamples(dir: string): Promise<void> {
  if (!import.meta.url.startsWith("file:")) return;
  const sampleDir = new URL("./languages", import.meta.url).pathname;
  try {
    for await (const entry of Deno.readDir(sampleDir)) {
      if (!entry.isFile || !entry.name.endsWith(".json")) continue;
      const src = dpath.join(sampleDir, entry.name);
      const dest = dpath.join(dir, entry.name);
      try { await Deno.stat(dest); continue; } catch { /* missing — copy */ }
      await Deno.copyFile(src, dest);
    }
  } catch { /* no bundled samples */ }
}

export default plugin;
