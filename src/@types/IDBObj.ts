import { IMStatEntry } from "./IMStatEntry";

export interface IDBOBJ {
  _id?: string;
  id: number;
  description?: string;
  location?: number;
  flags: string;
  data?: {
    name?: string;
    password?: string;
    moniker?: string;
    stats?: IMStatEntry[];
    [key: string]: any;
  };
}
