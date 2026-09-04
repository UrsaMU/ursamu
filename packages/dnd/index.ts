/**
 * @module @ursamu/dnd-plugin
 *
 * D&D 5e/2024 (SRD 5.2) system plugin for UrsaMU.
 *
 * Phase 1 — commands.ts side-effect: addCmd at module load.
 * Phase 2 — init: help, REST, combat, vendor, equipped, jobs.
 * Phase 3 — remove: tear down every init subscription.
 */

import "./commands.ts";

import type { IPlugin } from "@ursamu/mush";
import { registerHelpDir } from "@ursamu/help/register";
import { registerJobBuckets } from "@ursamu/jobs";
import { registerPluginRoute, gameHooks } from
  "@ursamu/mush";
import { routeHandler } from "./routes.ts";
import {
  initDndCombat,
  removeDndCombat,
} from "./src/combat/ports.ts";
import {
  initVendorHooks,
  removeVendorHooks,
} from "./src/integrations/vendor.ts";
import {
  initEquippedGuards,
  removeEquippedGuards,
} from "./src/integrations/equipped.ts";
import {
  initInventoryHook,
  removeInventoryHook,
} from "./src/commands/inventory.ts";
import {
  initApproveHooks,
  removeApproveHooks,
} from "./src/chargen/approve_hook.ts";
import {
  initLookUiHook,
  removeLookUiHook,
} from "./src/integrations/look-ui.ts";
import { seedCampaign } from "./src/world/campaign.ts";
import { listSkins } from "./src/adventure/skins.ts";
import { ensureUnderworld } from "./src/world/underworld.ts";

// Vendor commands come only from @ursamu/vendor-plugin (config /
// peer load). D&D supplies gold + spawn hooks via initVendorHooks.

const onEngineReady = () => {
  seedCampaign().then((r) => {
    if (!r.ok) {
      console.error(
        `[dnd] campaign seed failed: ${r.message}`,
      );
    } else {
      console.log(`[dnd] ${r.message}`);
    }
    const skins = listSkins().map((s) => s.slug).join(", ");
    console.log(
      `[dnd] adventure skins ready: ${skins} ` +
        `(+adv/delve <skin>)`,
    );
  }).catch((e: unknown) => {
    console.error("[dnd] campaign seed error:", e);
  });
  ensureUnderworld().then((id) => {
    console.log(`[dnd] underworld ready (#${id})`);
  }).catch((e: unknown) => {
    console.error("[dnd] underworld seed error:", e);
  });
};

export const plugin: IPlugin = {
  name: "dnd",
  version: "1.0.0",
  description:
    "D&D 5e/2024 (SRD 5.2) plugin for UrsaMU — sheets, " +
    "chargen with CGEN jobs, REST API, combat ports.",
  dependencies: [
    { name: "help", version: ">=1.0.0" },
    { name: "vendor", version: ">=1.1.0" },
    { name: "combat", version: ">=0.8.0" },
    { name: "jobs", version: ">=1.0.0" },
  ],

  init: () => {
    registerHelpDir(new URL("./help", import.meta.url), "dnd");
    registerJobBuckets(["CGEN", "SHEET"]);
    registerPluginRoute("/api/v1/dnd", routeHandler);
    initDndCombat();
    initVendorHooks();
    initEquippedGuards();
    initInventoryHook();
    initApproveHooks();
    initLookUiHook();
    gameHooks.on("engine:ready", onEngineReady);
    // Public site: Character tab when signed in (soft API).
    void import("@ursamu/site").then((mod) => {
      // deno-lint-ignore no-explicit-any
      const site = mod as any;
      site.registerSiteNav?.({
        id: "chargen",
        label: "Character",
        href: "/chargen",
        order: 35,
        require: "connected",
      });
    }).catch(() => { /* site plugin optional */ });
    return true;
  },

  remove: () => {
    gameHooks.off("engine:ready", onEngineReady);
    removeApproveHooks();
    removeLookUiHook();
    removeInventoryHook();
    removeEquippedGuards();
    removeVendorHooks();
    removeDndCombat();
    void import("@ursamu/site").then((mod) => {
      // deno-lint-ignore no-explicit-any
      const site = mod as any;
      site.unregisterSiteNav?.("chargen");
    }).catch(() => { /* ignore */ });
  },
};

export default plugin;
