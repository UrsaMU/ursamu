import { gameHooks, type IDBObj } from "@ursamu/ursamu";
import type { CofdSheet } from "../stats/sheet.ts";

/**
 * Checks if a player has the CofD Language merit for a given language.
 */
function hasLanguageMerit(player: IDBObj, language: string): boolean {
  const state = player.state as { cofd?: CofdSheet };
  if (!state.cofd || !state.cofd.merits) return false;
  
  const searchKey = language.toLowerCase();
  for (const meritKey of Object.keys(state.cofd.merits)) {
    const meritLower = meritKey.toLowerCase();
    if (
      meritLower === searchKey ||
      meritLower === `language (${searchKey})` ||
      meritLower === `language: ${searchKey}` ||
      meritLower === `language:${searchKey}`
    ) {
      return true;
    }
  }
  return false;
}

const onGetActive = (ctx: { player: IDBObj; active?: string }) => {
  const state = ctx.player.state as { cofd?: CofdSheet };
  if (!state.cofd || !state.cofd.formState) return;
  
  const formSystem = state.cofd.formState.system;
  const currentForm = state.cofd.formState.current;

  // Force First Tongue for Werewolf Gauru and Urshul forms
  if (formSystem === "werewolf" && (currentForm === "gauru" || currentForm === "urshul")) {
    ctx.active = "first-tongue";
  }
};

const onGetSkill = (ctx: { player: IDBObj; language: string; skill: number }) => {
  if (hasLanguageMerit(ctx.player, ctx.language)) {
    ctx.skill = 100;
  }
};

const onGetKnown = (ctx: { player: IDBObj; known: Record<string, number> }) => {
  const state = ctx.player.state as { cofd?: CofdSheet };
  if (!state.cofd || !state.cofd.merits) return;
  
  for (const meritKey of Object.keys(state.cofd.merits)) {
    const meritLower = meritKey.toLowerCase();
    const m = meritLower.match(/^language\s*[:(]\s*([^)]+)\)?/);
    if (m) {
      const lang = m[1].trim();
      if (lang) {
        ctx.known[lang] = 100;
      }
    }
  }
};

export function initLangHooks() {
  gameHooks.on("language:get_active", onGetActive);
  gameHooks.on("language:get_skill", onGetSkill);
  gameHooks.on("language:get_known", onGetKnown);
}

export function removeLangHooks() {
  gameHooks.off("language:get_active", onGetActive);
  gameHooks.off("language:get_skill", onGetSkill);
  gameHooks.off("language:get_known", onGetKnown);
}
