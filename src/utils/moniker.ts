import type { IDBOBJ } from "../@types/IDBObj.ts";

export const moniker = (obj: IDBOBJ) => obj.data?.moniker || obj.data?.name || "";

