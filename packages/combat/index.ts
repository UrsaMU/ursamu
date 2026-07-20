/**
 * @ursamu/combat plugin entry.
 *
 * Registers the JSON strategy brain and wires combat:decide to gameHooks.
 * Game systems still call registerCombatPorts() / registerEncounterStore().
 */
import { gameHooks, getConfig, type IPlugin } from "@ursamu/mush";
import {
  clearCombatBrains,
  jsonStrategyBrain,
  registerCombatBrain,
  unregisterCombatBrain,
} from "./src/brains.ts";
import { unregisterCombatPorts } from "./src/ports.ts";
import { unregisterEncounterStore } from "./src/store.ts";
import {
  wireCombatDecideHook,
  unwireCombatDecideHook,
} from "./src/hooks-wire.ts";
import {
  AI_STRATEGY_ERRORS,
  aiStrategyKeys,
} from "./src/ai/index.ts";
import { getCombatConfig, setCombatConfig } from "./src/config.ts";
import denoConfig from "./deno.json" with { type: "json" };

function applyHostConfig(): void {
  try {
    const brains = getConfig<string[]>("plugins.combat.brains");
    const defaultAiKey = getConfig<string>(
      "plugins.combat.defaultAiKey",
    );
    const enableDecideHook = getConfig<boolean>(
      "plugins.combat.enableDecideHook",
    );
    setCombatConfig({
      ...(Array.isArray(brains) ? { brains } : {}),
      ...(typeof defaultAiKey === "string"
        ? { defaultAiKey }
        : {}),
      ...(typeof enableDecideHook === "boolean"
        ? { enableDecideHook }
        : {}),
    });
  } catch {
    /* getConfig may throw if host not ready */
  }
}

export const plugin: IPlugin = {
  name: "combat",
  version: denoConfig.version,
  description:
    "System-agnostic combat engine — encounters, walker, JSON AI.",

  init: () => {
    wireCombatDecideHook(gameHooks);
    registerCombatBrain(jsonStrategyBrain);
    applyHostConfig();
    if (getCombatConfig().brains.length === 0) {
      setCombatConfig({ brains: ["json"] });
    }
    const n = aiStrategyKeys().length;
    const errs = AI_STRATEGY_ERRORS.length;
    const order = getCombatConfig().brains.join(",");
    console.log(
      `[combat] ready — ${n} JSON strategies, brains=[${order}]` +
        (errs ? `, ${errs} AI load error(s)` : ""),
    );
    if (errs) {
      for (const e of AI_STRATEGY_ERRORS) {
        console.warn(`[combat] AI load: ${e.file}: ${e.message}`);
      }
    }
    return true;
  },

  remove: () => {
    unregisterCombatBrain("json");
    clearCombatBrains();
    unregisterCombatPorts();
    unregisterEncounterStore();
    unwireCombatDecideHook();
  },
};

export default plugin;
