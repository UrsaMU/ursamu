// System registry — DB-stored ingested systems take precedence over bundled.
// Call loadCustomSystems() in plugin init() to hydrate DB systems on startup.

export {
  getGameSystem,
  getGameSystemNames,
  loadCustomSystems,
  registerGameSystem,
  saveCustomSystem,
} from "./store.ts";
export type { IGameSystem } from "./interface.ts";
