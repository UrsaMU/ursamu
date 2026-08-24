/**
 * @module @ursamu/cyberpunk-plugin
 *
 * Cyberpunk RED system plugin for UrsaMU.
 *
 * Phase 1 — commands.ts side-effect: addCmd at module load.
 * Phase 2 — init: help, REST, combat, vendor, jobs, GM bridge.
 * Phase 3 — remove: tear down every init subscription.
 */

import "./commands.ts";
import "./engine/hooks-augment.ts";

import type { IPlugin, SessionEvent } from "@ursamu/ursamu";
import { gameHooks, registerPluginRoute } from
  "@ursamu/ursamu";
import { registerHelpDir } from "@ursamu/help/register";
import { registerJobBuckets } from "@ursamu/jobs";
import { routeHandler } from "./routes.ts";
import {
  initCprCombat,
  removeCprCombat,
} from "./src/combat/ports.ts";
import {
  initVendorHooks,
  removeVendorHooks,
} from "./src/integrations/vendor.ts";
import {
  initApproveHooks,
  removeApproveHooks,
} from "./src/chargen/approve_hook.ts";
import { registerWithGM } from "./engine/gm-bridge.ts";

const onLogin = ({ actorName }: SessionEvent) => {
  // Luck pool / drug expiry handled lazily on first +sheet/+roll.
  void actorName;
};

export const plugin: IPlugin = {
  name: "cpr",
  version: "1.0.0",
  description:
    "Cyberpunk RED plugin for UrsaMU — sheets, chargen, " +
    "FNFF combat ports, cyberware, netrunning, markets, gigs.",
  dependencies: [
    { name: "help", version: ">=1.0.0" },
    { name: "vendor", version: ">=1.1.0" },
    { name: "combat", version: ">=0.8.0" },
    { name: "jobs", version: ">=1.0.0" },
  ],

  init: () => {
    registerHelpDir(
      new URL("./help", import.meta.url),
      "cpr",
    );
    registerJobBuckets(["CGEN", "SHEET"]);
    registerPluginRoute("/api/v1/cpr", routeHandler);
    initCprCombat();
    initVendorHooks();
    initApproveHooks();
    // CPR loads before ai-gm in many game configs — register now
    // AND again on engine:ready so the hook is never missed.
    registerWithGM();
    gameHooks.on("engine:ready", registerWithGM);
    gameHooks.on("player:login", onLogin);

    void import("@ursamu/site").then((mod) => {
      // deno-lint-ignore no-explicit-any
      const site = mod as any;
      site.registerSiteNav?.({
        id: "chargen",
        label: "Edgerunner",
        href: "/chargen",
        order: 35,
        require: "connected",
      });
      site.registerSiteNav?.({
        id: "play",
        label: "Play",
        href: "/play",
        order: 36,
        require: "connected",
      });
    }).catch(() => { /* site optional */ });

    return true;
  },

  remove: () => {
    gameHooks.off("player:login", onLogin);
    gameHooks.off("engine:ready", registerWithGM);
    removeApproveHooks();
    removeVendorHooks();
    removeCprCombat();
    void import("@ursamu/site").then((mod) => {
      // deno-lint-ignore no-explicit-any
      const site = mod as any;
      site.unregisterSiteNav?.("chargen");
      site.unregisterSiteNav?.("play");
    }).catch(() => { /* ignore */ });
  },
};

export default plugin;
