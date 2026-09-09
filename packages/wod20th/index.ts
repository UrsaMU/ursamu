// Phase 1 -- Module load: imports fire addCmd() and SplatRegistry.register().
import "./commands.ts";
import "./hooks.ts";
// Splat registrations (order does not matter)
import "./splats/wta/index.ts";
import "./splats/mortal/index.ts";
import "./splats/kinfolk/index.ts";

import {
  gameHooks,
  registerFormatHandler,
  send,
  registerPluginRoute,
  unregisterFormatHandler,
} from "@ursamu/mush";
import * as ursamu from "@ursamu/mush";
import type { IPlugin, SessionEvent } from "@ursamu/mush";
import { wod20thRouteHandler } from "./router.ts";
import { wod20thStatSystem } from "./statSystem.ts";
import { findByPlayer } from "./db/charDb.ts";
import { wod20thGlobalsOverlay } from "./core/globalsTheme.ts";
import { wodNameFormat } from "./core/nameFormat.ts";
import { wodConformatHandler } from "./core/lookConformat.ts";
import {
  registerPoseTracker,
  unregisterPoseTracker,
} from "./core/poseTracker.ts";

// -- player:login handler --------------------------------------------------

async function onLogin(e: SessionEvent): Promise<void> {
  try {
    const char = await findByPlayer(e.actorId);
    if (!char) return;
    if (char.status !== "submitted" && char.status !== "draft") return;

    const msg = char.status === "submitted"
      ? "%ch[WoD20th]%cn Your character is pending staff approval. " +
        "Type %ch+sheet%cn to review it."
      : `%ch[WoD20th]%cn You have a character in progress ` +
        `(step ${char.chargenStep}/6). Type %ch+chargen%cn to continue.`;

    send([e.actorId], msg);
  } catch (_err) {
    // Non-fatal -- don't crash login if charDb is unavailable
  }
}

/**
 * Optional sgp theme -- resolved only if the host import-maps
 * `@ursamu/globals`. Never a static/JSR dependency.
 */
async function trySetTheme(): Promise<void> {
  try {
    const spec = ["@", "ursamu", "/", "globals"].join("");
    const g = await import(/* @vite-ignore */ spec);
    await g.setTheme?.(wod20thGlobalsOverlay);
  } catch {
    /* sgp not loaded */
  }
}

async function tryResetTheme(): Promise<void> {
  try {
    const spec = ["@", "ursamu", "/", "globals"].join("");
    const g = await import(/* @vite-ignore */ spec);
    await g.resetTheme?.();
  } catch {
    /* sgp not loaded */
  }
}

// -- Plugin lifecycle ------------------------------------------------------

export const plugin: IPlugin = {
  name: "wod20th",
  version: "1.1.0",
  description:
    "WoD20th character generation -- WtA, Mortal, and Kinfolk splats " +
    "with guided step-based chargen, live budget feedback, and hooks.",

  init: () => {
    const registerStatSystem =
      (ursamu as { registerStatSystem?: unknown }).registerStatSystem;
    if (typeof registerStatSystem === "function") {
      registerStatSystem(wod20thStatSystem);
    }
    registerPluginRoute("/api/v1/wod20th", wod20thRouteHandler);
    gameHooks.on("player:login", onLogin);
    trySetTheme();
    registerFormatHandler("NAMEFORMAT", wodNameFormat);
    registerFormatHandler(
      "CONFORMAT",
      wodConformatHandler,
      { prepend: true },
    );
    registerPoseTracker();

    (async () => {
      try {
        const helpMod = await import("@ursamu/help/register");
        const dir = new URL("./help", import.meta.url).pathname;
        helpMod.registerHelpDir(dir, "wod20th");
        console.log(
          "[wod20th] Registered help directory with help-plugin.",
        );
      } catch (_err) {
        // help-plugin not installed
      }
    })();

    console.log(
      "[wod20th] Plugin initialized -- +chargen, +sheet, +stat, +xp.",
    );
    return true;
  },

  remove: () => {
    gameHooks.off("player:login", onLogin);
    unregisterFormatHandler("NAMEFORMAT", wodNameFormat);
    unregisterFormatHandler("CONFORMAT", wodConformatHandler);
    unregisterPoseTracker();
    tryResetTheme();
    console.log("[wod20th] Plugin removed.");
  },
};

export { wod20thStatSystem } from "./statSystem.ts";
export default plugin;
