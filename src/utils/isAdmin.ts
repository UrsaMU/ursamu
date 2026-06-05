import type { IDBOBJ } from "../@types/IDBObj.ts";

export const isAdmin = (en: IDBOBJ): boolean => /wizard|admin|superuser|storyteller/i.test(en.flags);
