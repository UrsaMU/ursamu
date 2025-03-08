import { IAttribute } from "./IAttribute.ts";
import { IMStatEntry } from "./IMStatEntry.ts";

export interface IDBOBJ {
  id: string;
  description?: string;
  location?: string;
  flags: string;
  data?: {
    attributes?: IAttribute[];
    name?: string;
    password?: string;
    moniker?: string;
    stats?: IMStatEntry[];
    [key: string]: any;
  };
}
