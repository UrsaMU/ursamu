// Phase 1 -- Module load: imports fire addCmd() and SplatRegistry.register() calls.
import "./commands.ts";
import "./hooks.ts";
// Splat registrations (order does not matter)
import "./splats/wta/index.ts";
import "./splats/mortal/index.ts";
import "./splats/kinfolk/index.ts";

import { gameHooks, registerFormatHandler, send, registerPluginRoute, unregisterFormatHandler } from "@ursamu/ursamu";
import * as ursamu from "@ursamu/ursamu";
import type { IPlugin, SessionEvent } from "@ursamu/ursamu";
import { setTheme, resetTheme } from "@ursamu/globals";
import { wod20thRouteHandler } from "./router.ts";
import { wod20thStatSystem } from "./statSystem.ts";
import { findByPlayer } from "./db/charDb.ts";
import { wod20thGlobalsOverlay } from "./core/globalsTheme.ts";
import { wodNameFormat } from "./core/nameFormat.ts";
import { wodConformatHandler } from "./core/lookConformat.ts";
import { registerPoseTracker, unregisterPoseTracker } from "./core/poseTracker.ts";

// -- player:login handler --------------------------------------------------

async function onLogin(e: SessionEvent): Promise<void> {
  try {
    const char = await findByPlayer(e.actorId);
    if (!char) return;
    if (char.status !== "submitted" && char.status !== "draft") return;

    const msg =
      char.status === "submitted"
        ? "%ch[WoD20th]%cn Your character is pending staff approval. Type %ch+sheet%cn to review it."
        : `%ch[WoD20th]%cn You have a character in progress (step ${char.chargenStep}/6). Type %ch+chargen%cn to continue.`;

    send([e.actorId], msg);
  } catch (_err) {
    // Non-fatal -- don't crash login if charDb is unavailable
  }
}

// -- Plugin lifecycle ------------------------------------------------------

export const plugin: IPlugin = {
  name: "wod20th",
  version: "1.0.0",
  description:
    "WoD20th character generation -- WtA, Mortal, and Kinfolk splats with guided step-based chargen, live budget feedback, and a full gameHooks event surface.",

  init: () => {
    // Engine export added in newer ursamu builds; tolerate older local
    // checkouts where the stat registry doesn't exist yet.
    const registerStatSystem = (ursamu as { registerStatSystem?: unknown }).registerStatSystem;
    if (typeof registerStatSystem === "function") registerStatSystem(wod20thStatSystem);
    registerPluginRoute("/api/v1/wod20th", wod20thRouteHandler);
    gameHooks.on("player:login", onLogin);
    setTheme(wod20thGlobalsOverlay).catch(() => { /* sgp not loaded -- ignore */ });
    registerFormatHandler("NAMEFORMAT", wodNameFormat);
    // Prepend so wod20th's 78-col, short-desc-truncating rows win
    // over the engine default CONFORMAT handler.
    registerFormatHandler(
      "CONFORMAT",
      wodConformatHandler,
      { prepend: true },
    );
    registerPoseTracker();

    // Soft-register our help directory with @ursamu/help-plugin if present.
    // Dynamic import keeps help-plugin optional -- wod20th still works without it.
    (async () => {
      try {
        const helpMod = await import("@ursamu/help-plugin");
        const dir = new URL("./help", import.meta.url).pathname;
        helpMod.registerHelpDir(dir, "wod20th");
        console.log("[wod20th] Registered help directory with help-plugin.");
      } catch (_err) {
        // help-plugin not installed -- silent fallback to engine's default lookup.
      }
    })();

    console.log("[wod20th] Plugin initialized -- +chargen, +sheet, +stat, +xp active.");
    return true;
  },

  remove: () => {
    gameHooks.off("player:login", onLogin);
    unregisterFormatHandler("NAMEFORMAT", wodNameFormat);
    unregisterFormatHandler("CONFORMAT", wodConformatHandler);
    unregisterPoseTracker();
    resetTheme().catch(() => { /* sgp not loaded -- ignore */ });
    console.log("[wod20th] Plugin removed.");
  },
};

export { wod20thStatSystem } from "./statSystem.ts";
export default plugin;
