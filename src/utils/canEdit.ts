import type { IDBOBJ } from "../@types/IDBObj.ts";
import { flags } from "../services/flags/flags.ts";
import { evaluateLock, hydrate } from "./evaluateLock.ts";

export const canEdit = async (en: IDBOBJ, tar: IDBOBJ) => {
  if (en.flags.includes("superuser") || en.id === tar.id) return true;

  if (tar.data?.lock) {
      return await evaluateLock(tar.data.lock as string, hydrate(en), hydrate(tar));
  }

  // Fallback: Power check (legacy/simple)
  return (flags.lvl(en.flags) || 0) > (flags.lvl(tar.flags) || 0);
};
