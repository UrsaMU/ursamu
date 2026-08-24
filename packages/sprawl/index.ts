/**
 * @module @ursamu/sprawl-plugin
 * Sprawl Goons: Upgraded — 2d6 cyberpunk for UrsaMU.
 */
import "./commands.ts";

import type { IPlugin, SessionEvent } from "@ursamu/ursamu";
import { gameHooks, registerPluginRoute } from "@ursamu/ursamu";
import { registerHelpDir } from "@ursamu/help/register";
import { registerJobBuckets } from "@ursamu/jobs";
import { routeHandler } from "./routes.ts";
import { sprawlSystem } from "./engine/gm-bridge.ts";
import { getChar } from "./engine/sheet-io.ts";
import { dbojs } from "@ursamu/ursamu";
import {
  initInventoryHooks,
  removeInventoryHooks,
} from "./integrations/inventory.ts";
import {
  initObjectUseHooks,
  removeObjectUseHooks,
} from "./integrations/object-use.ts";
import {
  initLookHooks,
  removeLookHooks,
} from "./integrations/look.ts";
import {
  initApproveHooks,
  removeApproveHooks,
} from "./chargen/approve_hook.ts";
import {
  initMissionJobHooks,
  removeMissionJobHooks,
} from "./integrations/mission-jobs.ts";
import {
  registerSprawlStaffNav,
  unregisterSprawlStaffNav,
} from "./src/staff-nav-bridge.ts";

const onLogin = async ({ actorId }: SessionEvent) => {
  try {
    const obj = await dbojs.queryOne({ id: actorId });
    if (!obj) return;
    // deno-lint-ignore no-explicit-any
    const c = getChar(obj as any);
    if (!c) return;
    if (
      c.chargenStatus === "draft" ||
      c.chargenStatus === "revision"
    ) {
      const note = c.reviewNote
        ? `Revision: ${c.reviewNote}`
        : "Chargen in progress.";
      gameHooks.emit("player:notify" as never, {
        actorId,
        message:
          `[Sprawl] ${note} Use %ch+chargen%cn.`,
      });
    } else if (c.chargenStatus === "submitted") {
      const job = c.submittedJob != null
        ? ` (CGEN #${c.submittedJob})`
        : "";
      gameHooks.emit("player:notify" as never, {
        actorId,
        message:
          `[Sprawl] Sheet pending staff review${job}.`,
      });
    }
  } catch {
    /* best-effort */
  }
};

const onReady = () => {
  registerHelpDir(
    new URL("./help", import.meta.url),
    "sprawl",
  );
  // deno-lint-ignore no-explicit-any
  (gameHooks as any).emit?.("gm:system:register", {
    system: sprawlSystem,
    events: [
      { name: "sprawl:roll", cue: "Sprawl action roll" },
      { name: "sprawl:combat", cue: "Sprawl combat" },
    ],
  });
};

export const plugin: IPlugin = {
  name: "sprawl",
  version: "1.0.0",
  description:
    "Sprawl Goons: Upgraded — chargen, sheets, 2d6 action/combat, " +
    "hacking, vehicles, Flow atlas, street market.",
  dependencies: [
    { name: "help", version: ">=1.0.0" },
    { name: "jobs", version: ">=1.0.0" },
    { name: "mail", version: ">=2.5.0" },
  ],

  init: () => {
    registerPluginRoute("/api/v1/sprawl", routeHandler);
    registerJobBuckets(["CGEN", "SHEET", "MISSION", "RUN", "GIG"]);
    gameHooks.on("player:login", onLogin);
    gameHooks.on("engine:ready", onReady);
    initInventoryHooks();
    initObjectUseHooks();
    initLookHooks();
    initApproveHooks();
    initMissionJobHooks();
    void registerSprawlStaffNav();
    // Also register help immediately if help already up
    try {
      registerHelpDir(
        new URL("./help", import.meta.url),
        "sprawl",
      );
    } catch {
      /* engine:ready retry */
    }
    return true;
  },

  remove: () => {
    void unregisterSprawlStaffNav();
    gameHooks.off("player:login", onLogin);
    gameHooks.off("engine:ready", onReady);
    removeInventoryHooks();
    removeObjectUseHooks();
    removeLookHooks();
    removeApproveHooks();
    removeMissionJobHooks();
  },
};

export default plugin;
