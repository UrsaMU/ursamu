import type { IDBOBJ } from "../@types/IDBObj.ts";

/** Return the object's moniker (custom display name), falling back to its data name. */
export const moniker = (obj: IDBOBJ): string =>
  (obj.data?.moniker as string | undefined) || (obj.data?.name as string | undefined) || "";
