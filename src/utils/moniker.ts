import { IDBOBJ } from "../@types/IDBObj";

export const moniker = (obj: IDBOBJ) => obj.data?.moniker || obj.data?.name;
