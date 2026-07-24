export { plugin, plugin as default } from "./index.ts";
export { garble, tierFor } from "./src/garble.ts";
export { genWord, genSyllable, syllableCountFor } from "./src/phonemes.ts";
export { fnv1a, mulberry32, seedFor } from "./src/rng.ts";
export { validateLangDef } from "./src/schema.ts";
export type { LangDef, ValidationResult } from "./src/schema.ts";
export {
  clearLangs,
  getLang,
  getLanguagesDir,
  listLangs,
  loadLanguages,
  registerLangForTest,
  setLanguagesDir,
} from "./src/langStore.ts";
export type { LoadReport } from "./src/langStore.ts";
export {
  clampSkill,
  getPlayerLangs,
  setActive,
  setSkill,
  skillIn,
} from "./src/playerLangs.ts";
export type { PlayerLangs } from "./src/playerLangs.ts";
export type {
  LangGetActiveCtx,
  LangGetSkillCtx,
  LangGetKnownCtx,
  LangSkillChangedEvent,
  LangActiveChangedEvent,
} from "./src/hooks.ts";
export { emitLang } from "./src/hooks.ts";
