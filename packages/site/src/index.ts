/**
 * @ursamu/site — public game front-end shell (player-facing).
 *
 * Serves layout + design.md tokens + swappable skins under /site/.
 */

// Prefer @ursamu/mush so registerPluginRoute shares the game's mush
// graph (not a nested jsr:@ursamu/mush pin from this package's imports).
import { registerPluginRoute } from "@ursamu/mush";
import type { IPlugin } from "@ursamu/mush";
import {
  applySkinDefaults,
  readSiteConfig,
} from "./config.ts";
import { setSiteRuntime, siteStaticHandler } from "./static.ts";
import { scanInstalledThemes } from "./themes.ts";

async function loadGameConfig(): Promise<unknown> {
  try {
    const raw = await Deno.readTextFile("config/config.json");
    return JSON.parse(raw);
  } catch {
    try {
      const raw = await Deno.readTextFile(
        "config/config.sample.json",
      );
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
}

export const plugin: IPlugin = {
  name: "site",
  version: "0.1.7",
  description:
    "Public front-end shell — layout framing + design tokens + skins.",

  init: async () => {
    const game = await loadGameConfig();
    let cfg = readSiteConfig(game);

    // Do not force plugins.site.title from game.name — empty title
    // + no bannerImage means compact layout (content under nav).
    // Nav brand falls back in injectSiteHtml / site.js.
    if (!cfg.skin && !cfg.skinCss) {
      cfg.skin = "default";
    }

    cfg = applySkinDefaults(cfg);
    // Load zip-installed themes from theme/installed/
    try {
      await scanInstalledThemes(Deno.cwd());
    } catch {
      /* optional */
    }
    setSiteRuntime(cfg);

    const mount = (cfg.mount ?? "/site").replace(/\/$/, "") ||
      "/site";

    // Static tree + config.json
    registerPluginRoute(mount, siteStaticHandler);
    // Always also bind /site for asset URLs in CSS
    if (mount !== "/site") {
      registerPluginRoute("/site", siteStaticHandler);
    }
    if (cfg.serveRoot) {
      // Exact home + SPA prefixes (must not use bare "/" as
      // startsWith catch-all — that would steal /admin, /api).
      registerPluginRoute("/", siteStaticHandler);
      registerPluginRoute("/login", siteStaticHandler);
      registerPluginRoute("/profile", siteStaticHandler);
      registerPluginRoute("/wiki", siteStaticHandler);
    }

    const skinLabel = cfg.skinCss ?? cfg.skin ?? "default";
    const rootNote = cfg.serveRoot ? " + / (serveRoot)" : "";
    console.log(
      `[site] Public FE at ${mount}/${rootNote} (skin=${skinLabel})`,
    );
    return true;
  },

  remove: () => {
    /* routes are process-lifetime */
  },
};

export default plugin;
