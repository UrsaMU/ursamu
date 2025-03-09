import { IAttribute } from "./IAttribute.ts";

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
    [key: string]: any;
  };
}
