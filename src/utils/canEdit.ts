import type { IDBOBJ } from "../@types/IDBObj.ts";

export const canEdit = async (en: IDBOBJ, tar: IDBOBJ): Promise<boolean> => {
  if (!en || !tar) return false;
  if (/superuser/i.test(en.flags)) return true;
  if (/admin|wizard/i.test(en.flags)) return true;
  const owner = tar.data?.owner as string | undefined;
  if (owner && owner === en.id) return true;
  return en.id === tar.id;
};
