import type { IDBOBJ } from "@ursamu/mush";

export const isAdmin = (en: IDBOBJ): boolean => /wizard|admin|superuser|storyteller/i.test(en.flags);
