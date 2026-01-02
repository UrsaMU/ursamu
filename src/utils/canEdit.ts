import type { IDBOBJ } from "../@types/IDBObj.ts";
import { flags } from "../services/flags/flags.ts";
import { evaluateLock } from "./evaluateLock.ts";

export const canEdit = async (en: IDBOBJ, tar: IDBOBJ) => {
  // If target has a lock, evaluate it.
  // Default logic: 
  // 1. If superuser, always yes.
  // 2. If same ID, always yes.
  // 3. If lock exists, evaluate it.
  // 4. Default to: Enactor power > Target power?
  
  if (en.flags.includes("superuser") || en.id === tar.id) return true;

  if (tar.data?.lock) {
      return await evaluateLock(tar.data.lock as string, en, tar);
  }

  // Fallback: Power check (legacy/simple)
  return (flags.lvl(en.flags) || 0) > (flags.lvl(tar.flags) || 0);
};
