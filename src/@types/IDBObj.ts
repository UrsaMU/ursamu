import { IAttribute } from "./IAttribute.ts";
import { IMStatEntry } from "./IMStatEntry.ts";

export interface IDBOBJ {
  _id?: string;
  id: number;
  description?: string;
  location?: number;
  flags: string;
  data?: {
    attributes?: { [key: string]: IAttribute };
    name?: string;
    password?: string;
    moniker?: string;
    stats?: IMStatEntry[];
    [key: string]: any;
  };
}
